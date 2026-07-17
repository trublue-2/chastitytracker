import { buildSessions, buildWearSessions, type Session, type Segment, type LinkedControl } from "@/lib/sessionModel";
import { msToHours } from "@/lib/utils";
import { resolveUserId, makeIso, buildEnvelope, notesForEntities, entityKey, loadTrackingData, loadCategoryNames, type Envelope, type Iso, type NoteDTO, type EntityRef } from "@/lib/mcp/common";

/** get_session — Sessions als abgeleitete Wahrheit: Segmente + deviceBreakdown + Inline-Notes
 *  + Daten-Qualitäts-Flags. Rein lesend, MCP-only.
 *
 *  Über ALLE Kategorien: KG (mit Reinigungspausen, Segmenten, Bild-Versöhnung) und die Trage-
 *  Kategorien (Plug, Halsband, Knebel — je ein Segment, Gerät wie deklariert). Bis v4.50.37 gab es
 *  Nicht-KG-Sessions hier gar nicht; das einzige Tool, das sie je auflistete, fiel mit V1 weg. */

export interface SegmentView {
  id: string;
  index: number;
  start: string;
  end: string | null;
  durationHours: number;
  /** Ganzzahlige Minuten (N-12, MCP-Restliste 2026-07-17): Einträge sind minutengenau erfasst
   *  (Systemzeiten sekundengenau — die Klassen mischen sich). Ein Wechsel-in-unter-einer-Minute
   *  kollabiert deshalb auf durationHours: 0; durationMinutes macht solche kurzen Segmente sichtbar
   *  ("0 Stunden" ≠ "gar nicht passiert"). Bewusste Design-Entscheidung, Minute beizubehalten. */
  durationMinutes: number;
  deviceDeclared: { id: string | null; name: string | null };
  deviceVerified: { id: string | null; name: string | null } | null;
  /** Massgebliches Gerät für die Tragezeit-Zurechnung (Bild bei echtem Konflikt, sonst deklariert). */
  deviceEffective: { id: string | null; name: string | null };
  deviceConfidence: Segment["deviceConfidence"];
  endedBy: Segment["endedBy"];
  controls: { id: string; time: string; code: string | null; verifikationStatus: string | null; deviceCheck: DeviceCheckView; detected: string | null; expected: string | null; notes: NoteDTO[] }[];
  notes: NoteDTO[];
}

/** Bild-gegen-Deklaration-Kontrolle einer PRUEFUNG (N-4/N-11, MCP-Restliste 2026-07-17).
 *  `status`: "ok" (Bild bestätigt) | "wrong" (Bild widerspricht der DEKLARATION) | "missing" (kein Gerät
 *  erkannt) | "not_checked" (nicht geprüft — ersetzt das frühere mehrdeutige `null`).
 *  `isOffense` ist IMMER false: ein deviceCheck vergleicht Bild vs. Deklaration, NICHT gegen eine
 *  request_lock-Anforderung — er erzeugt nie ein `wrong_device`-Vergehen (§6/§10). "wrong" heisst
 *  „Deklaration stimmt nicht mit dem Bild", nicht „Vergehen". Der genaue Grund für "not_checked"
 *  (keine Referenzbilder / Bild unbrauchbar / nicht angefordert) wird derzeit nicht unterschieden. */
export interface DeviceCheckView {
  status: "ok" | "wrong" | "missing" | "not_checked";
  isOffense: false;
}

/** Normalisiert den rohen `deviceCheckStatus` (string|null) auf die vier stabilen Stufen — jeder
 *  unbekannte Wert (und null) wird zu "not_checked", statt einen ungültigen Rohwert per Cast in den
 *  Enum durchzureichen (N-11). */
function normalizeDeviceCheckStatus(raw: string | null): DeviceCheckView["status"] {
  return raw === "ok" || raw === "wrong" || raw === "missing" ? raw : "not_checked";
}

export interface SessionView {
  id: string;
  /** Kategorie der Session („KG", „Plug", „Halsband" …). */
  category: string | null;
  start: string;
  end: string | null;
  isOpen: boolean;
  /** True nur für die "zwei Schliess-Einträge ohne Öffnen dazwischen"-Anomalie (buildPairs). Dann
   *  ist `isOpen:true` technisch korrekt (Invariant), aber KEINE echte aktuell laufende Session —
   *  siehe auch `dataQualityFlags`. */
  orphaned: boolean;
  durationHours: number;
  endReason: Session["endReason"];
  cleaningPauses: number;
  deviceBreakdown: { deviceId: string | null; deviceName: string | null; hours: number }[];
  segments: SegmentView[];
  notes: NoteDTO[];
  /** Aktiv ausgewiesene Datenqualitäts-Hinweise (§12), maschinenlesbar (A-05, MCP-Restliste
   *  2026-07-17): jeder Eintrag trägt einen stabilen `code` (filterbar/zählbar), den `segmentIndex`
   *  (null = session-weit) und `detail` als menschliche Erklärung. Vorher nur deutsche Prosa. */
  dataQualityFlags: DataQualityFlag[];
}

/** Stabiler Code eines dataQualityFlags — maschinenlesbar, deckt sich mit den deviceConfidence-
 *  Stufen bzw. dem orphaned-Zustand (A-05). */
export type DataQualityCode = "orphaned-session" | "image-conflict" | "cluster-ambiguous" | "segment-without-device";
export interface DataQualityFlag {
  code: DataQualityCode;
  /** Betroffenes Segment (dessen `index`); null = die ganze Session betreffend (z.B. orphaned). */
  segmentIndex: number | null;
  /** Menschliche Erklärung — dieselbe Aussage wie früher der reine Prosa-String. */
  detail: string;
}

export interface SessionListResult extends Envelope {
  /** v3: `deviceConfidence` unterscheidet jetzt "undeclared" (kein Gerät angegeben) von "declared"
   *  (Gerät angegeben, nur nicht bildbestätigt) — vorher fiel Ersteres fälschlich auf "declared"
   *  zurück. `dataQualityFlags` deckt diesen Fall jetzt ebenfalls ab (A-04/A-05).
   *  v4: `isOpen`/`endReason` können jetzt für eine verwaiste, längst überholte Session `true`/"open"
   *  sein (Invariant-Fix in buildPairs, siehe utils.ts `orphaned`) — vorher fälschlich `false`/
   *  "closed" bei gleichzeitig widersprüchlichem Segment-`endedBy:"open"`. Das neue `orphaned`-Feld
   *  ist der verbindliche Weg, diesen Fall zu erkennen, statt `isOpen` roh zu vertrauen.
   *  v5 (A-05 + N-4/N-11, MCP-Restliste 2026-07-17): `dataQualityFlags` sind jetzt `{code, segmentIndex,
   *  detail}` statt Prosa-Strings (maschinenlesbar); die Kontroll-`deviceCheckStatus:string|null` ist
   *  zu `deviceCheck:{status,isOffense}` geworden (null → "not_checked", isOffense immer false).
   *  Semantik-/Formänderungen an Bestandsfeldern → Bump. */
  schemaVersion: 5;
  user: string;
  returnedCount: number;
  sessions: SessionView[];
}

export interface GetSessionOptions {
  /** Eine bestimmte Session (Lock-Entry-id). Omit = neueste Sessions auflisten. */
  sessionId?: string;
  /** Nur Sessions dieser Kategorie (Name, z.B. "KG" oder "Plug"). Omit = alle Kategorien. */
  category?: string;
  limit?: number;
}

/** Eine Session mit aufgelöstem Kategorie-NAMEN (die Session selbst trägt nur die categoryId). */
type TaggedSession = Session & { category: string | null };

const controlEntityType = "control";

/** Sammelt alle Objekt-Refs einer Session (Session + Segmente + Kontrollen) für EINEN Inline-Notes-Query. */
function refsOfSession(s: Session): EntityRef[] {
  const refs: EntityRef[] = [{ entityType: "session", entityId: s.id }];
  for (const seg of s.segments) {
    refs.push({ entityType: "segment", entityId: seg.id });
    for (const c of seg.controls) refs.push({ entityType: controlEntityType, entityId: c.controlId });
  }
  return refs;
}

function controlView(c: LinkedControl, notesByEntity: Map<string, NoteDTO[]>, iso: Iso) {
  return {
    id: c.controlId,
    time: iso(c.time)!,
    code: c.code,
    verifikationStatus: c.verifikationStatus,
    // N-4/N-11: bekannte Stufen durchreichen, alles andere (inkl. null) → "not_checked" (statt
    // mehrdeutigem null oder einem ungültigen Rohwert per Cast); isOffense immer false.
    deviceCheck: { status: normalizeDeviceCheckStatus(c.deviceCheckStatus), isOffense: false as const },
    detected: c.detected,
    expected: c.expected,
    notes: notesByEntity.get(entityKey(controlEntityType, c.controlId)) ?? [],
  };
}

function segmentView(seg: Segment, notesByEntity: Map<string, NoteDTO[]>, iso: Iso): SegmentView {
  return {
    id: seg.id,
    index: seg.index,
    start: iso(seg.start)!,
    end: iso(seg.end),
    durationHours: msToHours(seg.durationMs),
    durationMinutes: Math.round(seg.durationMs / 60_000),
    deviceDeclared: seg.deviceDeclared,
    deviceVerified: seg.deviceVerified,
    deviceEffective: seg.deviceEffective,
    deviceConfidence: seg.deviceConfidence,
    endedBy: seg.endedBy,
    controls: seg.controls.map((c) => controlView(c, notesByEntity, iso)),
    notes: notesByEntity.get(entityKey("segment", seg.id)) ?? [],
  };
}

function sessionView(s: TaggedSession, notesByEntity: Map<string, NoteDTO[]>, iso: Iso): SessionView {
  const segments = s.segments.map((seg) => segmentView(seg, notesByEntity, iso));
  const dataQualityFlags: DataQualityFlag[] = [];
  if (s.orphaned) {
    dataQualityFlags.push({ code: "orphaned-session", segmentIndex: null, detail: "Diese Session beginnt mit einem verwaisten Schliess-Eintrag ohne dazwischenliegenden Öffnen-Eintrag (Daten-Anomalie, z.B. Backdating) — sie erscheint technisch als offen, ist aber keine echte aktuell laufende Session." });
  }
  for (const seg of s.segments) {
    if (seg.deviceConfidence === "image-conflict") {
      dataQualityFlags.push({ code: "image-conflict", segmentIndex: seg.index, detail: `Segment ${seg.index}: Bildkontrolle (${seg.deviceVerified?.name}) widerspricht dem deklarierten Gerät (${seg.deviceDeclared.name}) über die Cluster-Grenze — Bild gewinnt, Stunden auf das verifizierte Gerät.` });
    } else if (seg.deviceConfidence === "cluster-ambiguous") {
      dataQualityFlags.push({ code: "cluster-ambiguous", segmentIndex: seg.index, detail: `Segment ${seg.index}: Bildkontrolle nennt ein optisch gleiches Gerät (${seg.deviceVerified?.name}) aus demselben Cluster — unzuverlässig, deklariert (${seg.deviceDeclared.name}) bleibt massgeblich. Kein Vergehen.` });
    } else if (seg.deviceConfidence === "undeclared") {
      dataQualityFlags.push({ code: "segment-without-device", segmentIndex: seg.index, detail: `Segment ${seg.index}: kein Gerät deklariert (A-04/A-05) — die Tragezeit landet in device_stats.unassigned statt bei einem Gerät.` });
    }
  }
  return {
    id: s.id,
    category: s.category,
    start: iso(s.start)!,
    end: iso(s.end),
    isOpen: s.isOpen,
    orphaned: s.orphaned,
    durationHours: msToHours(s.durationMs),
    endReason: s.endReason,
    cleaningPauses: s.cleaningPauses,
    deviceBreakdown: s.deviceBreakdown,
    segments,
    notes: notesByEntity.get(entityKey("session", s.id)) ?? [],
    dataQualityFlags,
  };
}

/** Liefert eine Session (sessionId) oder die neuesten Sessions, jeweils mit Segmenten,
 *  deviceBreakdown und inline verknüpften Notes. Throws, wenn der User unbekannt ist. */
export async function getSession(username: string, opts: GetSessionOptions = {}): Promise<SessionListResult> {
  const userId = await resolveUserId(username);
  const [{ entries, reinigung, devices, timezone }, { nameById, kgName }] = await Promise.all([
    loadTrackingData(userId),
    loadCategoryNames(userId),
  ]);
  const iso = makeIso(timezone);
  const now = new Date();

  // `fallback` gilt für eine Session, deren Kopf-Gerät keine Kategorie trägt: bei KG ist das der
  // Alt-Verschluss ohne Gerät (weiterhin KG), bei WEAR gäbe es das nicht — dort bleibt es null.
  const tag = (s: Session, fallback: string | null): TaggedSession => ({
    ...s,
    category: s.categoryId ? nameById.get(s.categoryId) ?? null : fallback,
  });

  // Sessions sind abgeleitet (Segment-/Pausen-Logik über benachbarte Entries) → die ganze Serie
  // wird gebaut, auch wenn nur eine sessionId gefragt ist. Bei sehr langer Historie der dominante
  // Kostenfaktor; ein Zeitfenster-Cut wäre die Optimierung, falls dieser Pfad heiss wird.
  const all: TaggedSession[] = [
    ...buildSessions(entries, reinigung, now, devices).map((s) => tag(s, kgName)),
    ...buildWearSessions(entries, now).map((s) => tag(s, null)),
  ].sort((a, b) => b.start.getTime() - a.start.getTime());

  const wanted = opts.category?.trim().toLowerCase();
  const matching = wanted ? all.filter((s) => s.category?.toLowerCase() === wanted) : all;

  const selected = opts.sessionId
    ? matching.filter((s) => s.id === opts.sessionId)
    : matching.slice(0, Math.min(Math.max(1, opts.limit ?? 10), 50));

  // Inline-Notes für alle ausgewählten Sessions in EINEM Query.
  const notesByEntity = await notesForEntities(userId, selected.flatMap(refsOfSession), {}, undefined, timezone);

  return {
    schemaVersion: 5,
    user: username,
    ...buildEnvelope(now, iso, timezone),
    returnedCount: selected.length,
    sessions: selected.map((s) => sessionView(s, notesByEntity, iso)),
  };
}
