import { buildSessions } from "@/lib/mcp/segments";
import { resolveUserId, iso, loadTrackingData, parseIsoDate, type TrackingEntry } from "@/lib/mcp/common";

/** timeline (§12) — KG-SEGMENTE (nicht rohe Lock/Unlock-Pulse), Wear-Sessions, Kontrollen und
 *  Orgasmen auf EINER Zeitachse. Der KG-Backbone kommt aus buildSessions, damit Reinigungspausen
 *  via `endedBy` von echten Session-Enden unterscheidbar bleiben (Wahrheit aus Segmenten, nicht
 *  Labels). Rein lesend, MCP-only. */

export type TimelineEventType = "lock" | "unlock" | "control" | "orgasm" | "wear_begin" | "wear_end";

export interface TimelineEvent {
  at: string;
  type: TimelineEventType;
  deviceName: string | null;
  /** Typ-spezifisches Detail: endedBy, deviceConfidence, Öffnungsgrund, orgasmusArt, Kontroll-Status … */
  detail: Record<string, unknown>;
}

export interface TimelineResult {
  schemaVersion: 2;
  user: string;
  from: string | null;
  to: string | null;
  returnedCount: number;
  events: TimelineEvent[];
}

export interface TimelineOptions {
  from?: string;
  to?: string;
  limit?: number;
}

/** Internes Event mit Roh-Zeit (Date) für Sortierung/Filter vor der ISO-Serialisierung. */
type RawEvent = { at: Date; type: TimelineEventType; deviceName: string | null; detail: Record<string, unknown> };

/** Wear-Events (Nicht-KG-Kategorien) aus Roh-Entries — buildSessions deckt nur KG ab. */
const WEAR_EVENT: Record<string, TimelineEventType> = { WEAR_BEGIN: "wear_begin", WEAR_END: "wear_end" };

export async function timeline(username: string, opts: TimelineOptions = {}): Promise<TimelineResult> {
  const userId = await resolveUserId(username);
  const { entries, reinigung } = await loadTrackingData(userId);
  const now = new Date();
  const from = parseIsoDate(opts.from, "from");
  const to = parseIsoDate(opts.to, "to");
  const limit = Math.min(Math.max(1, opts.limit ?? 200), 1000);

  const raw: RawEvent[] = [];

  // KG-Backbone aus Segmenten: lock je Segment-Start, unlock je Segment-Ende (+ endedBy).
  for (const s of buildSessions(entries, reinigung, now)) {
    for (const seg of s.segments) {
      raw.push({ at: seg.start, type: "lock", deviceName: seg.deviceDeclared.name, detail: { sessionId: s.id, segmentIndex: seg.index, deviceConfidence: seg.deviceConfidence } });
      if (seg.end) {
        raw.push({ at: seg.end, type: "unlock", deviceName: seg.deviceDeclared.name, detail: { sessionId: s.id, endedBy: seg.endedBy } });
      }
      for (const c of seg.controls) {
        raw.push({ at: c.time, type: "control", deviceName: seg.deviceDeclared.name, detail: { code: c.code, verifikationStatus: c.verifikationStatus, deviceCheck: c.deviceCheckStatus, detected: c.detected, expected: c.expected } });
      }
    }
  }

  // Orgasmen + Wear (Kategorien) aus Roh-Entries.
  for (const e of entries) {
    if (e.type === "ORGASMUS") raw.push({ at: e.startTime, type: "orgasm", deviceName: e.device?.name ?? null, detail: { orgasmusArt: e.orgasmusArt } });
    const wear = WEAR_EVENT[e.type];
    if (wear) raw.push({ at: e.startTime, type: wear, deviceName: e.device?.name ?? null, detail: {} });
  }

  const filtered = raw
    .filter((ev) => (!from || ev.at >= from) && (!to || ev.at <= to))
    .sort((a, b) => a.at.getTime() - b.at.getTime());
  // Bei Limit die JÜNGSTEN behalten, chronologisch aufsteigend zurückgeben.
  const sliced = filtered.length > limit ? filtered.slice(filtered.length - limit) : filtered;

  return {
    schemaVersion: 2,
    user: username,
    from: iso(from ?? null),
    to: iso(to ?? null),
    returnedCount: sliced.length,
    events: sliced.map((ev) => ({ at: iso(ev.at)!, type: ev.type, deviceName: ev.deviceName, detail: ev.detail })),
  };
}
