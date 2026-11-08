import { prisma } from "@/lib/prisma";
import { isJournalVisibility, type JournalVisibility } from "@/lib/constants";
import { CLEANING_USER_SELECT } from "@/lib/cleaningService";
import { CLEANING_RULE_CHANGE_SELECT, cleaningRulesAt, cleaningRulesFrom } from "@/lib/cleaningRules";
import {
  KEYHOLDER_VISIBLE,
  checkJournalInput,
  durationsAt,
  journalDayOf,
  journalMonthOf,
  journalMonthRange,
  journalPageQuery,
  journalParams,
  storedPrompt,
  toKeyholderView,
  type JournalDurations,
  type JournalInput,
  type JournalRange,
  type JournalRow,
  type KeyholderJournalRow,
} from "@/lib/journal/journal";
import { serviceFail, type ServiceFailure, type ServiceResult } from "@/lib/serviceResult";
import { buildSessions } from "@/lib/sessionModel";
import { orgasmTimes, tzDateParts } from "@/lib/utils";

/**
 * Das Tagebuch des Subs (Issue #114) — Laden und Schreiben. Die Regeln selbst stehen datenbankfrei in
 * `journal.ts`.
 *
 * **Jede Schreib-Funktion nimmt den BESITZER als ersten Parameter und filtert mit ihm.** Ein Eintrag
 * wird nie nur über seine id angefasst: `updateMany`/`deleteMany` mit `{ id, userId }` treffen eine
 * fremde Zeile schlicht nicht, und die Antwort ist dann dieselbe wie für eine unbekannte id
 * (`NOT_FOUND`). So verrät der Endpunkt nicht, welche ids es gibt — und die Keyholderin kann über
 * diese Funktionen nichts schreiben, weil sie nie der Besitzer ist.
 */

const ROW_SELECT = { id: true, entryAt: true, text: true, mood: true, prompt: true, visibility: true } as const;

/** Wie viele Einträge eine Seite höchstens trägt — „Ältere laden" holt die nächste. */
const PAGE_SIZE = 30;

/** Welche Seite: ein Zeitraum (Monat) und/oder die id des letzten Eintrags der vorigen Seite. */
interface JournalPageQuery {
  range?: JournalRange;
  cursor?: string;
}

/** Eine Seite und ob danach noch etwas kommt. */
export interface JournalPage<T> {
  entries: T[];
  hasMore: boolean;
}

/** Wer liest: der Besitzer alles, die Keyholderin nur Freigegebenes. */
type JournalAudience = "own" | "keyholder";

/** Der Filter je Leserin — EINE Stelle für Liste, Kalenderpunkte, Jahre und Stimmungskurve, damit
 *  keine dieser Sichten Privates verrät ({@link KEYHOLDER_VISIBLE}). */
function audienceWhere(audience: JournalAudience): object {
  return audience === "keyholder" ? { visibility: { in: [...KEYHOLDER_VISIBLE] } } : {};
}

/**
 * Eine Seite Einträge, neueste zuerst. `where` engt zusätzlich ein (Keyholder-Filter, Suche).
 *
 * Sortiert nach `entryAt` UND `id`, geblättert über die id: zwei Einträge mit derselben Minute (das
 * Formular kennt keine Sekunden) liegen sonst in unbestimmter Reihenfolge, und ein Zeit-Cursor
 * „älter als" verlöre den zweiten an der Seitengrenze. Eine Zeile mehr als die Seite zu laden sagt,
 * ob es weitergeht — auch innerhalb eines Monats mit mehr als einer Seite.
 */
async function loadRows(userId: string, page: JournalPageQuery, where: object = {}): Promise<JournalPage<JournalRow>> {
  const rows = await prisma.journalEntry.findMany({
    where: { userId, ...where, entryAt: { gte: page.range?.from, lt: page.range?.to } },
    orderBy: [{ entryAt: "desc" }, { id: "desc" }],
    ...(page.cursor && { cursor: { id: page.cursor }, skip: 1 }),
    take: PAGE_SIZE + 1,
    select: ROW_SELECT,
  });
  return { entries: rows.slice(0, PAGE_SIZE), hasMore: rows.length > PAGE_SIZE };
}

/**
 * Was die Dauern brauchen: die Verschluss- und Orgasmus-Einträge samt Reinigungsregeln zur Tatzeit.
 * Bewusst schlanker als `loadTrackingData` (MCP): Kontrollen, Geräte-Prüfung und Lookalike-Cluster
 * bewegen keine Segmentgrenze, sie verknüpfen und beschriften nur.
 */
async function loadDurationSources(userId: string) {
  const [user, entries, cleaningChanges] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: CLEANING_USER_SELECT }),
    prisma.entry.findMany({
      where: { userId, type: { in: ["VERSCHLUSS", "OEFFNEN", "ORGASMUS"] } },
      orderBy: { startTime: "desc" },
      select: {
        id: true, type: true, startTime: true, boltConfirmedAt: true, openAwaitsBolt: true, oeffnenGrund: true,
        device: { select: { id: true, name: true, categoryId: true } },
      },
    }),
    prisma.cleaningRuleChange.findMany({ where: { userId }, select: CLEANING_RULE_CHANGE_SELECT }),
  ]);
  return { entries, cleaning: cleaningRulesAt(cleaningRulesFrom(cleaningChanges, user)) };
}

/** Hängt jedem Eintrag einer Seite die Dauern zu seinem Zeitpunkt an. Sessions entstehen EINMAL je
 *  Seite; eine leere Seite (Suche ohne Treffer, leerer Monat) lädt das Protokoll gar nicht erst. */
async function withDurations<T extends { entryAt: Date }>(
  userId: string,
  page: JournalPage<T>,
  now: Date,
): Promise<JournalPage<T & JournalDurations>> {
  if (page.entries.length === 0) return { entries: [], hasMore: page.hasMore };
  const { entries, cleaning } = await loadDurationSources(userId);
  const sessions = buildSessions(entries, cleaning, now);
  const orgasms = orgasmTimes(entries);
  return { ...page, entries: page.entries.map((r) => ({ ...r, ...durationsAt(r.entryAt, sessions, orgasms) })) };
}

/** Die eigenen Einträge des Subs, neueste zuerst — ALLE Sichtbarkeiten. Nur für den Besitzer selbst. */
export async function listOwnJournal(
  userId: string,
  page: JournalPageQuery = {},
  now: Date = new Date(),
): Promise<JournalPage<JournalRow & JournalDurations>> {
  return withDurations(userId, await loadRows(userId, page), now);
}

/**
 * Was die Keyholderin vom Tagebuch ihres Subs sieht — DER eine Lesepfad für ihre Liste.
 *
 * Die Abfrage lädt private Einträge gar nicht erst; die Projektion entfernt bei „nur Stimmung" Text
 * und Leitfrage. Auch `hasMore` zählt so nur Freigegebenes. Wer hier aufruft, muss vorher
 * `canReadJournal` geprüft haben — die Funktion selbst kennt den Handelnden nicht.
 */
export async function listKeyholderJournal(
  subId: string,
  page: JournalPageQuery = {},
  now: Date = new Date(),
): Promise<JournalPage<KeyholderJournalRow & JournalDurations>> {
  const rows = await loadRows(subId, page, audienceWhere("keyholder"));
  return withDurations(subId, { ...rows, entries: toKeyholderView(rows.entries) }, now);
}

// ── Kalender, Monatswahl, Suche ───────────────────────────────────────────────────────────────

/** Die Kalendertage (1–31, in der Zeitzone des Subs) eines Zeitraums, an denen es Einträge gibt. */
export async function journalDaysInRange(
  userId: string,
  range: JournalRange,
  tz: string,
  audience: JournalAudience,
): Promise<number[]> {
  const rows = await prisma.journalEntry.findMany({
    where: { userId, ...audienceWhere(audience), entryAt: { gte: range.from, lt: range.to } },
    select: { entryAt: true },
  });
  return [...new Set(rows.map((r) => tzDateParts(r.entryAt, tz).day))].sort((a, b) => a - b);
}

/** Das Jahr des ältesten Eintrags — die Untergrenze der Jahreswahl. null = noch keiner. */
export async function journalFirstYear(userId: string, tz: string, audience: JournalAudience): Promise<number | null> {
  const first = await prisma.journalEntry.findFirst({
    where: { userId, ...audienceWhere(audience) },
    orderBy: { entryAt: "asc" },
    select: { entryAt: true },
  });
  return first ? tzDateParts(first.entryAt, tz).year : null;
}

/** Wie weit die Stimmungskurve zurückreicht. */
export const MOOD_WINDOW_DAYS = 90;

/** Die Stimmungswerte der letzten {@link MOOD_WINDOW_DAYS} Tage, älteste zuerst. Nur Einträge MIT
 *  Stimmung; `private` nur in der eigenen Sicht — die Keyholderin bekommt solche Punkte nicht. */
export async function journalMoodSeries(
  userId: string,
  audience: JournalAudience,
  now: Date = new Date(),
): Promise<{ at: Date; mood: number; private: boolean }[]> {
  const rows = await prisma.journalEntry.findMany({
    where: {
      userId,
      ...audienceWhere(audience),
      mood: { not: null },
      entryAt: { gte: new Date(now.getTime() - MOOD_WINDOW_DAYS * 86_400_000), lte: now },
    },
    orderBy: { entryAt: "asc" },
    select: { entryAt: true, mood: true, visibility: true },
  });
  return rows.map((r) => ({ at: r.entryAt, mood: r.mood as number, private: r.visibility === "PRIVATE" }));
}

/**
 * Sucht im Text und in der Leitfrage der EIGENEN Einträge — eine Seite, mehr Treffer heisst
 * eingrenzen, nicht blättern. Nur für den Besitzer: die Keyholderin hat keine Suche, Treffer, die sie
 * nicht sieht, liessen sich über leere Antworten erraten.
 *
 * Verglichen wird hier, nicht in der Datenbank: Prismas `contains` ist unter SQLite ein `LIKE` ohne
 * Maskierung — `%` und `_` in der Eingabe wirkten als Platzhalter („50%" fände jede „50"), und
 * Gross/Klein wäre nur für ASCII egal („Müde" fände „müde" nicht, und damit auch keine Obermenge,
 * die sich nachträglich filtern liesse). Das eigene Tagebuch ist dafür klein genug; geladen werden nur
 * die Spalten der Liste.
 */
export async function searchOwnJournal(
  userId: string,
  query: string,
  now: Date = new Date(),
): Promise<JournalPage<JournalRow & JournalDurations>> {
  const q = query.trim();
  if (!q) return { entries: [], hasMore: false };
  const candidates = await prisma.journalEntry.findMany({
    where: { userId },
    orderBy: [{ entryAt: "desc" }, { id: "desc" }],
    select: ROW_SELECT,
  });
  const needle = q.toLocaleLowerCase();
  const hits = candidates.filter((r) =>
    r.text.toLocaleLowerCase().includes(needle) || (r.prompt?.toLocaleLowerCase().includes(needle) ?? false));
  return withDurations(userId, { entries: hits.slice(0, PAGE_SIZE), hasMore: hits.length > PAGE_SIZE }, now);
}

/** Alles, was eine Tagebuch-Seite braucht — für den Sub und für die Keyholderin derselbe Lader. Die
 *  Seiten prüfen vorher, wer liest; hier wird nur noch geladen. */
export async function loadJournalView(
  userId: string,
  raw: Record<string, string | string[] | undefined>,
  tz: string,
  audience: JournalAudience,
  now: Date = new Date(),
) {
  const params = journalParams(raw);
  const month = journalMonthOf(params);
  const todayParts = tzDateParts(now, tz);
  const today = { year: todayParts.year, month0: todayParts.month };
  const shown = month ?? today;
  const calendar = params.get("view") === "calendar";
  const query = audience === "own" ? (params.get("q") ?? "").trim() : "";

  const [page, calendarDays, firstYear] = await Promise.all([
    query
      ? searchOwnJournal(userId, query, now)
      : audience === "own"
        ? listOwnJournal(userId, journalPageQuery(params, tz), now)
        : listKeyholderJournal(userId, journalPageQuery(params, tz), now),
    calendar ? journalDaysInRange(userId, journalMonthRange(shown, tz), tz, audience) : Promise.resolve([]),
    journalFirstYear(userId, tz, audience),
  ]);
  return {
    state: { month, day: journalDayOf(params, month), calendar, query, shown, today },
    page: page as JournalPage<(JournalRow | KeyholderJournalRow) & JournalDurations>,
    calendarDays,
    firstYear,
  };
}

export type JournalView = Awaited<ReturnType<typeof loadJournalView>>;

/** Ein einzelner eigener Eintrag zum Bearbeiten — null, wenn er nicht dem Besitzer gehört. */
export function ownJournalEntry(userId: string, id: string): Promise<JournalRow | null> {
  return prisma.journalEntry.findFirst({ where: { id, userId }, select: ROW_SELECT });
}

/** Eine Sichtbarkeit aus dem Body: fehlt sie, `undefined`; unbekannt, die Absage. */
function visibilityOf(raw: unknown): JournalVisibility | undefined | ServiceFailure {
  if (raw === undefined) return undefined;
  return isJournalVisibility(raw) ? raw : serviceFail(400, "JOURNAL_INVALID_VISIBILITY");
}

// ── Einstellungen ─────────────────────────────────────────────────────────────────────────────

export interface JournalSettingsValues {
  defaultVisibility: JournalVisibility;
  promptsEnabled: boolean;
}

/** Die Vorgaben, solange der Sub nichts umgestellt hat — dieselben wie die Spalten-Defaults. */
const DEFAULT_SETTINGS: JournalSettingsValues = { defaultVisibility: "FULL", promptsEnabled: true };

/** Die Tagebuch-Einstellungen eines Subs. Ohne Zeile die Vorgaben; ein unlesbarer gespeicherter
 *  Standard fällt auf die Vorgabe zurück, statt jedes Anlegen scheitern zu lassen. */
export async function journalSettingsOf(userId: string): Promise<JournalSettingsValues> {
  const row = await prisma.journalSettings.findUnique({
    where: { userId },
    select: { defaultVisibility: true, promptsEnabled: true },
  });
  if (!row) return DEFAULT_SETTINGS;
  return {
    defaultVisibility: isJournalVisibility(row.defaultVisibility) ? row.defaultVisibility : DEFAULT_SETTINGS.defaultVisibility,
    promptsEnabled: row.promptsEnabled,
  };
}

/** Stellt die eigenen Tagebuch-Einstellungen um — nur übergebene Felder. Allein der Sub selbst ruft
 *  das (Session-Scope in `/api/settings/journal`); die Keyholderin hat keinen Weg dorthin. */
export async function setJournalSettings(
  userId: string,
  patch: { defaultVisibility?: unknown; promptsEnabled?: unknown },
): Promise<ServiceResult<JournalSettingsValues>> {
  const data: Partial<JournalSettingsValues> = {};
  if (patch.defaultVisibility !== undefined) {
    if (!isJournalVisibility(patch.defaultVisibility)) return serviceFail(400, "JOURNAL_INVALID_VISIBILITY");
    data.defaultVisibility = patch.defaultVisibility;
  }
  if (patch.promptsEnabled !== undefined) {
    if (typeof patch.promptsEnabled !== "boolean") return serviceFail(400, "JOURNAL_INVALID_SETTING");
    data.promptsEnabled = patch.promptsEnabled;
  }
  if (Object.keys(data).length === 0) return serviceFail(400, "JOURNAL_INVALID_SETTING");

  const row = await prisma.journalSettings.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
    select: { defaultVisibility: true, promptsEnabled: true },
  });
  return { ok: true, data: row as JournalSettingsValues };
}

// ── Schreiben ─────────────────────────────────────────────────────────────────────────────────

export type CreateJournalParams = JournalInput & {
  /** Der Fragetext, der über dem Feld stand — oder nichts. */
  prompt?: unknown;
  /** Fehlt sie, gilt der Standard des Subs (`JournalSettings.defaultVisibility`). */
  visibility?: unknown;
};

/** Legt einen Eintrag an. Sichtbarkeit und Leitfrage richten sich nach den Einstellungen des Subs. */
export async function createJournalEntry(
  userId: string,
  params: CreateJournalParams,
  now: Date = new Date(),
): Promise<ServiceResult<{ id: string }>> {
  const checked = checkJournalInput(params, now);
  if (typeof checked === "string") return serviceFail(400, checked);
  const chosen = visibilityOf(params.visibility);
  if (typeof chosen === "object") return chosen;

  const settings = await journalSettingsOf(userId);
  const row = await prisma.journalEntry.create({
    data: {
      userId,
      ...checked,
      prompt: storedPrompt(params.prompt, settings.promptsEnabled),
      visibility: chosen ?? settings.defaultVisibility,
    },
    select: { id: true },
  });
  return { ok: true, data: row };
}

/** Was sich an einem Eintrag ändern lässt — die Leitfrage nicht, sie gehört zum Moment des Schreibens. */
export type UpdateJournalParams = Partial<Omit<CreateJournalParams, "prompt">>;

/** Ändert einen eigenen Eintrag. Nur übergebene Felder ändern sich; geprüft wird das Ergebnis. */
export async function updateJournalEntry(
  userId: string,
  id: string,
  params: UpdateJournalParams,
  now: Date = new Date(),
): Promise<ServiceResult<null>> {
  const chosen = visibilityOf(params.visibility);
  if (typeof chosen === "object") return chosen;

  const current = await prisma.journalEntry.findFirst({
    where: { id, userId },
    select: { entryAt: true, text: true, mood: true },
  });
  if (!current) return serviceFail(404, "NOT_FOUND");

  const checked = checkJournalInput(
    {
      entryAt: params.entryAt === undefined ? current.entryAt : params.entryAt,
      text: params.text === undefined ? current.text : params.text,
      mood: params.mood === undefined ? current.mood : params.mood,
    },
    now,
  );
  if (typeof checked === "string") return serviceFail(400, checked);

  const { count } = await prisma.journalEntry.updateMany({
    where: { id, userId },
    data: { ...checked, ...(chosen && { visibility: chosen }) },
  });
  return count === 0 ? serviceFail(404, "NOT_FOUND") : { ok: true, data: null };
}

/** Löscht einen eigenen Eintrag endgültig — kein Papierkorb, kein Verlauf. */
export async function deleteJournalEntry(userId: string, id: string): Promise<ServiceResult<null>> {
  const { count } = await prisma.journalEntry.deleteMany({ where: { id, userId } });
  return count === 0 ? serviceFail(404, "NOT_FOUND") : { ok: true, data: null };
}
