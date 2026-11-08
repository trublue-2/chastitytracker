import { canReadJournal } from "@/lib/keyholder";
import { journalMonthOf, journalPageQuery, monthParam } from "@/lib/journal/journal";
import { listKeyholderJournal } from "@/lib/journal/journalService";
import { msToHours } from "@/lib/utils";
import { buildEnvelope, makeIso, resolveUserContext, type Envelope } from "./common";

/**
 * `get_shared_journal`: was der Träger aus seinem Tagebuch mit seiner Keyholderin teilt (Issue #114)
 * — für die KI genau dieselbe Sicht wie für den Menschen im Reiter „Geteilte Einträge".
 *
 * **Ein Lesepfad, eine Regel.** Die Daten kommen ausschliesslich aus `listKeyholderJournal`: private
 * Einträge werden nicht geladen, bei „Stimmung zeigen" fehlen Text und Leitfrage. Und lesen darf nur,
 * wer dem Träger als Keyholder ZUGEORDNET ist — wie im UI genügt die Admin-Rolle allein nicht, und
 * der statische MCP-Token ohne Benutzer-Identität bekommt nichts. Die KI weiss hier also bewusst NICHT
 * mehr als die Keyholderin, anders als an anderen Stellen des MCP: was der Sub nicht teilt, teilt er
 * mit niemandem.
 *
 * Nur lesen. Schreiben, Teilen verlangen oder Einstellungen umlegen gibt es für die Keyholder-Seite
 * nicht, also auch nicht für die KI — `journal-write` und `journal-settings` sind Fähigkeiten des Subs.
 */

export const SHARED_JOURNAL_SCHEMA_VERSION = 1;

export interface SharedJournalResult extends Envelope {
  schemaVersion: number;
  user: string;
  /** Der abgefragte Monat (`YYYY-MM`) oder null = die neuesten Einträge. */
  month: string | null;
  entries: {
    id: string;
    at: string;
    /** `full` = ganzer Eintrag, `mood_only` = nur Zeitpunkt, Dauern und Stimmung. */
    shared: "full" | "mood_only";
    mood: number | null;
    /** Die Leitfrage, auf die er antwortete — null ohne Frage oder bei `mood_only`. */
    prompt: string | null;
    text: string | null;
    /** Tragezeit der laufenden Session zu diesem Zeitpunkt, Reinigungspausen abgezogen; null = nicht verschlossen. */
    lockedHours: number | null;
    /** Stunden seit dem letzten Orgasmus davor; null = davor keiner erfasst. */
    orgasmFreeHours: number | null;
  }[];
  /** Mit `cursor` = id des letzten Eintrags gibt es die nächste (ältere) Seite. */
  hasMore: boolean;
}

/** Die Absage, wenn die KI nicht als Keyholderin dieses Trägers handelt — mit Grund, damit der Agent
 *  sie nicht für einen leeren Bestand hält. */
export class SharedJournalDenied extends Error {}

export async function sharedJournal(
  username: string,
  actorUserId: string | undefined,
  opts: { month?: string; cursor?: string },
): Promise<SharedJournalResult> {
  const { id: subId, timezone } = await resolveUserContext(username);
  if (!actorUserId) {
    throw new SharedJournalDenied(
      "the shared journal needs an identity — the static MCP token carries none; connect with an OAuth token authorized by the sub's keyholder",
    );
  }
  if (!(await canReadJournal(actorUserId, subId))) {
    throw new SharedJournalDenied(
      `the authorizing account is not assigned as keyholder of "${username}" — the journal is shared with assigned keyholders only, the admin role alone does not count`,
    );
  }

  const params = new URLSearchParams({ ...(opts.month && { month: opts.month }), ...(opts.cursor && { cursor: opts.cursor }) });
  const month = journalMonthOf(params);
  const page = await listKeyholderJournal(subId, journalPageQuery(params, timezone));
  const now = new Date();
  const iso = makeIso(timezone);
  const hours = (ms: number | null) => (ms === null ? null : msToHours(ms));

  return {
    schemaVersion: SHARED_JOURNAL_SCHEMA_VERSION,
    user: username,
    ...buildEnvelope(now, iso, timezone),
    month: month && monthParam(month),
    entries: page.entries.map((e) => ({
      id: e.id,
      at: iso(e.entryAt)!,
      shared: e.visibility === "FULL" ? "full" : "mood_only",
      mood: e.mood,
      prompt: e.prompt,
      text: e.text,
      lockedHours: hours(e.lockedMs),
      orgasmFreeHours: hours(e.orgasmFreeMs),
    })),
    hasMore: page.hasMore,
  };
}
