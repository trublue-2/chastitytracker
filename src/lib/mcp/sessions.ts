import { buildSessions, buildWearSessions, type Session, type Segment, type LinkedControl } from "@/lib/mcp/segments";
import { msToHours } from "@/lib/mcp/format";
import { resolveUserId, makeIso, notesForEntities, entityKey, loadTrackingData, loadCategoryNames, type Iso, type NoteDTO, type EntityRef } from "@/lib/mcp/common";

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
  deviceDeclared: { id: string | null; name: string | null };
  deviceVerified: { id: string | null; name: string | null } | null;
  /** Massgebliches Gerät für die Tragezeit-Zurechnung (Bild bei echtem Konflikt, sonst deklariert). */
  deviceEffective: { id: string | null; name: string | null };
  deviceConfidence: Segment["deviceConfidence"];
  endedBy: Segment["endedBy"];
  controls: { id: string; time: string; code: string | null; verifikationStatus: string | null; deviceCheckStatus: string | null; detected: string | null; expected: string | null; notes: NoteDTO[] }[];
  notes: NoteDTO[];
}

export interface SessionView {
  id: string;
  /** Kategorie der Session („KG", „Plug", „Halsband" …). */
  category: string | null;
  start: string;
  end: string | null;
  isOpen: boolean;
  durationHours: number;
  endReason: Session["endReason"];
  cleaningPauses: number;
  deviceBreakdown: { deviceId: string | null; deviceName: string | null; hours: number }[];
  segments: SegmentView[];
  notes: NoteDTO[];
  /** Aktiv ausgewiesene Konflikte (§12): declared≠verified pro Segment. */
  dataQualityFlags: string[];
}

export interface SessionListResult {
  schemaVersion: 2;
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
    deviceCheckStatus: c.deviceCheckStatus,
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
  const dataQualityFlags: string[] = [];
  for (const seg of s.segments) {
    if (seg.deviceConfidence === "image-conflict") {
      dataQualityFlags.push(`Segment ${seg.index}: Bildkontrolle (${seg.deviceVerified?.name}) widerspricht dem deklarierten Gerät (${seg.deviceDeclared.name}) über die Cluster-Grenze — Bild gewinnt, Stunden auf das verifizierte Gerät.`);
    } else if (seg.deviceConfidence === "cluster-ambiguous") {
      dataQualityFlags.push(`Segment ${seg.index}: Bildkontrolle nennt ein optisch gleiches Gerät (${seg.deviceVerified?.name}) aus demselben Cluster — unzuverlässig, deklariert (${seg.deviceDeclared.name}) bleibt massgeblich. Kein Vergehen.`);
    }
  }
  return {
    id: s.id,
    category: s.category,
    start: iso(s.start)!,
    end: iso(s.end),
    isOpen: s.isOpen,
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
    schemaVersion: 2,
    user: username,
    returnedCount: selected.length,
    sessions: selected.map((s) => sessionView(s, notesByEntity, iso)),
  };
}
