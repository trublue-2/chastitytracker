/** Format hours as h:mm (e.g. 6:35h). No day splitting — pure hours:minutes. */
export function formatHoursHM(h: number): string {
  const totalMin = Math.floor(h * 60);
  const hrs = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  return `${hrs}:${String(mins).padStart(2, "0")}h`;
}

/** formatHoursHM without the trailing "h" — for compact "x / y h" goal readouts. */
export function formatHoursHMCompact(h: number): string {
  return formatHoursHM(h).slice(0, -1);
}

/** Einheiten-Kürzel für „Tage" nach Locale. Prefix-Vergleich, damit auch regionale Tags
 *  (`"en-US"`, `"en-GB"`) als Englisch zählen — `"de-CH"` bleibt bei "T". */
function dayUnit(locale: string): string {
  return locale.startsWith("en") ? "d" : "T";
}

export function formatHours(h: number, locale = "de"): string {
  const days = Math.floor(h / 24);
  const hours = Math.round(h % 24);
  const d = dayUnit(locale);
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}${d}`);
  if (hours > 0 || parts.length === 0) parts.push(`${hours}h`);
  return parts.join(" ");
}

/** Auf eine Nachkommastelle runden. */
export const round1 = (n: number) => Math.round(n * 10) / 10;

/** Millisekunden → Stunden, auf eine Nachkommastelle gerundet. */
export const msToHours = (ms: number) => round1(ms / 3_600_000);

/** Zerlegt eine Dauer in Tage/Stunden/Minuten/Sekunden (jeweils abgerundet, Rest-basiert).
 *  Nur die ZERLEGUNG ist geteilt — die Zusammensetzung bleibt je Formatter eigen, weil sich
 *  Einheiten ("m" vs "min"), Null-Behandlung ("–") und Minuten-Unterdrückung unterscheiden. */
export function decomposeMs(ms: number): { days: number; hours: number; minutes: number; seconds: number } {
  const totalSeconds = Math.floor(ms / 1000);
  const totalMinutes = Math.floor(totalSeconds / 60);
  return {
    days: Math.floor(totalMinutes / 1440),
    hours: Math.floor((totalMinutes % 1440) / 60),
    minutes: totalMinutes % 60,
    seconds: totalSeconds % 60,
  };
}

export function formatMs(ms: number, locale = "de"): string {
  if (ms <= 0) return "–";
  const { days, hours, minutes: mins } = decomposeMs(ms);
  const d = dayUnit(locale);
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}${d}`);
  if (hours > 0) parts.push(`${hours}h`);
  if (mins > 0 && days === 0) parts.push(`${mins}m`);
  return parts.join(" ") || "–";
}

export function formatDuration(start: Date, end: Date, locale = "de"): string {
  const ms = end.getTime() - start.getTime();
  if (ms < 0) return "–";

  const { days, hours, minutes } = decomposeMs(ms);
  const d = dayUnit(locale);

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}${d}`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0 || parts.length === 0) parts.push(`${minutes}min`);

  return parts.join(" ");
}

/** Maps next-intl locale codes to BCP 47 locale tags for Intl formatting. */
export function toDateLocale(locale: string): string {
  return locale === "en" ? "en-US" : "de-CH";
}

/** App timezone – all server-side date formatting uses this. */
export const APP_TZ = "Europe/Zurich";

/** Klemmt eine Zahl auf [min, max] und rundet; ungültige/0-Werte fallen auf `fallback`. */
export function clamp(value: number, { min, max, fallback }: { min: number; max: number; fallback: number }): number {
  return Math.max(min, Math.min(max, Math.round(value) || fallback));
}

/** Client-side sibling of {@link clamp}: parses a raw `<input type="number">` string value and
 *  clamps it. Shared by admin number-input toggles (AutoKontrolleToggle, InspectionEscalationToggle)
 *  so the parse+clamp behavior can't drift between them. */
export function clampInputValue(v: string, min: number, max: number, fallback: number): number {
  return Math.max(min, Math.min(max, Number(v) || fallback));
}

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

/** Returns { year, 0-based month, day } of `d` in `tz` (default APP_TZ). */
export function tzDateParts(d: Date, tz = APP_TZ): { year: number; month: number; day: number } {
  const parts = memoFormatter(datePartsFormatters, tz, {
    year: "numeric", month: "numeric", day: "numeric",
  }).formatToParts(d);
  const get = (type: string) => +(parts.find(p => p.type === type)?.value ?? "0");
  return { year: get("year"), month: get("month") - 1, day: get("day") };
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

/** Returns the Date at `minutesSinceMidnight` local wall-clock time in `tz` (default APP_TZ), on the
 *  same calendar date as `d`. DST-safe for times reasonably far from a transition: looks up the UTC
 *  offset actually in effect AT that wall-clock instant, anchored at the target time itself — so e.g.
 *  a window end of 04:00 on a spring-forward day still resolves correctly, unlike naively adding a
 *  flat millisecond offset to the day's midnight. Not exact for a target that falls exactly inside
 *  the 1-hour DST gap/fold itself (01:00–03:00 local on the ~2 transition days/year) — no real
 *  cleaning window is configured there. */
export function dateAtLocalMinutes(d: Date, minutesSinceMidnight: number, tz = APP_TZ): Date {
  const { year, month, day } = tzDateParts(d, tz);
  const guessUTC = Date.UTC(year, month, day, 0, minutesSinceMidnight);
  // Anker ist der Ziel-Instant selbst (ein Pass) — siehe tzOffsetMsAt.
  return new Date(guessUTC - tzOffsetMsAt(guessUTC, tz));
}

/** Returns the Date representing 00:00:00 in `tz` (default APP_TZ) on the same calendar date as `d`. */
export function midnightInTZ(d: Date, tz = APP_TZ): Date {
  return dateAtLocalMinutes(d, 0, tz);
}

/** Today at 00:00:00 in `tz` (default APP_TZ) */
export function getMidnightToday(now: Date, tz = APP_TZ): Date {
  return midnightInTZ(now, tz);
}

const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Wochentag von `d` in `tz`, montagsbasiert: Mo=0 … So=6. */
export function mondayIndex(d: Date, tz = APP_TZ): number {
  const wd = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" })
    .formatToParts(d).find(p => p.type === "weekday")!.value;
  return ((WEEKDAY_INDEX[wd] ?? 0) + 6) % 7;
}

/** Start of the current ISO week (Monday 00:00:00 in `tz`, default APP_TZ) */
export function getWeekStart(now: Date, tz = APP_TZ): Date {
  return new Date(midnightInTZ(now, tz).getTime() - mondayIndex(now, tz) * 86_400_000);
}

/** First day of the current month at 00:00:00 in `tz` (default APP_TZ) */
export function getMonthStart(now: Date, tz = APP_TZ): Date {
  const { year, month } = tzDateParts(now, tz);
  return midnightInTZ(new Date(Date.UTC(year, month, 1, 12)), tz);
}

/** Exclusive end of the current month: first day of the NEXT month at 00:00:00 in `tz` (default APP_TZ) */
export function getMonthEnd(now: Date, tz = APP_TZ): Date {
  const { year, month } = tzDateParts(now, tz);
  return midnightInTZ(new Date(Date.UTC(year, month + 1, 1, 12)), tz);
}

/** Jan 1 of the year of `now` at 00:00:00 in `tz` (default APP_TZ) */
export function getYearStart(now: Date, tz = APP_TZ): Date {
  const { year } = tzDateParts(now, tz);
  return midnightInTZ(new Date(Date.UTC(year, 0, 1, 12)), tz);
}

/** Exclusive end of the year of `now`: Jan 1 of the NEXT year at 00:00:00 in `tz` (default APP_TZ) */
export function getYearEnd(now: Date, tz = APP_TZ): Date {
  const { year } = tzDateParts(now, tz);
  return midnightInTZ(new Date(Date.UTC(year + 1, 0, 1, 12)), tz);
}

/** Live-elapsed format: always includes minutes ("2T 3h 14min"). Takes pre-computed ms. */
export function formatElapsedMs(ms: number, locale: string, showSeconds = false): string {
  const { days, hours, minutes, seconds } = decomposeMs(Math.max(0, ms));
  const d = dayUnit(locale);
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}${d}`);
  if (hours > 0) parts.push(`${hours}h`);
  parts.push(`${minutes}min`);
  if (showSeconds) parts.push(`${String(seconds).padStart(2, "0")}s`);
  return parts.join(" ");
}

/** True if EXIF time differs from entry time by more than 1 hour */
export function hasExifMismatch(exifTime: Date, startTime: Date): boolean {
  return Math.abs(exifTime.getTime() - startTime.getTime()) > 3_600_000;
}

/** Tolerance for "Zeit korrigiert" detection: 5 minutes */
export const TIME_CORRECTION_THRESHOLD_MS = 300_000;

/** True if the user-provided time is more than 5 minutes before the server submission time */
export function isTimeCorrected(time: Date, submittedAt: Date | null | undefined): boolean {
  if (!submittedAt) return false;
  return time.getTime() < submittedAt.getTime() - TIME_CORRECTION_THRESHOLD_MS;
}

export type AnforderungStatus = "open" | "overdue" | "fulfilled" | "late" | "withdrawn" | "scheduled";
export type VerifikationStatus = "unverified" | "pending" | "ai" | "manual" | "rejected";

/** True if a deadline passed without a timely completion — completed after the deadline, or not
 *  yet completed and the deadline is already past. Shared primitive behind the Kontrolle "late"
 *  status and the Strafbuch late-lock / cleaning-relock detectors (src/lib/strafbuch.ts). */
export function isPastDeadlineUnfulfilled(deadline: Date, completedAt: Date | null, now: Date): boolean {
  return completedAt ? completedAt > deadline : deadline < now;
}

/** Derives AnforderungStatus: was the kontrolle submitted, and was it on time?
 *  fulfilledAt is server-set at submission time and immutable – never use entryTime for deadline comparison.
 *  `scheduled`: keyholder-set, not yet triggered (wirksamAb in the future) — only ever surfaced in
 *  keyholder views (the Sub never sees scheduled directives). */
export function mapAnforderungStatus(
  k: { withdrawnAt: Date | null; entryId: string | null; deadline: Date; fulfilledAt?: Date | null; wirksamAb?: Date | null },
  _entryTime: Date | null,
  now: Date
): AnforderungStatus {
  if (k.withdrawnAt) return "withdrawn";
  if (!k.entryId) {
    if (k.wirksamAb && k.wirksamAb > now) return "scheduled";
    return k.deadline < now ? "overdue" : "open";
  }
  return isPastDeadlineUnfulfilled(k.deadline, k.fulfilledAt ?? null, now) ? "late" : "fulfilled";
}

/** Normalizes a raw verifikationStatus string to VerifikationStatus */
export function mapVerifikationStatus(vs: string | null): VerifikationStatus {
  if (vs === "ai") return "ai";
  if (vs === "manual") return "manual";
  if (vs === "rejected") return "rejected";
  if (vs === "pending") return "pending";
  return "unverified";
}


export type ReinigungSettings = { erlaubt: boolean; maxMinuten: number };

/** Type-pair definition for pair-building. KG_PAIR is the default; WEAR_PAIR is for
 *  user-defined non-KG categories (Plug, Collar, etc.). */
export type PairTypes = { close: string; open: string };
export const KG_PAIR: PairTypes = { close: "VERSCHLUSS", open: "OEFFNEN" };
export const WEAR_PAIR: PairTypes = { close: "WEAR_BEGIN", open: "WEAR_END" };

/** Keine `categoryId`-Option: nach Kategorie zu paaren ist strukturell falsch, weil zwei Geräte
 *  derselben Kategorie gleichzeitig getragen werden können — der Ein-Slot-Zustandsautomat unten
 *  bildet immer nur EIN offenes Gerät ab. Wer je Kategorie rechnen will, paart je GERÄT und
 *  gruppiert danach: `wearSessionPairsByCategory` / `wearHourPairsByCategory` in `sessionModel.ts`. */
export type BuildPairsOptions = {
  types?: PairTypes;
  /** Only honored when `types === KG_PAIR`. Ignored for WEAR_PAIR. */
  reinigung?: ReinigungSettings;
};

type PairResult<E, K> = {
  verschluss: E;
  oeffnen: E | null;
  active: boolean;
  kontrollen: K[];
  interruptions: { oeffnen: E; verschluss: E }[];
};

/** True iff the legacy 3rd arg shape (a bare ReinigungSettings) was passed. */
function isLegacyReinigungArg(arg: unknown): arg is ReinigungSettings {
  return !!arg && typeof arg === "object"
    && "erlaubt" in arg
    && !("types" in arg) && !("reinigung" in arg);
}

function normalizeBuildPairsOptions(
  arg?: ReinigungSettings | BuildPairsOptions,
): { types: PairTypes; reinigung: ReinigungSettings | undefined } {
  if (!arg) return { types: KG_PAIR, reinigung: undefined };
  if (isLegacyReinigungArg(arg)) return { types: KG_PAIR, reinigung: arg };
  return { types: arg.types ?? KG_PAIR, reinigung: arg.reinigung };
}

/** Filters entries to the given pair-types, then sorts ascending by startTime. */
function filterAndSortPairEntries<E extends { type: string; startTime: Date }>(
  entries: E[],
  types: PairTypes,
): E[] {
  return [...entries]
    .filter((e) => e.type === types.close || e.type === types.open)
    .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
}

/** Builds close/open pairs with associated Kontrollen, newest first.
 *  Defaults to KG (VERSCHLUSS/OEFFNEN). Pass `{ types: WEAR_PAIR }` for user-defined categories —
 *  dann aber je GERÄT (siehe `buildWearSessions`), nie über eine ganze Kategorie hinweg.
 *  Reinigungs-interruption only applies to KG pairs.
 *
 *  Backward-compat: a bare `ReinigungSettings` as the 3rd arg is accepted (legacy callers). */
export function buildPairs<
  E extends {
    id: string;
    type: string;
    startTime: Date;
    oeffnenGrund?: string | null;
    device?: { categoryId?: string | null } | null;
  },
  K extends { time: Date }
>(
  entries: E[],
  kontrollen: K[],
  reinigungOrOptions?: ReinigungSettings | BuildPairsOptions,
): PairResult<E, K>[] {
  const { types, reinigung } = normalizeBuildPairsOptions(reinigungOrOptions);
  const reinigungActive = types === KG_PAIR && reinigung?.erlaubt === true;

  const asc = filterAndSortPairEntries(entries, types);

  const pairs: PairResult<E, K>[] = [];
  let pending: E | null = null;
  let pendingReinigung: E | null = null;
  let currentInterruptions: { oeffnen: E; verschluss: E }[] = [];

  for (const e of asc) {
    if (e.type === types.close) {
      if (pendingReinigung && pending && reinigungActive) {
        const dt = (e.startTime.getTime() - pendingReinigung.startTime.getTime()) / 60000;
        if (dt <= reinigung!.maxMinuten) {
          // Valid interruption – continue session
          currentInterruptions.push({ oeffnen: pendingReinigung, verschluss: e });
          pendingReinigung = null;
        } else {
          // Timeout – close session at reinigung OEFFNEN, start new session
          pairs.push({ verschluss: pending, oeffnen: pendingReinigung, active: false, kontrollen: [], interruptions: currentInterruptions });
          pendingReinigung = null;
          currentInterruptions = [];
          pending = e;
        }
      } else {
        if (pending) pairs.push({ verschluss: pending, oeffnen: null, active: false, kontrollen: [], interruptions: currentInterruptions });
        currentInterruptions = [];
        pending = e;
      }
    } else if (e.type === types.open && pending) {
      if (reinigungActive && e.oeffnenGrund === "REINIGUNG") {
        pendingReinigung = e;
      } else {
        if (pendingReinigung) {
          // Pending reinigung never got a re-lock in time → close at reinigung OEFFNEN
          pairs.push({ verschluss: pending, oeffnen: pendingReinigung, active: false, kontrollen: [], interruptions: currentInterruptions });
          pendingReinigung = null;
          currentInterruptions = [];
          pending = null;
        } else {
          pairs.push({ verschluss: pending, oeffnen: e, active: false, kontrollen: [], interruptions: currentInterruptions });
          currentInterruptions = [];
          pending = null;
        }
      }
    }
  }

  // Handle open session (still wearing or pending reinigung)
  if (pending) {
    if (pendingReinigung && reinigungActive) {
      // Device is currently open for cleaning – show session as ended at reinigung OEFFNEN.
      // If user re-locks within maxMinuten, the next page load will merge it as an interruption.
      pairs.push({ verschluss: pending, oeffnen: pendingReinigung, active: false, kontrollen: [], interruptions: currentInterruptions });
    } else {
      pairs.push({ verschluss: pending, oeffnen: null, active: true, kontrollen: [], interruptions: currentInterruptions });
    }
  }

  for (const k of kontrollen) {
    const pair = pairs.reduce<PairResult<E, K> | null>((best, p) => {
      const start = p.verschluss.startTime.getTime();
      const end = p.oeffnen ? p.oeffnen.startTime.getTime() : Infinity;
      if (k.time.getTime() < start || k.time.getTime() > end) return best;
      if (!best) return p;
      return p.verschluss.startTime > best.verschluss.startTime ? p : best;
    }, null);
    if (pair) pair.kontrollen.push(k);
  }

  return pairs.reverse();
}

/** Total pause duration from interruptions in ms */
export function interruptionPauseMs(interruptions: { oeffnen: { startTime: Date }; verschluss: { startTime: Date } }[]): number {
  return interruptions.reduce((s, i) => s + i.verschluss.startTime.getTime() - i.oeffnen.startTime.getTime(), 0);
}

/** Maps built pairs (from `buildPairs`) to completed sessions with interruption-adjusted
 *  duration. Drops open pairs and non-positive durations. */
export function completedPairsFrom<E extends { startTime: Date }>(
  pairs: { verschluss: E; oeffnen: E | null; interruptions: { oeffnen: E; verschluss: E }[] }[],
): { verschluss: E; oeffnen: E; durationMs: number }[] {
  return pairs
    .filter((p) => p.oeffnen !== null)
    .map((p) => ({
      verschluss: p.verschluss,
      oeffnen: p.oeffnen!,
      durationMs: p.oeffnen!.startTime.getTime() - p.verschluss.startTime.getTime() - interruptionPauseMs(p.interruptions),
    }))
    .filter((p) => p.durationMs > 0);
}

/** Aggregates completed session pairs: count, total/avg duration, longest & shortest pair.
 *  Generic over the pair shape — only `durationMs` is required. */
export function summarizeSessions<T extends { durationMs: number }>(completed: T[]): {
  count: number;
  totalMs: number;
  avgMs: number;
  longest: T | null;
  shortest: T | null;
} {
  const count = completed.length;
  const totalMs = completed.reduce((s, p) => s + p.durationMs, 0);
  return {
    count,
    totalMs,
    avgMs: count ? Math.round(totalMs / count) : 0,
    longest: count ? completed.reduce((a, b) => (a.durationMs > b.durationMs ? a : b)) : null,
    shortest: count ? completed.reduce((a, b) => (a.durationMs < b.durationMs ? a : b)) : null,
  };
}

/** Returns photo verification status for an entry */
export function photoStatus(v: { imageUrl: string | null; imageExifTime: Date | null; startTime: Date }): "no-photo" | "exif-mismatch" | "ok" {
  if (!v.imageUrl) return "no-photo";
  if (v.imageExifTime && hasExifMismatch(v.imageExifTime, v.startTime)) return "exif-mismatch";
  return "ok";
}

// ── Pair-based wearing hours (for batch range queries like StatsMain) ────────

export type WearPair = { start: Date; end: Date };

/** Baut die KG-Trageintervalle (VERSCHLUSS→OEFFNEN); eine offene Session endet bei `now`.
 *
 *  BEWUSST nur KG: der eine `pending`-Slot genügt, weil immer nur EIN Gürtel getragen wird. Für
 *  Trage-Kategorien (Plug, Halsband …) taugt dieser Automat nicht — dort können zwei Geräte
 *  gleichzeitig laufen, und ein zweiter Beginn schlösse das erste Paar bei `now` statt beim
 *  Beginn. Deshalb nimmt die Funktion keine `types`/`categoryId` mehr entgegen: die
 *  Trage-Kategorien gehen über `wearHourPairsByCategory` (paart je GERÄT). */
export function buildKgWearPairs<
  E extends { type: string; startTime: Date }
>(entries: E[], now: Date): WearPair[] {
  const asc = filterAndSortPairEntries(entries, KG_PAIR);
  const pairs: WearPair[] = [];
  let pending: { startTime: Date } | null = null;
  for (const e of asc) {
    if (e.type === KG_PAIR.close) {
      if (pending) pairs.push({ start: pending.startTime, end: now });
      pending = e;
    } else if (e.type === KG_PAIR.open && pending) {
      pairs.push({ start: pending.startTime, end: e.startTime });
      pending = null;
    }
  }
  if (pending) pairs.push({ start: pending.startTime, end: now });
  return pairs;
}

/** Verschmilzt überlappende (und aneinandergrenzende) Intervalle zu einer überlappungsfreien,
 *  aufsteigenden Folge — aus getragener Zeit wird damit WANDUHR-Zeit: zwei gleichzeitig getragene
 *  Geräte derselben Kategorie ergeben 2 h, nicht 4 h.
 *
 *  Nötig, weil `wearingHoursFromPairs` stumpf aufsummiert; überlappende Paare zählte es doppelt.
 *  KG-Paare überlappen nie (ein Gürtel), Trage-Paare je Gerät sehr wohl. */
export function mergeWearPairs(pairs: WearPair[]): WearPair[] {
  const asc = [...pairs].sort((a, b) => a.start.getTime() - b.start.getTime());
  const merged: WearPair[] = [];
  for (const p of asc) {
    const last = merged[merged.length - 1];
    if (last && p.start.getTime() <= last.end.getTime()) {
      if (p.end.getTime() > last.end.getTime()) last.end = p.end;
    } else {
      merged.push({ start: p.start, end: p.end });
    }
  }
  return merged;
}

/** Calculates wearing hours from pre-built pairs within a date range.
 *  Summiert stumpf — überlappende Paare zählen doppelt. Wer Wanduhr-Zeit will, gibt hier bereits
 *  verschmolzene Paare hinein (`mergeWearPairs` / `wearHourPairsByCategory`). */
export function wearingHoursFromPairs(pairs: WearPair[], rangeStart: Date, rangeEnd: Date): number {
  let totalMs = 0;
  for (const p of pairs) {
    const overlap = Math.min(p.end.getTime(), rangeEnd.getTime()) - Math.max(p.start.getTime(), rangeStart.getTime());
    if (overlap > 0) totalMs += overlap;
  }
  return totalMs / 3600000;
}

/** Gesamtstunden aller Paare, ohne Zeitraum-Grenze (dieselbe Doppelzähl-Regel wie oben). */
export function totalWearHours(pairs: WearPair[]): number {
  return pairs.reduce((sum, p) => sum + (p.end.getTime() - p.start.getTime()), 0) / 3600000;
}

/** KG-Tragestunden für heute / laufende Woche / Monat / Jahr.
 *  Baut die Paare einmal und nutzt sie für alle vier Zeiträume (statt vier voller Sortierungen). */
export function calculateWearingHoursByRange<
  E extends {
    type: string;
    startTime: Date;
    oeffnenGrund?: string | null;
  }
>(
  entries: E[],
  now: Date,
): { tagH: number; wocheH: number; monatH: number; jahrH: number } {
  const pairs = buildKgWearPairs(entries, now);
  return {
    tagH: wearingHoursFromPairs(pairs, getMidnightToday(now), now),
    wocheH: wearingHoursFromPairs(pairs, getWeekStart(now), now),
    monatH: wearingHoursFromPairs(pairs, getMonthStart(now), now),
    jahrH: wearingHoursFromPairs(pairs, getYearStart(now), now),
  };
}

type KontrollAnforderungIn = {
  id: string; code: string; deadline: Date; kommentar: string | null;
  fulfilledAt: Date | null; createdAt: Date; withdrawnAt: Date | null; entryId: string | null;
  wirksamAb?: Date | null;
  entry: { id: string; startTime: Date; imageUrl: string | null; note: string | null; verifikationStatus: string | null } | null;
};
type PruefungEntryIn = {
  id: string; startTime: Date; imageUrl: string | null; note: string | null;
  kontrollCode: string | null; verifikationStatus: string | null;
};
export type KontrolleItem = {
  id: string; time: Date; imageUrl: string | null; code: string | null;
  deadline: Date | null; kommentar: string | null; note: string | null;
  anforderungStatus: AnforderungStatus | null; verifikationStatus: VerifikationStatus | null;
  entryId: string | null; submittedAt: Date | null;
};

/** Builds a unified KontrolleItem list from KontrollAnforderungen + standalone PRUEFUNG entries. */
export function buildKontrolleItems(
  alleAnforderungen: KontrollAnforderungIn[],
  pruefungEntries: PruefungEntryIn[],
  now: Date
): KontrolleItem[] {
  const linkedEntryIds = new Set(alleAnforderungen.map(k => k.entryId).filter(Boolean));
  return [
    ...alleAnforderungen.map(k => ({
      id: k.id,
      time: k.entry ? k.entry.startTime : k.createdAt,
      imageUrl: k.entry?.imageUrl ?? null,
      code: k.code,
      deadline: k.deadline,
      kommentar: k.kommentar ?? null,
      note: k.entry?.note ?? null,
      anforderungStatus: mapAnforderungStatus(k, k.entry?.startTime ?? null, now),
      verifikationStatus: k.entry ? mapVerifikationStatus(k.entry.verifikationStatus) : null,
      entryId: k.entry?.id ?? null,
      submittedAt: k.fulfilledAt ?? null,
    })),
    ...pruefungEntries
      .filter(e => !linkedEntryIds.has(e.id))
      .map(e => ({
        id: e.id,
        time: e.startTime,
        imageUrl: e.imageUrl,
        code: e.kontrollCode,
        deadline: null as Date | null,
        kommentar: null as string | null,
        note: e.note,
        anforderungStatus: null,
        verifikationStatus: mapVerifikationStatus(e.verifikationStatus),
        entryId: e.id,
        submittedAt: null as Date | null,
      })),
  ];
}

export function toDatetimeLocal(date: Date | string | null | undefined, tz = APP_TZ): string {
  if (!date) return "";
  const d = new Date(date);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
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
