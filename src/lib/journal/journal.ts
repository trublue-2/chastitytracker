import {
  CLIENT_CLOCK_SKEW_MS,
  JOURNAL_MOOD_MAX,
  JOURNAL_MOOD_MIN,
  JOURNAL_PROMPT_MAX,
  JOURNAL_TEXT_MAX,
  isJournalVisibility,
  type JournalVisibility,
} from "@/lib/constants";
import type { ServiceErrorCode } from "@/lib/serviceErrorCodes";
import type { Session } from "@/lib/sessionModel";
import { midnightOfLocalDate } from "@/lib/utils";

/**
 * Das Tagebuch des Subs (Issue #114) — der REINE Teil: Prüfung der Eingaben, die Sicht der
 * Keyholderin und die Dauern zum Zeitpunkt eines Eintrags. Datenbankfrei, damit die Regeln ohne
 * Prisma testbar sind; Laden und Schreiben stehen in `journalService.ts` (derselbe Schnitt wie
 * `weight.ts` / `weightService.ts`).
 *
 * **Die eine Regel, um die sich alles dreht:** was der Sub nicht freigibt, erreicht die Keyholderin
 * nicht — auch nicht als Anzahl, Lücke oder Stimmungswert. Dafür gibt es GENAU einen Weg zu ihr:
 * {@link KEYHOLDER_VISIBLE} als Abfrage-Filter und {@link toKeyholderView} als Projektion. Eine
 * zweite Abfrage für die Keyholder-Sicht, an diesen beiden vorbei, ist das Leck.
 */

/** Die Rohwerte eines Eintrags aus Formular oder API. Fehlt `entryAt`, gilt „jetzt". */
export interface JournalInput {
  entryAt?: unknown;
  text: unknown;
  mood: unknown;
}

interface CheckedJournalInput {
  entryAt: Date;
  text: string;
  mood: number | null;
}

/**
 * Prüft Zeitpunkt, Text und Stimmung eines Eintrags — geteilt von Anlegen und Bearbeiten.
 *
 * Der Zeitpunkt darf zurückliegen (nachträglich festhalten, was vor ein paar Tagen war), aber nicht
 * in der Zukunft: mit der Spanne `CLIENT_CLOCK_SKEW_MS`, die auch das Gewicht der Uhr des Geräts
 * zugesteht. Er kommt als Date, ISO-Text oder gar nicht (dann `now`); alles andere — auch `null` —
 * ist ein ungültiger Zeitpunkt, kein stilles 1970. Der Text muss etwas enthalten — ein einzelner
 * Punkt genügt, Leerraum nicht.
 */
export function checkJournalInput(input: JournalInput, now: Date): CheckedJournalInput | ServiceErrorCode {
  const entryAt = parseEntryAt(input.entryAt, now);
  if (!entryAt) return "INVALID_DATETIME";
  if (entryAt.getTime() > now.getTime() + CLIENT_CLOCK_SKEW_MS) return "TIME_IN_FUTURE";

  if (typeof input.text !== "string" || input.text.trim() === "") return "JOURNAL_TEXT_REQUIRED";
  const text = input.text.trim();
  if (text.length > JOURNAL_TEXT_MAX) return "JOURNAL_TEXT_TOO_LONG";

  const mood = parseMood(input.mood);
  if (mood === undefined) return "JOURNAL_INVALID_MOOD";

  return { entryAt, text, mood };
}

function parseEntryAt(raw: unknown, now: Date): Date | null {
  if (raw === undefined) return now;
  const d = raw instanceof Date ? raw : typeof raw === "string" ? new Date(raw) : null;
  return d && !Number.isNaN(d.getTime()) ? d : null;
}

/** `null`/fehlend = keine Stimmung; eine ganze Zahl 1–5 = die Stimmung; alles andere `undefined`
 *  (ungültig). Ein `undefined` als Ergebnis ist also die Absage, kein „nicht angegeben". */
export function parseMood(raw: unknown): number | null | undefined {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== "number" || !Number.isInteger(raw)) return undefined;
  return raw >= JOURNAL_MOOD_MIN && raw <= JOURNAL_MOOD_MAX ? raw : undefined;
}

/** Die Leitfrage, die mit dem Eintrag gespeichert wird: eine Kopie des Fragetexts, kein Verweis.
 *  Wer Leitfragen abgeschaltet hat, speichert nie eine — egal, was der Client schickt. */
export function storedPrompt(raw: unknown, promptsEnabled: boolean): string | null {
  if (!promptsEnabled || typeof raw !== "string") return null;
  const prompt = raw.trim().slice(0, JOURNAL_PROMPT_MAX);
  return prompt === "" ? null : prompt;
}

// ── Die Sicht der Keyholderin ──────────────────────────────────────────────────────────────────

/** Die Sichtbarkeiten, die die Keyholderin überhaupt erreichen. Als ABFRAGE-Filter gedacht: eine
 *  private Zeile wird für sie gar nicht erst geladen — dann kann sie auch kein Pager, kein Zähler und
 *  kein Kalenderpunkt mitzählen. */
export const KEYHOLDER_VISIBLE = ["MOOD_ONLY", "FULL"] as const satisfies readonly JournalVisibility[];

/** Eine gespeicherte Sichtbarkeit als Stufe; ein unbekannter Wert gilt als privat — im Zweifel
 *  verbergen, wie bei der Keyholder-Sicht. */
export function asVisibility(v: string): JournalVisibility {
  return isJournalVisibility(v) ? v : "PRIVATE";
}

/** Ein Eintrag, wie ihn die Liste braucht. */
export interface JournalRow {
  id: string;
  entryAt: Date;
  text: string;
  mood: number | null;
  prompt: string | null;
  visibility: string;
}

/** Was die Keyholderin von einem Eintrag sieht. `text`/`prompt` sind bei `MOOD_ONLY` null. */
export interface KeyholderJournalRow {
  id: string;
  entryAt: Date;
  mood: number | null;
  text: string | null;
  prompt: string | null;
  visibility: (typeof KEYHOLDER_VISIBLE)[number];
}

/**
 * Projiziert geladene Einträge auf die Sicht der Keyholderin. Filtert ZUSÄTZLICH zur Abfrage: eine
 * private Zeile, die doch einmal hereinkommt (ein künftiger Aufrufer ohne {@link KEYHOLDER_VISIBLE}),
 * fällt hier heraus, statt durchzureichen. Unbekannte Werte gelten als privat — im Zweifel verbergen.
 */
export function toKeyholderView(rows: readonly JournalRow[]): KeyholderJournalRow[] {
  return rows.flatMap((r) => {
    if (r.visibility !== "FULL" && r.visibility !== "MOOD_ONLY") return [];
    const full = r.visibility === "FULL";
    return [{
      id: r.id, entryAt: r.entryAt, mood: r.mood, visibility: r.visibility,
      text: full ? r.text : null, prompt: full ? r.prompt : null,
    }];
  });
}

// ── Dauern zum Zeitpunkt eines Eintrags ───────────────────────────────────────────────────────

export interface JournalDurations {
  /** Tragedauer der Session bis `at`, Reinigungspausen abgezogen. null = zu diesem Zeitpunkt nicht
   *  verschlossen (keine Session, Session schon zu Ende, oder mitten in einer Reinigungspause). */
  lockedMs: number | null;
  /** Zeit seit dem letzten Orgasmus vor `at`. null = davor ist keiner erfasst. */
  orgasmFreeMs: number | null;
}

/**
 * Wie lange der Sub zu einem Zeitpunkt verschlossen und orgasmusfrei war — aus denselben Quellen wie
 * die Statistik: den Sessions des Session-Modells (`buildSessions`) und den Orgasmus-Zeitpunkten
 * (`orgasmTimes`). Berechnet, nicht gespeichert, damit ein rückdatierter Eintrag oder ein
 * korrigiertes Protokoll keine veraltete Zahl stehen lässt.
 *
 * Massgeblich ist die Session mit dem spätesten Beginn vor `at`. Damit greift bei der Anomalie
 * „zwei Verschlüsse ohne Öffnen dazwischen" (`Session.orphaned`, offenes Ende) für jeden Zeitpunkt
 * nach dem zweiten Verschluss die neuere Session, nicht die verwaiste.
 *
 * `sessions` in beliebiger Reihenfolge, `orgasmsAsc` aufsteigend. Die Scans sind linear — bei einer
 * Seite von 30 Einträgen ist das neben dem Laden ohne Belang.
 */
export function durationsAt(at: Date, sessions: readonly Session[], orgasmsAsc: readonly Date[]): JournalDurations {
  return { lockedMs: lockedMsAt(at.getTime(), sessions), orgasmFreeMs: orgasmFreeMsAt(at.getTime(), orgasmsAsc) };
}

function lockedMsAt(t: number, sessions: readonly Session[]): number | null {
  let current: Session | null = null;
  for (const s of sessions) {
    if (s.start.getTime() <= t && (!current || s.start.getTime() > current.start.getTime())) current = s;
  }
  if (!current) return null;

  let worn = 0;
  let inside = false;
  for (const seg of current.segments) {
    const start = seg.start.getTime();
    if (start > t) continue;
    const end = seg.end ? seg.end.getTime() : Infinity;
    if (t < end) inside = true;
    worn += Math.min(end, t) - start;
  }
  return inside ? worn : null;
}

function orgasmFreeMsAt(t: number, orgasmsAsc: readonly Date[]): number | null {
  let last: number | null = null;
  for (const o of orgasmsAsc) {
    if (o.getTime() > t) break;
    last = o.getTime();
  }
  return last === null ? null : t - last;
}

// ── Zeitraum aus der Adresse ──────────────────────────────────────────────────────────────────

/** Ein Zeitraum der Liste. `from` einschliesslich, `to` ausschliesslich; beide optional. */
export interface JournalRange {
  from?: Date;
  to?: Date;
}

/** Der Monat einer Anfrage, 0-basiert wie überall in `utils.ts`. */
export interface JournalMonth {
  year: number;
  month0: number;
}

/**
 * Die Query-Parameter einer Tagebuch-Seite als `URLSearchParams`. Die Monatswahl ist ein GET-Formular
 * ohne Skript und schickt deshalb Monat und Jahr getrennt (`m=03&y=2026`); hier werden sie zu dem
 * einen `month=2026-03`, den alle übrigen Teile lesen.
 */
export function journalParams(raw: Record<string, string | string[] | undefined>): URLSearchParams {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(raw)) if (typeof v === "string") p.set(k, v);
  const y = p.get("y");
  const m = p.get("m");
  if (y && m && !p.has("month")) p.set("month", `${y}-${m.padStart(2, "0")}`);
  p.delete("y");
  p.delete("m");
  return p;
}

/** `month=YYYY-MM` aus der Adresse — oder null, wenn er fehlt oder unlesbar ist. */
export function journalMonthOf(params: URLSearchParams): JournalMonth | null {
  const m = /^(\d{4})-(\d{2})$/.exec(params.get("month") ?? "");
  if (!m) return null;
  const year = Number(m[1]);
  const month0 = Number(m[2]) - 1;
  // Ab 1970: `Date.UTC` liest die Jahre 0–99 als 1900–1999, und vor der Unix-Zeit gibt es ohnehin
  // keine Einträge. Ein solches Jahr gilt als nicht angegeben.
  return year >= 1970 && month0 >= 0 && month0 <= 11 ? { year, month0 } : null;
}

/** `day=1..31` innerhalb des Monats — nur zusammen mit einem Monat gültig. */
export function journalDayOf(params: URLSearchParams, month: JournalMonth | null): number | null {
  if (!month) return null;
  const day = Number(params.get("day"));
  const last = new Date(Date.UTC(month.year, month.month0 + 1, 0)).getUTCDate();
  return Number.isInteger(day) && day >= 1 && day <= last ? day : null;
}

/** `YYYY-MM` für die Adresse. */
export function monthParam(m: JournalMonth): string {
  return `${m.year}-${String(m.month0 + 1).padStart(2, "0")}`;
}

/**
 * Der Zeitraum einer Listen-Anfrage aus der Adresse: ein Kalendermonat (`month=YYYY-MM`) oder ein Tag
 * darin (`day=12`), beide in der Zeitzone des Subs — der 1. März beginnt um Mitternacht DORT, nicht
 * in UTC. Fehlt der Monat oder ist er unlesbar, gibt es keine Grenze: eine kaputte Adresse zeigt die
 * neuesten Einträge statt eines Fehlers. Weitergeblättert wird nicht über eine Zeit, sondern über die
 * id des letzten Eintrags (`cursor`, journalService).
 */
export function journalRangeFromQuery(params: URLSearchParams, tz: string): JournalRange {
  const month = journalMonthOf(params);
  if (!month) return {};
  const day = journalDayOf(params, month);
  if (day !== null) {
    return {
      from: midnightOfLocalDate(month.year, month.month0, day, tz),
      to: midnightOfLocalDate(month.year, month.month0, day + 1, tz),
    };
  }
  return journalMonthRange(month, tz);
}

/** Die Seite einer Listen-Anfrage aus der Adresse: Zeitraum (`month`/`day`) und Cursor (`cursor` = id
 *  des letzten Eintrags der vorigen Seite). Eine Quelle für Seiten, API-Routen und MCP. */
export function journalPageQuery(params: URLSearchParams, tz: string): { range: JournalRange; cursor?: string } {
  return { range: journalRangeFromQuery(params, tz), cursor: params.get("cursor") ?? undefined };
}

/** Ein Kalendermonat in der Zeitzone des Subs — für Liste und Kalenderpunkte derselbe Zeitraum. */
export function journalMonthRange(month: JournalMonth, tz: string): JournalRange {
  return {
    from: midnightOfLocalDate(month.year, month.month0, 1, tz),
    to: midnightOfLocalDate(month.year, month.month0 + 1, 1, tz),
  };
}

// ── Für die Oberfläche ─────────────────────────────────────────────────────────────────────────

/** Ein Eintrag, wie ihn die Karte bekommt — Zeitpunkt als ISO-Text, weil er vom Server an eine
 *  Client-Komponente geht. `text`/`prompt` sind in der Keyholder-Sicht bei „Stimmung zeigen" null. */
export interface JournalCardEntry extends JournalDurations {
  id: string;
  entryAt: string;
  mood: number | null;
  text: string | null;
  prompt: string | null;
  visibility: string;
}

export function toCardEntry(r: (JournalRow | KeyholderJournalRow) & JournalDurations): JournalCardEntry {
  return {
    id: r.id, entryAt: r.entryAt.toISOString(), mood: r.mood, text: r.text, prompt: r.prompt,
    visibility: r.visibility, lockedMs: r.lockedMs, orgasmFreeMs: r.orgasmFreeMs,
  };
}

/** Wo das eigene Tagebuch liegt — eine Quelle für Kopfzeile, Formulare und Rücksprünge. Die
 *  Formulare liegen unter `/dashboard/new` bzw. `/dashboard/edit`, damit die Bottom-Nav dort der
 *  Aktionsleiste weicht (`isEntryFormRoute`). */
export const JOURNAL_HREF = "/dashboard/tagebuch";
export const JOURNAL_NEW_HREF = "/dashboard/new/tagebuch";
export const journalEditHref = (id: string) => `/dashboard/edit/tagebuch/${id}`;
