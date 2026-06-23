import { buildPairs, type ReinigungSettings } from "@/lib/utils";
import { msToHours } from "@/lib/mcp/format";

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
 *  "image-conflict" = Bild widerspricht dem Label (das Bild gewinnt). */
export type DeviceConfidence = "declared" | "image-confirmed" | "image-conflict";

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

/** Versöhnt deklariertes Gerät mit der Bildkontrolle: bei Konflikt gewinnt das Bild.
 *  Cluster-Softening (Mismatch innerhalb eines Lookalike-Clusters ≠ echter Konflikt) macht
 *  bewusst NICHT diese Schicht, sondern der Consumer (ledger.ts) — segments bleibt rein. */
function reconcileDevice(declared: DeviceRef, controls: LinkedControl[]): { verified: DeviceRef | null; confidence: DeviceConfidence } {
  // Jüngste Kontrolle mit verwertbarem Geräte-Check (ok | wrong + erkanntes Gerät).
  const decisive = controls.findLast(
    (c) => (c.deviceCheckStatus === "ok" || c.deviceCheckStatus === "wrong") && c.detected != null,
  );
  if (!decisive) return { verified: null, confidence: "declared" };
  if (decisive.deviceCheckStatus === "ok") {
    // "confirmed" heisst: verifiziert === deklariert (DeviceRef ist hier immutable).
    return { verified: declared, confidence: "image-confirmed" };
  }
  // wrong → Bild gewinnt, Konflikt markieren (Cluster-Entschärfung erfolgt downstream).
  return { verified: { id: null, name: decisive.detected }, confidence: "image-conflict" };
}

/** Zerlegt EIN buildPairs-Pair (eine Session) in seine Segmente. */
function segmentsOfPair(pair: Pair, controls: SegmentEntry[], now: Date): Segment[] {
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
    const { verified, confidence } = reconcileDevice(declared, linked);
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
      endedBy: isLast ? (end ? "session-end" : "open") : "cleaning",
      controls: linked,
    });
  }
  return out;
}

/** Summiert die Segment-Tragezeit je Gerät zur deviceBreakdown der Session. */
function breakdownOf(segments: Segment[]): DeviceBreakdownRow[] {
  const msByDevice = new Map<string, { deviceId: string | null; deviceName: string | null; ms: number }>();
  for (const s of segments) {
    const key = deviceGroupKey(s.deviceDeclared);
    const row = msByDevice.get(key) ?? { deviceId: s.deviceDeclared.id, deviceName: s.deviceDeclared.name, ms: 0 };
    row.ms += s.durationMs;
    msByDevice.set(key, row);
  }
  return [...msByDevice.values()]
    .map((r) => ({ deviceId: r.deviceId, deviceName: r.deviceName, hours: msToHours(r.ms) }))
    .sort((a, b) => b.hours - a.hours);
}

/** Baut die vollständigen KG-Sessions (mit Segmenten + deviceBreakdown), neueste zuerst.
 *  `entries` sind dieselben, die buildOverview/listSessions ohnehin laden (inkl. device-Include
 *  mit id/name/categoryId und den deviceCheck-Feldern auf PRUEFUNG-Entries). */
export function buildSessions(entries: SegmentEntry[], reinigung: ReinigungSettings, now: Date = new Date()): Session[] {
  const pairs = buildPairs<SegmentEntry, never>(entries, [], reinigung);
  // Einmal chronologisch sortieren; linkControls filtert je Segment ordnungserhaltend.
  const controls = entries
    .filter((e) => e.type === "PRUEFUNG")
    .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

  return pairs.map((pair) => {
    const segments = segmentsOfPair(pair, controls, now);
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
