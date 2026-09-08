import { dateAtLocalMinutes, hhmmToMinutes } from "@/lib/utils";
import { HHMM } from "@/lib/constants";
import { weightDayKey, addWeightDays, dayNumber, endOfWeightDay, daysInMonth } from "@/lib/weight";
import { weekdayMaskHas, isoWeekdayInTZ } from "@/lib/weekdays";
import { parseJsonList } from "@/lib/jsonList";

/**
 * Der Rechenkern der Serien-Aufgaben (#26): aus einer Wiederhol-Regel die konkreten Termine.
 *
 * **Datenbankfrei und rein.** Er zählt Termine ab, prüft die Regel — mehr nicht. Das Materialisieren
 * (Termin → echte `Task`) und das Laden der Serie liegen in `taskService.ts`; derselbe Schnitt wie
 * zwischen `weightRelease.ts` (Kern) und `weightReleaseService.ts` (Bestand).
 *
 * **Ein bewusst BEGRENZTER RRULE-Ausschnitt.** Gedeckt sind genau die Fälle aus dem Issue: jeden
 * (N-ten) Tag, wöchentlich an einer Wochentags-Auswahl (jede N-te Woche), monatlich am n-ten (oder
 * letzten) Wochentag. Kein iCalendar-Volltext — die vier Muster reichen und bleiben prüfbar.
 *
 * **Zeitzonen-sicher über die getesteten Primitive.** Gezählt wird auf TAGESSCHLÜSSELN (`weight.ts`,
 * reine Kalenderarithmetik, DST-fest), der Wochentag kommt aus `isoWeekdayInTZ`, und der konkrete
 * Zeitpunkt eines Termins aus `dateAtLocalMinutes` (Wanduhr in der Zone des Trägers). Nirgends eine
 * rohe `+ 86_400_000`-Addition.
 */

export const RECURRENCE_FREQS = ["DAILY", "WEEKLY", "MONTHLY"] as const;
export type RecurrenceFreq = (typeof RECURRENCE_FREQS)[number];

/** Höchstwert für `interval` — schützt vor Zahlen, die die Termin-Zählung sinnlos machen, ohne eine
 *  reale Vorgabe zu beschneiden (jeder 366. Tag ist die grobkörnigste sinnvolle Einstellung). */
export const RECURRENCE_MAX_INTERVAL = 366;

/** Obergrenze der Vorschau/Aufzählung — Selbstschutz gegen eine Endlosschleife bei verdrehter
 *  Eingabe (etwa `until` weit in der Zukunft). ~10 Jahre Kalendertage. */
const OCCURRENCE_DAY_GUARD = 3660;

export interface RecurrenceRule {
  freq: RecurrenceFreq;
  /** Jede N-te Einheit (Tage/Wochen/Monate je `freq`), gezählt ab `startsOn`. >= 1. */
  interval: number;
  /** Wochentag-Bitmaske (`weekdays.ts`, Mo = Bit 0). WEEKLY/MONTHLY: die geforderten Tage. DAILY: null. */
  weekdayMask: number | null;
  /** MONTHLY: der wievielte `weekdayMask`-Tag im Monat (1..5) bzw. -1 = der letzte. Sonst null. */
  ordinal: number | null;
  /** Wanduhr-Zeit jedes Termins, "HH:MM", in `tz`. Wie bei den Reinigungsfenstern nicht exakt für
   *  eine Zeit, die genau in die 1-Stunden-DST-Lücke fällt (01:00–03:00 an den ~2 Umstellungstagen) —
   *  dort ist der Termin um bis zu eine Stunde ungenau (Grenze von `dateAtLocalMinutes`). */
  timeOfDay: string;
  startsOn: Date;
  until: Date | null;
  /** JSON-Array von Ausnahme-Daten ("YYYY-MM-DD"). null/leer = keine. */
  exclusionDates: string | null;
}

/** Stabiler Grund, warum eine Regel ungültig ist — `null` heisst gültig. Die Codes werden in
 *  `taskService` auf Service-Fehler abgebildet. */
export type RecurrenceProblem =
  | "RECURRENCE_FREQ"
  | "RECURRENCE_INTERVAL"
  | "RECURRENCE_WEEKDAYS"
  | "RECURRENCE_ORDINAL"
  | "RECURRENCE_TIME"
  | "RECURRENCE_UNTIL";

/** Die tolerante Lese-Seite der Ausnahme-Daten — dieselbe `jsonList`-Hülle wie die Fenster-Familien.
 *  Nur echte "YYYY-MM-DD"-Strings überleben; Murks fällt still weg. */
export function parseExclusionDates(raw: string | null): Set<string> {
  return new Set(parseJsonList(raw, (item) =>
    typeof item === "string" && /^\d{4}-\d{2}-\d{2}$/.test(item) ? item : null,
  ));
}

/** Prüft eine Wiederhol-Regel auf Widerspruchsfreiheit. Rein — keine DB, kein `now`. */
export function recurrenceProblem(rule: RecurrenceRule): RecurrenceProblem | null {
  if (!RECURRENCE_FREQS.includes(rule.freq)) return "RECURRENCE_FREQ";
  if (!Number.isInteger(rule.interval) || rule.interval < 1 || rule.interval > RECURRENCE_MAX_INTERVAL) {
    return "RECURRENCE_INTERVAL";
  }
  if (!HHMM.test(rule.timeOfDay)) return "RECURRENCE_TIME";

  if (rule.freq === "DAILY") {
    // Wochentag/Ordinal sind hier bedeutungslos; ein gesetztes Ordinal ist ein Widerspruch.
    if (rule.ordinal !== null) return "RECURRENCE_ORDINAL";
  } else {
    // WEEKLY/MONTHLY: eine leere Maske hiesse „an keinem Tag" — die Regel liefe nie.
    const mask = rule.weekdayMask;
    if (mask == null || !Number.isInteger(mask) || mask < 1 || mask > 0b111_1111) return "RECURRENCE_WEEKDAYS";
  }
  if (rule.freq === "MONTHLY") {
    const ord = rule.ordinal;
    const ok = ord === -1 || (ord != null && Number.isInteger(ord) && ord >= 1 && ord <= 5);
    if (!ok) return "RECURRENCE_ORDINAL";
  } else if (rule.freq === "WEEKLY" && rule.ordinal !== null) {
    return "RECURRENCE_ORDINAL";
  }

  if (rule.until && rule.until.getTime() < rule.startsOn.getTime()) return "RECURRENCE_UNTIL";
  return null;
}

/** 00:00 Ortszeit am Kalendertag `dayKey` in `tz` — der Start von `dayKey` ist das Ende des Vortags. */
function dayStart(dayKey: string, tz: string): Date {
  return endOfWeightDay(addWeightDays(dayKey, -1), tz);
}

/** Der konkrete Zeitpunkt eines Termins am Tag `dayKey`. */
function occurrenceInstant(dayKey: string, timeOfDay: string, tz: string): Date {
  return dateAtLocalMinutes(dayStart(dayKey, tz), hhmmToMinutes(timeOfDay), tz);
}

/** Fällt `dayKey` auf einen Termin-Tag der Regel? (Reine Kalenderprüfung, ohne Uhrzeit/Ausnahmen.) */
function isOccurrenceDay(rule: RecurrenceRule, dayKey: string, startKey: string, tz: string): boolean {
  const dn = dayNumber(dayKey);
  const sdn = dayNumber(startKey);
  if (dn < sdn) return false;

  if (rule.freq === "DAILY") return (dn - sdn) % rule.interval === 0;

  const isoDay = isoWeekdayInTZ(dayStart(dayKey, tz), tz);
  if (!weekdayMaskHas(rule.weekdayMask ?? 0, isoDay)) return false;

  if (rule.freq === "WEEKLY") {
    // Wochen-Abstand über die Montags-Tageszahl: der Montag ist `isoDay - 1` Tage vor `dayKey`, und
    // zwei Montage sind immer ein Vielfaches von 7 auseinander — die Differenz ist also eine ganze
    // Wochenzahl, ohne Rundung.
    const startIso = isoWeekdayInTZ(dayStart(startKey, tz), tz);
    const weeks = ((dn - (isoDay - 1)) - (sdn - (startIso - 1))) / 7;
    return weeks % rule.interval === 0;
  }

  // MONTHLY
  const [y, m, d] = dayKey.split("-").map(Number);
  const [sy, sm] = startKey.split("-").map(Number);
  const months = (y * 12 + (m - 1)) - (sy * 12 + (sm - 1));
  if (months % rule.interval !== 0) return false;
  return rule.ordinal === -1
    ? d + 7 > daysInMonth(y, m) // der letzte dieses Wochentags im Monat
    : Math.floor((d - 1) / 7) + 1 === rule.ordinal;
}

/**
 * Die Termine der Regel im halboffenen Intervall `(afterExclusive, throughInclusive]`.
 *
 * `afterExclusive` ist EXKLUSIV (der Generator übergibt seinen Cursor — den zuletzt verarbeiteten
 * Termin), `throughInclusive` inklusiv. Zusätzlich beschränkt auf `[startsOn, until]` und ohne die
 * Ausnahme-Tage. Aufsteigend sortiert.
 */
export function occurrencesBetween(
  rule: RecurrenceRule,
  afterExclusive: Date,
  throughInclusive: Date,
  tz: string,
): Date[] {
  const out: Date[] = [];
  if (recurrenceProblem(rule) !== null) return out;
  if (afterExclusive.getTime() >= throughInclusive.getTime()) return out;

  const startKey = weightDayKey(rule.startsOn, tz);
  const excluded = parseExclusionDates(rule.exclusionDates);
  const upper = rule.until ? Math.min(rule.until.getTime(), throughInclusive.getTime()) : throughInclusive.getTime();

  // Einen Tag vor dem Cursor beginnen: ein Termin am Cursor-Tag, dessen Uhrzeit hinter dem Cursor
  // liegt, soll noch mitkommen. Der Instant-Filter unten hält die Grenzen sauber.
  let dayKey = addWeightDays(weightDayKey(afterExclusive, tz), -1);
  const lastKey = weightDayKey(new Date(upper), tz);
  for (let guard = 0; dayNumber(dayKey) <= dayNumber(lastKey) && guard < OCCURRENCE_DAY_GUARD; guard++, dayKey = addWeightDays(dayKey, 1)) {
    if (excluded.has(dayKey)) continue;
    if (!isOccurrenceDay(rule, dayKey, startKey, tz)) continue;
    const at = occurrenceInstant(dayKey, rule.timeOfDay, tz);
    if (at.getTime() > afterExclusive.getTime() && at.getTime() <= upper) out.push(at);
  }
  return out;
}

/**
 * Die nächsten `count` Termine ab `after` (exklusiv) — für die Agenda-Vorschau. `maxDays` deckelt,
 * wie weit vorausgeschaut wird, damit eine (fast) nie greifende Regel die Vorschau nicht hängt.
 */
export function upcomingOccurrences(
  rule: RecurrenceRule,
  after: Date,
  tz: string,
  opts: { count: number; maxDays: number },
): Date[] {
  const horizon = new Date(after.getTime() + opts.maxDays * 86_400_000);
  return occurrencesBetween(rule, after, horizon, tz).slice(0, opts.count);
}
