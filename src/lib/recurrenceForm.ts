import { fromDatetimeLocal, toDatetimeLocal, toDateLocale } from "@/lib/utils";
import { ALL_WEEKDAYS } from "@/lib/weekdays";
import { type RecurrenceFreq } from "@/lib/taskRecurrence";
import type { RecurrenceInput } from "@/lib/taskService";

/**
 * Die REINE Form-Logik der Wiederhol-Regel — Zustand ⇄ Nutzlast, Frequenz-Schlüssel, Formatierer.
 *
 * Bewusst OHNE `"use client"`: die Serien-Bearbeitung befüllt das Formular auf dem SERVER vor
 * (`recurrenceFromRow`), die Eingabe-Komponente `RecurrenceFields` liest dieselben Helfer im
 * Browser. Läge das in der Client-Komponente, könnte die Server-Seite es nicht aufrufen.
 */

/** Der Bearbeitungs-Zustand der Wiederhol-Regel — Rohwerte, wie sie in den Feldern stehen. */
export interface RecurrenceValue {
  freq: RecurrenceFreq;
  interval: string;
  weekdayMask: number;
  ordinal: number;
  timeOfDay: string;
  startsOn: string; // "YYYY-MM-DD"
  until: string;    // "YYYY-MM-DD" oder ""
}

/** Frequenz → i18n-Schlüssel (Label bzw. Intervall-Einheit) — EINE Quelle, geteilt von Formular und
 *  Serien-Liste, statt in jeder Sicht ein Ternär oder einen zusammengesetzten Schlüssel. */
export const FREQ_LABEL_KEY: Record<RecurrenceFreq, string> = { DAILY: "freqDaily", WEEKLY: "freqWeekly", MONTHLY: "freqMonthly" };
export const FREQ_UNIT_KEY: Record<RecurrenceFreq, string> = { DAILY: "unitDays", WEEKLY: "unitWeeks", MONTHLY: "unitMonths" };
export const FREQ_ORDER = ["DAILY", "WEEKLY", "MONTHLY"] as const;

/** Der Formatierer für einen Serien-Termin — Wochentag + Datum + Uhrzeit in der Sub-Zone. Geteilt
 *  von der Agenda-Vorschau und der Serien-Liste, damit beide dieselbe Schreibweise nennen. */
export function occurrenceFormatter(locale: string, tz: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat(toDateLocale(locale), { timeZone: tz, weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

/** Vorbelegung: wöchentlich, alle Tage, 09:00, ab heute. `today` kommt server-gerechnet in der
 *  Sub-Zone herein (hydrations-sicher). */
export function initialRecurrence(today: string): RecurrenceValue {
  return { freq: "WEEKLY", interval: "1", weekdayMask: ALL_WEEKDAYS, ordinal: 2, timeOfDay: "09:00", startsOn: today, until: "" };
}

/** Der Bearbeitungs-Zustand aus einer gespeicherten Serien-Zeile — die Umkehrung von
 *  {@link recurrencePayload} fürs Vorbefüllen beim Ändern. Datums-Instants werden in der Sub-Zone auf
 *  „YYYY-MM-DD" zurückgezogen. */
export function recurrenceFromRow(
  row: { freq: RecurrenceFreq; interval: number; weekdayMask: number | null; ordinal: number | null; timeOfDay: string; startsOn: string; until: string | null },
  tz: string,
): RecurrenceValue {
  return {
    freq: row.freq,
    interval: String(row.interval),
    weekdayMask: row.weekdayMask ?? ALL_WEEKDAYS,
    ordinal: row.ordinal ?? 2,
    timeOfDay: row.timeOfDay,
    startsOn: toDatetimeLocal(row.startsOn, tz).slice(0, 10),
    until: row.until ? toDatetimeLocal(row.until, tz).slice(0, 10) : "",
  };
}

/** Ein Tages-Datum als Instant in der Zone des Trägers — Mittag bzw. Tagesende, damit der Kalendertag
 *  über alle Zeitzonen erhalten bleibt (der Dienst zieht `startsOn` auf die lokale Mitternacht). */
function dateToInstant(date: string, endOfDay: boolean, tz: string): string | null {
  if (!date) return null;
  return fromDatetimeLocal(`${date}T${endOfDay ? "23:59" : "12:00"}`, tz).toISOString();
}

/** Der Zustand als Regel-Nutzlast für Dienst/Vorschau. Wochentage/Ordinal nur, wo sie zählen. */
export function recurrencePayload(v: RecurrenceValue, tz: string): RecurrenceInput {
  return {
    freq: v.freq,
    interval: Math.max(1, Math.round(Number(v.interval) || 1)),
    weekdayMask: v.freq === "DAILY" ? null : v.weekdayMask,
    ordinal: v.freq === "MONTHLY" ? v.ordinal : null,
    timeOfDay: v.timeOfDay,
    // Leeres Startdatum → leerer String (nicht „heute"): so überspringt die Agenda-Vorschau es und
    // der Dienst weist es ab, statt still auf heute auszuweichen.
    startsOn: dateToInstant(v.startsOn, false, tz) ?? "",
    until: dateToInstant(v.until, true, tz),
    exclusionDates: null,
  };
}
