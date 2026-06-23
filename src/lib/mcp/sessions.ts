import { prisma } from "@/lib/prisma";
import type { ReinigungSettings } from "@/lib/utils";
import { buildSessions, type Session, type Segment, type LinkedControl } from "@/lib/mcp/segments";
import { msToHours } from "@/lib/mcp/format";
import { resolveUserId, iso, notesForEntities, entityKey, type NoteDTO, type EntityRef } from "@/lib/mcp/common";

/** get_session — KG-Sessions als abgeleitete Wahrheit: Segmente + deviceBreakdown + Inline-Notes
 *  + Daten-Qualitäts-Flags. Rein lesend, MCP-only. */

export interface SegmentView {
  id: string;
  index: number;
  start: string;
  end: string | null;
  durationHours: number;
  deviceDeclared: { id: string | null; name: string | null };
  deviceVerified: { id: string | null; name: string | null } | null;
  deviceConfidence: Segment["deviceConfidence"];
  endedBy: Segment["endedBy"];
  controls: { id: string; time: string; code: string | null; verifikationStatus: string | null; deviceCheckStatus: string | null; detected: string | null; expected: string | null; notes: NoteDTO[] }[];
  notes: NoteDTO[];
}

export interface SessionView {
  id: string;
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
  limit?: number;
}

const controlEntityType = "control";

/** Lädt Entries (mit Device-Include) + Reinigungs-Settings — dieselbe Datenbasis wie buildOverview. */
async function loadSessionData(userId: string): Promise<{ entries: Parameters<typeof buildSessions>[0]; reinigung: ReinigungSettings }> {
  const [user, entries] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { reinigungErlaubt: true, reinigungMaxMinuten: true } }),
    prisma.entry.findMany({
      where: { userId },
      orderBy: { startTime: "desc" },
      select: {
        id: true, type: true, startTime: true, oeffnenGrund: true,
        kontrollCode: true, verifikationStatus: true,
        deviceCheck: true, deviceCheckNote: true, deviceCheckExpected: true,
        device: { select: { id: true, name: true, categoryId: true } },
      },
    }),
  ]);
  return {
    entries,
    reinigung: { erlaubt: user.reinigungErlaubt ?? false, maxMinuten: user.reinigungMaxMinuten ?? 15 },
  };
}

/** Sammelt alle Objekt-Refs einer Session (Session + Segmente + Kontrollen) für EINEN Inline-Notes-Query. */
function refsOfSession(s: Session): EntityRef[] {
  const refs: EntityRef[] = [{ entityType: "session", entityId: s.id }];
  for (const seg of s.segments) {
    refs.push({ entityType: "segment", entityId: seg.id });
    for (const c of seg.controls) refs.push({ entityType: controlEntityType, entityId: c.controlId });
  }
  return refs;
}

function controlView(c: LinkedControl, notesByEntity: Map<string, NoteDTO[]>) {
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

function segmentView(seg: Segment, notesByEntity: Map<string, NoteDTO[]>): SegmentView {
  return {
    id: seg.id,
    index: seg.index,
    start: iso(seg.start)!,
    end: iso(seg.end),
    durationHours: msToHours(seg.durationMs),
    deviceDeclared: seg.deviceDeclared,
    deviceVerified: seg.deviceVerified,
    deviceConfidence: seg.deviceConfidence,
    endedBy: seg.endedBy,
    controls: seg.controls.map((c) => controlView(c, notesByEntity)),
    notes: notesByEntity.get(entityKey("segment", seg.id)) ?? [],
  };
}

function sessionView(s: Session, notesByEntity: Map<string, NoteDTO[]>): SessionView {
  const segments = s.segments.map((seg) => segmentView(seg, notesByEntity));
  const dataQualityFlags: string[] = [];
  for (const seg of s.segments) {
    if (seg.deviceConfidence === "image-conflict") {
      dataQualityFlags.push(`Segment ${seg.index}: Bildkontrolle widerspricht dem deklarierten Gerät (Bild gewinnt).`);
    }
  }
  return {
    id: s.id,
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
  const { entries, reinigung } = await loadSessionData(userId);
  const now = new Date();
  // Sessions sind abgeleitet (Segment-/Pausen-Logik über benachbarte Entries) → die ganze Serie
  // wird gebaut, auch wenn nur eine sessionId gefragt ist. Bei sehr langer Historie der dominante
  // Kostenfaktor; ein Zeitfenster-Cut wäre die Optimierung, falls dieser Pfad heiss wird.
  const all = buildSessions(entries, reinigung, now);

  const selected = opts.sessionId
    ? all.filter((s) => s.id === opts.sessionId)
    : all.slice(0, Math.min(Math.max(1, opts.limit ?? 10), 50));

  // Inline-Notes für alle ausgewählten Sessions in EINEM Query.
  const refs = selected.flatMap(refsOfSession);
  const notesByEntity = await notesForEntities(userId, refs);

  return {
    schemaVersion: 2,
    user: username,
    returnedCount: selected.length,
    sessions: selected.map((s) => sessionView(s, notesByEntity)),
  };
}
