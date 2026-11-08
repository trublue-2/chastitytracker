/** Maps next-intl locale codes to BCP 47 locale tags for Intl formatting. */
export function toDateLocale(locale: string): string {
  return locale === "en" ? "en-US" : "de-CH";
}

/** App timezone – all server-side date formatting uses this. */
export const APP_TZ = "Europe/Zurich";

/** Formats the BUILD_DATE env var as "dd.mm.yyyy, HH:mm" in APP_TZ, or "local" if unset. */
export function formatBuildDate(): string {
  if (!process.env.BUILD_DATE) return "local";
  return new Date(process.env.BUILD_DATE).toLocaleString("de-CH", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", timeZone: APP_TZ,
  });
}

/** dd.mm.yyyy, HH:mm – formatted in `tz` (default APP_TZ = the sub's governing timezone) */
export function formatDateTime(date: Date | string, locale = "de-CH", tz = APP_TZ): string {
  return new Date(date).toLocaleString(locale, {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", timeZone: tz,
  });
}

/** dd.mm.yyyy – formatted in `tz` (default APP_TZ) */
export function formatDate(date: Date | string, locale = "de-CH", tz = APP_TZ): string {
  return new Date(date).toLocaleDateString(locale, {
    day: "2-digit", month: "2-digit", year: "numeric", timeZone: tz,
  });
}

/** HH:mm – formatted in `tz` (default APP_TZ) */
export function formatTime(date: Date | string, locale = "de-CH", tz = APP_TZ): string {
  return new Date(date).toLocaleTimeString(locale, {
    hour: "2-digit", minute: "2-digit", timeZone: tz,
  });
}

/** dd.mm. (no year) – formatted in `tz` (default APP_TZ) */
export function formatDayMonth(date: Date | string, locale = "de-CH", tz = APP_TZ): string {
  return new Date(date).toLocaleDateString(locale, {
    day: "2-digit", month: "2-digit", timeZone: tz,
  });
}

/** "Month YYYY" – formatted in `tz` (default APP_TZ) */
export function formatMonthYear(date: Date | string, locale = "de-CH", tz = APP_TZ): string {
  return new Date(date).toLocaleDateString(locale, {
    month: "long", year: "numeric", timeZone: tz,
  });
}

/** Eigener Formatter statt `offsetFormatter`: dessen `hour12:false` liefert an lokaler Mitternacht
 *  je nach ICU `hour: "24"` MIT dem Datum des Vortags — für reine Datums-Teile wäre das der falsche
 *  Tag. Ohne Stunden-Feld tritt der Fall nicht auf. Cache-Begründung siehe `memoFormatter`. */
const datePartsFormatters = new Map<string, Intl.DateTimeFormat>();

/**
 * Returns { year, 0-based month, day } of `d` in `tz`.
 *
 * `tz` ist hier und in der ganzen Wanduhr-Familie darunter (`dateAtLocalMinutes`, `midnightInTZ`,
 * `getMidnightToday`, `mondayIndex`, `get{Week,Month,Year}{Start,End}`) PFLICHT — bewusst ohne
 * `= APP_TZ`-Default. Der Default machte das Vergessen unsichtbar: der Aufruf kompilierte, lieferte
 * eine plausible Schweizer Antwort und wich für jede Sub ausserhalb Europe/Zurich still von der
 * Grenze ab, die dieselbe Regel anderswo mit der Sub-Zeitzone zieht. Genau so entstanden vier
 * unabhängige Fehler (Strafbuch-Kontingent, KG-Tragestunden, Kategorie-Ziele, Timeline-Buckets),
 * von denen keiner im Diff auffiel — ein fehlendes Argument sieht nach nichts aus.
 * Wo die globale Sicht wirklich gemeint ist, wird `APP_TZ` explizit übergeben; dann steht die
 * Absicht am Aufruf statt in der Signatur. Die reinen Anzeige-Formatierer oben behalten ihren
 * Default: dort ist der Rückfall auf die Betrachter-Sicht richtig.
 */
export function tzDateParts(d: Date, tz: string): { year: number; month: number; day: number } {
  const parts = memoFormatter(datePartsFormatters, tz, {
    year: "numeric", month: "numeric", day: "numeric",
  }).formatToParts(d);
  const get = (type: string) => +(parts.find(p => p.type === type)?.value ?? "0");
  return { year: get("year"), month: get("month") - 1, day: get("day") };
}

/** Stabiler Schlüssel des Kalendertags von `d` in `tz` — zum Gruppieren/Zählen je Tag.
 *  Format ist bewusst opak (nur Gleichheit zählt, nie parsen). */
export function tzDayKey(d: Date, tz: string): string {
  const { year, month, day } = tzDateParts(d, tz);
  return dayKeyOfLocalDate(year, month, day);
}

/** Derselbe Schlüssel wie `tzDayKey`, aber für einen Kalendertag, der schon als ZAHLEN vorliegt.
 *  Wer eine Tages-Karte per `tzDayKey` füllt und sie in einer Kalender-Schleife wieder ausliest,
 *  nimmt hier die Gegenseite — statt das Format ein zweites Mal von Hand zu buchstabieren. */
export function dayKeyOfLocalDate(year: number, month: number, day: number): string {
  return `${year}-${month}-${day}`;
}

/** Kern der „Dual"-Formatierer: Primär in der Betrachter-Zeitzone plus — nur wenn `viewerTz` gesetzt
 *  ist, von `subTz` abweicht UND ein anderer Wert herauskommt — die Sub-Lokalzeit als Zusatz
 *  „· <subLabel> …". Tag-Grenzen-sicher via `tzDateParts` (DST/Mitternacht): gleicher Kalendertag →
 *  nur Uhrzeit, anderer Tag → Datum+Uhrzeit. `primaryFn` bestimmt das Primär-Format (mit/ohne Jahr).
 *  Ohne `viewerTz` oder bei gleicher tz → reiner Primärwert (grüne Ansicht bleibt unverändert). */
function formatDual(
  date: Date | string,
  locale: string,
  viewerTz: string | undefined,
  subTz: string,
  subLabel: string,
  primaryFn: (d: Date, l: string, tz: string) => string,
): string {
  const d = new Date(date);
  const primary = primaryFn(d, locale, viewerTz ?? subTz);
  if (!viewerTz || viewerTz === subTz) return primary;
  const v = tzDateParts(d, viewerTz);
  const s = tzDateParts(d, subTz);
  const sameDay = v.year === s.year && v.month === s.month && v.day === s.day;
  const subTime = formatTime(d, locale, subTz);
  // Gleicher Offset zum Instant (z.B. Zürich vs Berlin) → identische Wanduhr → kein redundanter Zusatz.
  if (sameDay && subTime === formatTime(d, locale, viewerTz)) return primary;
  const sub = sameDay ? subTime : `${formatDayMonth(d, locale, subTz)} ${subTime}`;
  return `${primary} · ${subLabel} ${sub}`;
}

/** dd.mm.yyyy, HH:mm in der Betrachter-Zeitzone; bei abweichender Sub-Zeitzone zusätzlich die
 *  Sub-Lokalzeit. Siehe `formatDual`. */
export function formatDateTimeDual(date: Date | string, locale: string, viewerTz: string | undefined, subTz: string, subLabel: string): string {
  return formatDual(date, locale, viewerTz, subTz, subLabel, formatDateTime);
}

/** Wie `formatDateTimeDual`, aber Primär OHNE Jahr (dd.mm. HH:mm) — für kompakte Zeilen (Banner). */
export function formatDayTimeDual(date: Date | string, locale: string, viewerTz: string | undefined, subTz: string, subLabel: string): string {
  return formatDual(date, locale, viewerTz, subTz, subLabel, (d, l, tz) => `${formatDayMonth(d, l, tz)} ${formatTime(d, l, tz)}`);
}

/** `Intl.DateTimeFormat` ist teuer im Bau (Locale-/TZ-Daten-Lookup), aber zustandslos und damit
 *  beliebig wiederverwendbar. Gecacht pro Zeitzone: `StatsMain` ruft `midnightInTZ` einmal pro
 *  Kalendertag auf (~120 pro Render) — ohne Cache wären das ebenso viele Wegwerf-Formatter.
 *  Der Schlüsselraum ist durch die IANA-Zonen der User beschränkt, ein LRU wäre Overkill. */
function memoFormatter(cache: Map<string, Intl.DateTimeFormat>, tz: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  let fmt = cache.get(tz);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-US", { timeZone: tz, ...options });
    cache.set(tz, fmt);
  }
  return fmt;
}

const offsetFormatters = new Map<string, Intl.DateTimeFormat>();

function offsetFormatter(tz: string): Intl.DateTimeFormat {
  return memoFormatter(offsetFormatters, tz, {
    hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

/**
 * Wie weit `tz` zum Instant `utcMs` VOR UTC liegt, in Millisekunden (CET = +1h → 3_600_000).
 *
 * Das ist nur das Mess-Primitiv. Welcher Instant als ANKER gemessen wird — und ob ein zweiter
 * Pass nötig ist — entscheidet jeder Aufrufer selbst:
 *   · `dateAtLocalMinutes` – Anker der Ziel-Instant selbst, 1 Pass (`midnightInTZ` = Minute 0)
 *   · `fromDatetimeLocal`  – 2 Pässe (Nachmessen am Kandidaten), am genauesten
 * Die verbleibende 1-Pass/2-Pass-Trennung NICHT aufheben. Der zweite Pass löst Wanduhrzeiten in der
 * Stunde nach einer Vorwärts-Wende korrekt auf, faltet aber eine nicht existierende Mitternacht auf
 * den VORTAG zurück — in Zonen mit Wende um 00:00 (America/Santiago, Asia/Beirut) bekäme
 * `midnightInTZ` damit den falschen Kalendertag. Für Wanduhrzeiten aus User-Eingaben ist der zweite
 * Pass richtig, für Tages-Grenzen der erste.
 */
export function tzOffsetMsAt(utcMs: number, tz: string): number {
  const p = offsetFormatter(tz).formatToParts(new Date(utcMs));
  const g = (type: string) => +(p.find(x => x.type === type)?.value ?? "0");
  const h = g("hour") === 24 ? 0 : g("hour");
  return Date.UTC(g("year"), g("month") - 1, g("day"), h, g("minute"), g("second")) - utcMs;
}

/** Returns the Date at `minutesSinceMidnight` local wall-clock time in `tz`, on the
 *  same calendar date as `d`. DST-safe for times reasonably far from a transition: looks up the UTC
 *  offset actually in effect AT that wall-clock instant, anchored at the target time itself — so e.g.
 *  a window end of 04:00 on a spring-forward day still resolves correctly, unlike naively adding a
 *  flat millisecond offset to the day's midnight. Not exact for a target that falls exactly inside
 *  the 1-hour DST gap/fold itself (01:00–03:00 local on the ~2 transition days/year) — no real
 *  cleaning window is configured there. */
export function dateAtLocalMinutes(d: Date, minutesSinceMidnight: number, tz: string): Date {
  const { year, month, day } = tzDateParts(d, tz);
  const guessUTC = Date.UTC(year, month, day, 0, minutesSinceMidnight);
  // Anker ist der Ziel-Instant selbst (ein Pass) — siehe tzOffsetMsAt.
  return new Date(guessUTC - tzOffsetMsAt(guessUTC, tz));
}

/** Returns the Date representing 00:00:00 in `tz` on the same calendar date as `d`. */
export function midnightInTZ(d: Date, tz: string): Date {
  return dateAtLocalMinutes(d, 0, tz);
}

/**
 * 00:00 Ortszeit in `tz` an einem Kalendertag, der als ZAHLEN vorliegt (Jahr/Monat/Tag) — nicht als
 * Instant. `month`/`day` dürfen überlaufen (Monat 12 = Januar des Folgejahres), wie bei `Date.UTC`.
 *
 * Nicht ersetzbar durch `midnightInTZ(new Date(Date.UTC(y, m, d, 12)), tz)`: dieser Umweg baut aus
 * den Zahlen erst einen Instant (Mittag UTC) und liest dessen Kalendertag zurück — ab UTC+12 ist
 * Mittag UTC lokal aber schon der FOLGETAG (Auckland: 12:00Z am 1. = 00:00 am 2.). Der Monatsanfang
 * landete so für Subs in Auckland, Fidschi oder Kiritimati auf dem Zweiten, und der erste Tag jedes
 * Monats und Jahres fiel aus der Auswertung.
 */
export function midnightOfLocalDate(year: number, month: number, day: number, tz: string): Date {
  const guessUTC = Date.UTC(year, month, day);
  // Anker ist der Ziel-Instant selbst (ein Pass) — Begründung bei `tzOffsetMsAt`.
  const first = guessUTC - tzOffsetMsAt(guessUTC, tz);
  // Liegt die Zeitumstellung zwischen 00:00 UTC und der lokalen Mitternacht (Zonen östlich von UTC,
  // z.B. Auckland am 05.04.), misst der Anker die falsche Seite der Wende und die Mitternacht
  // läge um eine Stunde daneben. Dann nachmessen — aber nur übernehmen, wenn das Ergebnis die
  // Mitternacht wirklich trifft (sonst, wie in Santiago/Beirut, bei der nicht existierenden
  // Mitternacht, bleibt es beim ersten Pass).
  const offsetAtFirst = tzOffsetMsAt(first, tz);
  if (guessUTC - first === offsetAtFirst) return new Date(first);
  const second = guessUTC - offsetAtFirst;
  return new Date(tzOffsetMsAt(second, tz) === offsetAtFirst ? second : first);
}

/** Today at 00:00:00 in `tz` */
export function getMidnightToday(now: Date, tz: string): Date {
  return midnightInTZ(now, tz);
}

/**
 * 00:00 Ortszeit `days` Kalendertage nach dem Tag von `now` (negativ = davor). `days: 1` ist die
 * NÄCHSTE Mitternacht — die Periodengrenze, an der Trainingsziele standardmässig zu laufen beginnen.
 *
 * Bewusst über den KALENDERTAG (`tzDateParts` → `midnightOfLocalDate`) statt über `+ n * 86_400_000`
 * auf einem Mitternachts-Instant: an einem Zeitumstellungstag hat der Tag 23 oder 25 Stunden, und
 * die Millisekunden-Addition landet dann auf 23:00 bzw. 01:00 statt auf Mitternacht. Der Tag ist
 * eine Kalendergrösse, keine feste Dauer.
 */
export function midnightAfterDays(now: Date, tz: string, days: number): Date {
  const { year, month, day } = tzDateParts(now, tz);
  return midnightOfLocalDate(year, month, day + days, tz);
}

const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

const weekdayFormatters = new Map<string, Intl.DateTimeFormat>();

/** Die Uhrzeit eines Instants in `tz` als „HH:MM" — 24h, fest mit ":" für den lexikalischen
 *  Vergleich gegen Fenster-Grenzen.
 *
 *  Hier und nicht in den Fenster-Bausteinen: „wie spät ist es in Zone X" ist keine Regel der
 *  Reinigung und keine des Wiegens. Die Trennung, die `weightWindows.ts` gegenüber
 *  `cleaningService.ts` verteidigt, betrifft die REGELN der Fenster — nicht die Uhr. */
const hhmmFormatters = new Map<string, Intl.DateTimeFormat>();

export function hhmmInTZ(at: Date, tz: string): string {
  // Gecacht: die Reinigungs- und Wiege-Fenster fragen das je Eintrag, und die Strafbuch-Ableitung
  // geht über die ganze Historie. Ein Wegwerf-Formatter je Aufruf war dort der teuerste Teil.
  //
  // Die Sprache spielt hier keine Rolle — `hourCycle: "h23"` nagelt die Uhr fest, unabhängig davon.
  // Vorher stand `en-GB` da; gemessen über 288 Zonen-/Zeit-Kombinationen liefert `en-US` dasselbe.
  // Deshalb braucht `memoFormatter` KEINEN Sprach-Parameter: einer wäre eine Stellschraube, die
  // nichts stellt, und ein Cache-Schlüssel ohne sie wäre die Falle dazu.
  return memoFormatter(hhmmFormatters, tz, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(at);
}

/** „HH:MM" → Minuten seit Mitternacht (0–1439). */
export function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** Die Gegenrichtung: Minuten seit Mitternacht → „HH:MM". `1440` wird zu `24:00` — als ENDE einer
 *  Spanne ist das Tagesende gemeint, nicht Mitternacht des Folgetags. Steht neben
 *  {@link hhmmToMinutes}, damit Hin- und Rückweg nicht getrennt voneinander driften. */
export function hhmmFromMinutes(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/** Wochentag des Instants `d` in `tz`, montagsbasiert: Mo=0 … So=6.
 *  Liegt der Kalendertag schon als ZAHLEN vor, ist `mondayIndexOfLocalDate` richtig — nicht erst
 *  einen Anker-Instant bauen, um ihn hier wieder in einen Wochentag zurückzuverwandeln. */
export function mondayIndex(d: Date, tz: string): number {
  // `memoFormatter` statt eines frischen `Intl.DateTimeFormat` je Aufruf: die Konstruktion kostet
  // rund das Zwanzigfache einer Formatierung und war damit teurer als alle übrigen Zeitzonen-
  // Auflösungen einer Perioden-Berechnung zusammen — `getWeekStart` ruft dies je Kategorie-Zeile.
  const wd = memoFormatter(weekdayFormatters, tz, { weekday: "short" })
    .formatToParts(d).find(p => p.type === "weekday")!.value;
  return ((WEEKDAY_INDEX[wd] ?? 0) + 6) % 7;
}

/**
 * Wochentag eines als ZAHLEN gegebenen Kalendertags, montagsbasiert: Mo=0 … So=6. `month`/`day`
 * dürfen überlaufen, wie bei `Date.UTC`.
 *
 * Bewusst OHNE `tz` — und das ist keine vergessene Pflichtangabe, sondern die Aussage: der
 * 1. Januar 2026 ist überall auf der Welt ein Donnerstag. Der Wochentag hängt am Datum, nicht am
 * Ort. Wer stattdessen `mondayIndex(<Anker-Instant>, tz)` rechnet, macht ihn scheinbar ortsabhängig
 * und liegt bei einem Mittags-UTC-Anker ab UTC+12 einen Tag daneben (Kalender um eine Spalte
 * verschoben). Dieselbe Zahlen-statt-Instant-Regel wie bei `midnightOfLocalDate` und `dayKeyOfLocalDate`.
 */
export function mondayIndexOfLocalDate(year: number, month: number, day: number): number {
  return (new Date(Date.UTC(year, month, day)).getUTCDay() + 6) % 7;
}

/** Start of the current ISO week (Monday 00:00:00 in `tz`) — `midnightAfterDays` statt einer
 *  Millisekunden-Subtraktion, damit die Wochengrenze auch in der Umstellungswoche auf Mitternacht
 *  fällt und nicht auf 23:00 des Sonntags davor. */
export function getWeekStart(now: Date, tz: string): Date {
  return midnightAfterDays(now, tz, -mondayIndex(now, tz));
}

/** First day of the current month at 00:00:00 in `tz` */
export function getMonthStart(now: Date, tz: string): Date {
  const { year, month } = tzDateParts(now, tz);
  return midnightOfLocalDate(year, month, 1, tz);
}

/** Exclusive end of the current month: first day of the NEXT month at 00:00:00 in `tz` */
export function getMonthEnd(now: Date, tz: string): Date {
  const { year, month } = tzDateParts(now, tz);
  return midnightOfLocalDate(year, month + 1, 1, tz);
}

/** Jan 1 of the year of `now` at 00:00:00 in `tz` */
export function getYearStart(now: Date, tz: string): Date {
  const { year } = tzDateParts(now, tz);
  return midnightOfLocalDate(year, 0, 1, tz);
}

/** Exclusive end of the year of `now`: Jan 1 of the NEXT year at 00:00:00 in `tz` */
export function getYearEnd(now: Date, tz: string): Date {
  const { year } = tzDateParts(now, tz);
  return midnightOfLocalDate(year + 1, 0, 1, tz);
}

/**
 * Kalendertag-Index eines Instants in `tz` — Tage seit Epoch der ÖRTLICHEN Datumsangabe.
 *
 * Bewusst NICHT `(b - a) / 86_400_000`: in einer Zeitumstellungswoche hat ein Tag 23 oder 25
 * Stunden, und die Millisekunden-Division zählt dann 364.96 Tage für ein volles Jahr. Der Kalender
 * kennt keine halben Tage.
 */
export function localDayIndex(d: Date, tz: string): number {
  const { year, month, day } = tzDateParts(d, tz);
  return Math.round(Date.UTC(year, month, day) / 86_400_000);
}

/** Ganze Kalendertage zwischen zwei Instants in `tz` (halboffen: `[a, b)`). */
export function calendarDaysBetween(a: Date, b: Date, tz: string): number {
  return localDayIndex(b, tz) - localDayIndex(a, tz);
}

const datetimeLocalFormatters = new Map<string, Intl.DateTimeFormat>();

export function toDatetimeLocal(date: Date | string | null | undefined, tz = APP_TZ): string {
  if (!date) return "";
  const d = new Date(date);
  // Auch hier ohne Sprach-Angabe: die Teile werden EINZELN gelesen und selbst zusammengesetzt, die
  // Reihenfolge und die Trennzeichen der Sprache kommen also nie zum Tragen. Vorher `en-CA`.
  const parts = memoFormatter(datetimeLocalFormatters, tz, {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(d);
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? "00";
  const hour = get("hour") === "24" ? "00" : get("hour");
  return `${get("year")}-${get("month")}-${get("day")}T${hour}:${get("minute")}`;
}

/** "Now" as a datetime-local wall-clock string in `tz` — the server-computed default for a fresh
 *  `<input type="datetime-local">`. Passing this fixed string from server to client keeps the
 *  useState initializer hydration-safe (no nondeterministic `new Date()` on the client). */
export const nowDatetimeLocal = (tz = APP_TZ): string => toDatetimeLocal(new Date(), tz);

/**
 * Inverse of `toDatetimeLocal`: interprets a "YYYY-MM-DDTHH:mm" wall-clock string as being in `tz`
 * and returns the corresponding UTC instant. Use for the submit path of `<input type="datetime-local">`
 * — the raw string is a naked wall-clock, so `new Date(string)` (which parses as BROWSER-local) is
 * wrong once the governing tz differs from the browser. Invalid input → Invalid Date.
 * `fromDatetimeLocal(toDatetimeLocal(d, tz), tz)` round-trips to `d` at minute precision.
 */
export function fromDatetimeLocal(local: string | null | undefined, tz = APP_TZ): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(local ?? "");
  if (!m) return new Date(NaN);
  const [y, mo, d, h, mi] = [+m[1], +m[2], +m[3], +m[4], +m[5]];
  const guessUTC = Date.UTC(y, mo - 1, d, h, mi);
  // Two-pass: the offset measured at the raw guess can land on the wrong side of a DST change; the
  // second pass evaluates it at the candidate instant, which is correct except inside the ~1h
  // spring-forward gap (a wall-clock that doesn't exist locally — the result stays a valid instant).
  const candidate = guessUTC - tzOffsetMsAt(guessUTC, tz);
  return new Date(guessUTC - tzOffsetMsAt(candidate, tz));
}
