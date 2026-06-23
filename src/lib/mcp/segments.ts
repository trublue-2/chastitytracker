import { buildPairs, type ReinigungSettings } from "@/lib/utils";
import { msToHours } from "@/lib/mcp/format";
import type { DeviceMeta } from "@/lib/mcp/common";

/**
 * MCP V2 — „Abgeleitete Wahrheit": eine KG-Session zerfällt an REINIGUNG-Öffnungen in Segmente,
 * pro Segment GENAU EIN getragenes Gerät. Damit ist die „welches Gerät war Session X?"-Frage
 * korrekt als `deviceBreakdown` beantwortbar (z.B. 103 h = Flatty 66 / Kink-Knack 28 / Pink S 10).
 *
 * Rein lesend & berechnet — KEINE Persistenz, KEIN Eingriff in Tracker-Kernlogik. Setzt nur auf
 * dem bestehenden `buildPairs` (geteilt mit dem Tracker, hier nur konsumiert) auf.
 *
 * Segment-/Session-IDs sind die jeweilige Lock-Entry-id (stabil, ohne neue Tabelle) — so kann
 * eine NoteRef.entityId zuverlässig auf ein Segment bzw. eine Session zeigen.
 */

/** Minimal-Form eines Entrys, wie ihn buildOverview/listSessions bereits laden. */
export interface SegmentEntry {
  id: string;
  type: string;
  startTime: Date;
  oeffnenGrund?: string | null;
  kontrollCode?: string | null;
  verifikationStatus?: string | null;
  deviceCheck?: string | null;
  deviceCheckNote?: string | null;
  deviceCheckExpected?: string | null;
  device?: { id?: string | null; name?: string | null; categoryId?: string | null } | null;
}

export interface DeviceRef {
  id: string | null;
  name: string | null;
}

/** Eine Kontrolle (PRUEFUNG), die zeitlich in ein Segment fällt. */
export interface LinkedControl {
  controlId: string;
  time: Date;
  code: string | null;
  verifikationStatus: string | null;
  /** Dreiwertig: ok | wrong | missing | null (nicht geprüft). */
  deviceCheckStatus: string | null;
  detected: string | null;
  expected: string | null;
}

/** "declared" = nur Label; "image-confirmed" = Bild bestätigt das Label;
 *  "image-conflict" = Bild widerspricht dem Label aus EINEM ANDEREN Cluster → das Bild gewinnt
 *    (deviceEffective = verifiziert); "cluster-ambiguous" = Bild nennt ein optisch gleiches Gerät
 *    aus DEMSELBEN lookalikeCluster → unzuverlässig, soft, deklariert bleibt (kein echter Konflikt). */
export type DeviceConfidence = "declared" | "image-confirmed" | "image-conflict" | "cluster-ambiguous";

export interface Segment {
  /** Lock-Entry-id des Segment-Kopfs — stabile Segment-id (für NoteRef). */
  id: string;
  sessionId: string;
  index: number;
  start: Date;
  /** null = Segment noch offen (laufende Session, letztes Segment). */
  end: Date | null;
  durationMs: number;
  /** Deklariertes (am Lock-Entry hinterlegtes) Gerät dieses Segments. */
  deviceDeclared: DeviceRef;
  /** Aus Bildkontrollen abgeleitetes Gerät; null, wenn keine aussagekräftige Kontrolle vorliegt. */
  deviceVerified: DeviceRef | null;
  deviceConfidence: DeviceConfidence;
  /** Das für Tragezeit-Zurechnung MASSGEBLICHE Gerät: bei echtem image-conflict das verifizierte
   *  (Bild gewinnt), sonst das deklarierte. deviceBreakdown + device_stats rechnen hierauf. */
  deviceEffective: DeviceRef;
  /** Wie das Segment endete: cleaning = Reinigungspause folgt; session-end = Session zu Ende; open = läuft. */
  endedBy: "cleaning" | "session-end" | "open";
  controls: LinkedControl[];
}

export interface DeviceBreakdownRow {
  deviceId: string | null;
  deviceName: string | null;
  hours: number;
}

export interface Session {
  /** Lock-Entry-id des Session-Kopfs — stabile Session-id (für NoteRef). */
  id: string;
  start: Date;
  end: Date | null;
  isOpen: boolean;
  /** Interruption-bereinigte Tragedauer (Summe der Segment-Dauern, Pausen exkludiert). */
  durationMs: number;
  endReason: "open" | "closed";
  segments: Segment[];
  /** Tragestunden je Gerät über die ganze Session — die korrekte Antwort auf "welches Gerät". */
  deviceBreakdown: DeviceBreakdownRow[];
  /** Anzahl Reinigungspausen (= Segment-Grenzen innerhalb der Session). */
  cleaningPauses: number;
}

type Pair = ReturnType<typeof buildPairs<SegmentEntry, never>>[number];

const deviceRefOf = (e: SegmentEntry): DeviceRef => ({
  id: e.device?.id ?? null,
  name: e.device?.name ?? null,
});

/** Gruppierungs-Schlüssel je Gerät (id, sonst Name-Fallback) — geteilt von deviceBreakdown + device_stats. */
export const deviceGroupKey = (d: DeviceRef): string => d.id ?? `name:${d.name ?? "—"}`;

/** Anzeigename eines Geräts; legacy-/untracked-Segmente ohne Zuordnung klar labeln statt null/null. */
export const UNASSIGNED_DEVICE_LABEL = "(ohne Gerät / unzugeordnet)";
export const deviceDisplayName = (d: DeviceRef): string | null => d.name ?? (d.id ? null : UNASSIGNED_DEVICE_LABEL);

/** Das für die Tragezeit-Zurechnung massgebliche Gerät: bei echtem image-conflict gewinnt das Bild
 *  (verifiziert ist dort garantiert gesetzt), sonst das deklarierte. EINE Quelle dieser Regel. */
export const effectiveDevice = (declared: DeviceRef, verified: DeviceRef | null, confidence: DeviceConfidence): DeviceRef =>
  confidence === "image-conflict" ? verified! : declared;

/** Mappt die in dieses Segment fallenden PRUEFUNG-Entries auf LinkedControl.
 *  `controls` ist bereits chronologisch aufsteigend sortiert (einmal in buildSessions). */
function linkControls(controls: SegmentEntry[], start: Date, end: Date | null, now: Date): LinkedControl[] {
  const upper = (end ?? now).getTime();
  return controls
    .filter((c) => c.startTime.getTime() >= start.getTime() && c.startTime.getTime() <= upper)
    .map((c) => ({
      controlId: c.id,
      time: c.startTime,
      code: c.kontrollCode ?? null,
      verifikationStatus: c.verifikationStatus ?? null,
      deviceCheckStatus: c.deviceCheck ?? null,
      detected: c.deviceCheckNote ?? null,
      expected: c.deviceCheckExpected ?? null,
    }));
}

/** Lookups zur Geräte-Auflösung: Name→id und id→Cluster (für die Bild-Versöhnung). */
interface DeviceLookups {
  idByName: Map<string, string>;
  clusterById: Map<string, string | null>;
}

const normalizeName = (s: string) => s.trim().toLowerCase();

function buildDeviceLookups(devices: DeviceMeta[]): DeviceLookups {
  const idByName = new Map<string, string>();
  const ambiguous = new Set<string>();
  const clusterById = new Map<string, string | null>();
  for (const d of devices) {
    const key = normalizeName(d.name);
    // Mehrdeutige Namen (zwei Geräte gleichen Namens) → unauflösbar, statt still last-wins.
    if (idByName.has(key) && idByName.get(key) !== d.id) ambiguous.add(key);
    else idByName.set(key, d.id);
    clusterById.set(d.id, d.lookalikeClusterId);
  }
  for (const k of ambiguous) idByName.delete(k);
  return { idByName, clusterById };
}

/** Versöhnt deklariertes Gerät mit der Bildkontrolle. Bei "wrong" entscheidet der Lookalike-Cluster:
 *  - erkanntes & deklariertes Gerät im SELBEN Cluster → Bild ist unzuverlässig (optisch gleich) →
 *    soft `cluster-ambiguous`, deklariert bleibt massgeblich (kein echter Konflikt, §3.1/§5.3).
 *  - sonst (anderer/kein Cluster) → echter `image-conflict`, das Bild gewinnt → verifiziertes Gerät
 *    (mit aufgelöster id) ist massgeblich. */
function reconcileDevice(
  declared: DeviceRef,
  controls: LinkedControl[],
  lookups: DeviceLookups,
): { verified: DeviceRef | null; confidence: DeviceConfidence } {
  // Jüngste Kontrolle mit verwertbarem Geräte-Check (ok | wrong + erkanntes Gerät).
  const decisive = controls.findLast(
    (c) => (c.deviceCheckStatus === "ok" || c.deviceCheckStatus === "wrong") && c.detected != null,
  );
  if (!decisive) return { verified: null, confidence: "declared" };
  if (decisive.deviceCheckStatus === "ok") return { verified: declared, confidence: "image-confirmed" };
  // wrong: erkannten Namen auf eine Device-id zurückmappen (sonst null = unbekanntes Gerät).
  const detectedId = lookups.idByName.get(normalizeName(decisive.detected!)) ?? null;
  const verified: DeviceRef = { id: detectedId, name: decisive.detected };
  const declaredCluster = declared.id ? lookups.clusterById.get(declared.id) : null;
  const detectedCluster = detectedId ? lookups.clusterById.get(detectedId) : null;
  // Optisch gleiches Gerät aus demselben Cluster → Bild unzuverlässig, deklariert bleibt (soft).
  if (declaredCluster && detectedCluster && declaredCluster === detectedCluster) {
    return { verified, confidence: "cluster-ambiguous" };
  }
  // Echter Konflikt über Cluster-Grenze → Bild gewinnt (deviceEffective greift das via Helper auf).
  return { verified, confidence: "image-conflict" };
}

/** Zerlegt EIN buildPairs-Pair (eine Session) in seine Segmente. */
function segmentsOfPair(pair: Pair, controls: SegmentEntry[], now: Date, lookups: DeviceLookups): Segment[] {
  const sessionId = pair.verschluss.id;
  const heads: SegmentEntry[] = [pair.verschluss, ...pair.interruptions.map((i) => i.verschluss)];
  const out: Segment[] = [];

  for (let k = 0; k < heads.length; k++) {
    const head = heads[k];
    const isLast = k === pair.interruptions.length;
    // Segment endet an der nächsten Reinigungsöffnung, sonst am Session-Ende (oder offen).
    const end: Date | null = isLast
      ? (pair.oeffnen ? pair.oeffnen.startTime : null)
      : pair.interruptions[k].oeffnen.startTime;
    const linked = linkControls(controls, head.startTime, end, now);
    const declared = deviceRefOf(head);
    const { verified, confidence } = reconcileDevice(declared, linked, lookups);
    const effectiveEnd = (end ?? now).getTime();
    out.push({
      id: head.id,
      sessionId,
      index: k,
      start: head.startTime,
      end,
      durationMs: Math.max(0, effectiveEnd - head.startTime.getTime()),
      deviceDeclared: declared,
      deviceVerified: verified,
      deviceConfidence: confidence,
      deviceEffective: effectiveDevice(declared, verified, confidence),
      endedBy: isLast ? (end ? "session-end" : "open") : "cleaning",
      controls: linked,
    });
  }
  return out;
}

/** Summiert die Segment-Tragezeit je Gerät zur deviceBreakdown der Session — nach dem
 *  MASSGEBLICHEN Gerät (deviceEffective), damit "Bild gewinnt" bei echtem Konflikt durchschlägt. */
function breakdownOf(segments: Segment[]): DeviceBreakdownRow[] {
  const msByDevice = new Map<string, { deviceId: string | null; deviceName: string | null; ms: number }>();
  for (const s of segments) {
    const key = deviceGroupKey(s.deviceEffective);
    const row = msByDevice.get(key) ?? { deviceId: s.deviceEffective.id, deviceName: s.deviceEffective.name, ms: 0 };
    row.ms += s.durationMs;
    msByDevice.set(key, row);
  }
  return [...msByDevice.values()]
    .map((r) => ({ deviceId: r.deviceId, deviceName: deviceDisplayName({ id: r.deviceId, name: r.deviceName }), hours: msToHours(r.ms) }))
    .sort((a, b) => b.hours - a.hours);
}

/** Baut die vollständigen KG-Sessions (mit Segmenten + deviceBreakdown), neueste zuerst.
 *  `entries` sind dieselben, die buildOverview/listSessions ohnehin laden. `devices` liefert die
 *  Name↔id-Auflösung + Lookalike-Cluster für die Bild-Versöhnung (leer = keine Cluster-Softening). */
export function buildSessions(entries: SegmentEntry[], reinigung: ReinigungSettings, now: Date = new Date(), devices: DeviceMeta[] = []): Session[] {
  const pairs = buildPairs<SegmentEntry, never>(entries, [], reinigung);
  const lookups = buildDeviceLookups(devices);
  // Einmal chronologisch sortieren; linkControls filtert je Segment ordnungserhaltend.
  const controls = entries
    .filter((e) => e.type === "PRUEFUNG")
    .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

  return pairs.map((pair) => {
    const segments = segmentsOfPair(pair, controls, now, lookups);
    const isOpen = pair.active && pair.oeffnen === null;
    const durationMs = segments.reduce((s, seg) => s + seg.durationMs, 0);
    return {
      id: pair.verschluss.id,
      start: pair.verschluss.startTime,
      end: pair.oeffnen ? pair.oeffnen.startTime : null,
      isOpen,
      durationMs,
      endReason: isOpen ? "open" : "closed",
      segments,
      deviceBreakdown: breakdownOf(segments),
      cleaningPauses: pair.interruptions.length,
    };
  });
}
