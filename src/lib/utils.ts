/** Format hours as h:mm (e.g. 6:35h). No day splitting — pure hours:minutes. */
export function formatHoursHM(h: number): string {
  const totalMin = Math.floor(h * 60);
  const hrs = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  return `${hrs}:${String(mins).padStart(2, "0")}h`;
}

export function formatHours(h: number, locale = "de"): string {
  const days = Math.floor(h / 24);
  const hours = Math.round(h % 24);
  const d = locale.startsWith("en") ? "d" : "T";
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}${d}`);
  if (hours > 0 || parts.length === 0) parts.push(`${hours}h`);
  return parts.join(" ");
}

export function formatMs(ms: number, locale = "de"): string {
  if (ms <= 0) return "–";
  const totalMinutes = Math.floor(ms / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const mins = totalMinutes % 60;
  const d = locale.startsWith("en") ? "d" : "T";
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}${d}`);
  if (hours > 0) parts.push(`${hours}h`);
  if (mins > 0 && days === 0) parts.push(`${mins}m`);
  return parts.join(" ") || "–";
}

export function formatDuration(start: Date, end: Date, locale = "de"): string {
  const ms = end.getTime() - start.getTime();
  if (ms < 0) return "–";

  const totalMinutes = Math.floor(ms / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  const d = locale.startsWith("en") ? "d" : "T";

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

/** Formats the BUILD_DATE env var as "dd.mm.yyyy, HH:mm" in APP_TZ, or "local" if unset. */
export function formatBuildDate(): string {
  if (!process.env.BUILD_DATE) return "local";
  return new Date(process.env.BUILD_DATE).toLocaleString("de-CH", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", timeZone: APP_TZ,
  });
}

/** dd.mm.yyyy, HH:mm – server-side, always CET/CEST */
export function formatDateTime(date: Date | string, locale = "de-CH"): string {
  return new Date(date).toLocaleString(locale, {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", timeZone: APP_TZ,
  });
}

/** dd.mm.yyyy – server-side, always CET/CEST */
export function formatDate(date: Date | string, locale = "de-CH"): string {
  return new Date(date).toLocaleDateString(locale, {
    day: "2-digit", month: "2-digit", year: "numeric", timeZone: APP_TZ,
  });
}

/** HH:mm – server-side, always CET/CEST */
export function formatTime(date: Date | string, locale = "de-CH"): string {
  return new Date(date).toLocaleTimeString(locale, {
    hour: "2-digit", minute: "2-digit", timeZone: APP_TZ,
  });
}

/** Returns { year, 0-based month, day } of `d` in APP_TZ. */
export function tzDateParts(d: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TZ,
    year: "numeric", month: "numeric", day: "numeric",
  }).formatToParts(d);
  const get = (type: string) => +(parts.find(p => p.type === type)?.value ?? "0");
  return { year: get("year"), month: get("month") - 1, day: get("day") };
}

/** Returns the Date representing 00:00:00 in APP_TZ on the same calendar date as `d`. */
export function midnightInTZ(d: Date): Date {
  const { year, month, day } = tzDateParts(d);
  // Compute TZ offset at noon of that calendar day (safe from DST edge cases)
  const noonUTC = Date.UTC(year, month, day, 12);
  const p = new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TZ,
    year: "numeric", month: "numeric", day: "numeric",
    hour: "numeric", minute: "numeric", second: "numeric",
    hour12: false,
  }).formatToParts(new Date(noonUTC));
  const g = (type: string) => +(p.find(x => x.type === type)?.value ?? "0");
  const h = g("hour");
  const tzNoonMs = Date.UTC(g("year"), g("month") - 1, g("day"), h === 24 ? 0 : h, g("minute"), g("second"));
  return new Date(Date.UTC(year, month, day) + (noonUTC - tzNoonMs));
}

/** Today at 00:00:00 in APP_TZ */
export function getMidnightToday(now: Date): Date {
  return midnightInTZ(now);
}

/** Start of the current ISO week (Monday 00:00:00 in APP_TZ) */
export function getWeekStart(now: Date): Date {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: APP_TZ, weekday: "short" }).formatToParts(now);
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const dow = ((map[p.find(x => x.type === "weekday")!.value] ?? 0) + 6) % 7;
  return new Date(midnightInTZ(now).getTime() - dow * 86_400_000);
}

/** First day of the current month at 00:00:00 in APP_TZ */
export function getMonthStart(now: Date): Date {
  const { year, month } = tzDateParts(now);
  return midnightInTZ(new Date(Date.UTC(year, month, 1, 12)));
}

/** Live-elapsed format: always includes minutes ("2T 3h 14min"). Takes pre-computed ms. */
export function formatElapsedMs(ms: number, locale: string, showSeconds = false): string {
  const safe = Math.max(0, ms);
  const totalSeconds = Math.floor(safe / 1000);
  const totalMinutes = Math.floor(totalSeconds / 60);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  const seconds = totalSeconds % 60;
  const d = locale === "en" ? "d" : "T";
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

export type AnforderungStatus = "open" | "overdue" | "fulfilled" | "late" | "withdrawn";
export type VerifikationStatus = "unverified" | "ai" | "manual" | "rejected";

/** Derives AnforderungStatus: was the kontrolle submitted, and was it on time?
 *  fulfilledAt is server-set at submission time and immutable – never use entryTime for deadline comparison. */
export function mapAnforderungStatus(
  k: { withdrawnAt: Date | null; entryId: string | null; deadline: Date; fulfilledAt?: Date | null },
  _entryTime: Date | null,
  now: Date
): AnforderungStatus {
  if (k.withdrawnAt) return "withdrawn";
  if (!k.entryId) return k.deadline < now ? "overdue" : "open";
  const submittedAt = k.fulfilledAt ?? null;
  if (!submittedAt) return k.deadline < now ? "late" : "fulfilled"; // Fallback für alte Daten ohne fulfilledAt
  return submittedAt > k.deadline ? "late" : "fulfilled";
}

/** Normalizes a raw verifikationStatus string to VerifikationStatus */
export function mapVerifikationStatus(vs: string | null): VerifikationStatus {
  if (vs === "ai") return "ai";
  if (vs === "manual") return "manual";
  if (vs === "rejected") return "rejected";
  return "unverified";
}


export type ReinigungSettings = { erlaubt: boolean; maxMinuten: number };

type PairResult<E, K> = {
  verschluss: E;
  oeffnen: E | null;
  active: boolean;
  kontrollen: K[];
  interruptions: { oeffnen: E; verschluss: E }[];
};

/** Builds Verschluss/Oeffnen pairs with associated Kontrollen, newest first.
 *  If reinigung settings are provided, OEFFNEN(REINIGUNG) followed by a new
 *  VERSCHLUSS within maxMinuten are treated as interruptions (not session ends). */
export function buildPairs<
  E extends { id: string; type: string; startTime: Date; oeffnenGrund?: string | null },
  K extends { time: Date }
>(entries: E[], kontrollen: K[], reinigung?: ReinigungSettings): PairResult<E, K>[] {
  const asc = [...entries]
    .filter((e) => e.type === "VERSCHLUSS" || e.type === "OEFFNEN")
    .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

  const pairs: PairResult<E, K>[] = [];
  let pending: E | null = null;
  let pendingReinigung: E | null = null;
  let currentInterruptions: { oeffnen: E; verschluss: E }[] = [];

  for (const e of asc) {
    if (e.type === "VERSCHLUSS") {
      if (pendingReinigung && pending && reinigung?.erlaubt) {
        const dt = (e.startTime.getTime() - pendingReinigung.startTime.getTime()) / 60000;
        if (dt <= reinigung.maxMinuten) {
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
    } else if (e.type === "OEFFNEN" && pending) {
      if (reinigung?.erlaubt && e.oeffnenGrund === "REINIGUNG") {
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
    if (pendingReinigung && reinigung?.erlaubt) {
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

/** Returns photo verification status for an entry */
export function photoStatus(v: { imageUrl: string | null; imageExifTime: Date | null; startTime: Date }): "no-photo" | "exif-mismatch" | "ok" {
  if (!v.imageUrl) return "no-photo";
  if (v.imageExifTime && hasExifMismatch(v.imageExifTime, v.startTime)) return "exif-mismatch";
  return "ok";
}

// ── Pair-based wearing hours (for batch range queries like StatsMain) ────────

export type WearPair = { start: Date; end: Date };

/** Builds VERSCHLUSS→OEFFNEN pairs from entries. Open sessions end at `now`. */
export function buildWearPairs(
  entries: { type: string; startTime: Date }[],
  now: Date
): WearPair[] {
  const asc = [...entries]
    .filter((e) => e.type === "VERSCHLUSS" || e.type === "OEFFNEN")
    .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
  const pairs: WearPair[] = [];
  let pending: { startTime: Date } | null = null;
  for (const e of asc) {
    if (e.type === "VERSCHLUSS") {
      if (pending) pairs.push({ start: pending.startTime, end: now });
      pending = e;
    } else if (e.type === "OEFFNEN" && pending) {
      pairs.push({ start: pending.startTime, end: e.startTime });
      pending = null;
    }
  }
  if (pending) pairs.push({ start: pending.startTime, end: now });
  return pairs;
}

/** Calculates wearing hours from pre-built pairs within a date range. */
export function wearingHoursFromPairs(pairs: WearPair[], rangeStart: Date, rangeEnd: Date): number {
  let totalMs = 0;
  for (const p of pairs) {
    const overlap = Math.min(p.end.getTime(), rangeEnd.getTime()) - Math.max(p.start.getTime(), rangeStart.getTime());
    if (overlap > 0) totalMs += overlap;
  }
  return totalMs / 3600000;
}

// ── Entry-based wearing hours (single-shot calculations) ─────────────────────

/** Berechnet effektive Tragedauer in Stunden innerhalb eines Zeitraums.
 *  Jedes OEFFNEN (inkl. REINIGUNG) stoppt die Tragedauer – Pausen werden
 *  dadurch automatisch ausgeschlossen. Das reinigung-Param wird für die
 *  Signatur-Kompatibilität beibehalten, ändert aber die Berechnung nicht. */
export function wearingHoursInRange(
  entries: { type: string; startTime: Date; oeffnenGrund?: string | null }[],
  from: Date,
  to: Date,
  _reinigung?: ReinigungSettings
): number {
  const sorted = [...entries]
    .filter((e) => e.type === "VERSCHLUSS" || e.type === "OEFFNEN")
    .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

  let total = 0;
  let wearStart: Date | null = null;

  for (const e of sorted) {
    if (e.type === "VERSCHLUSS") {
      wearStart = e.startTime;
    } else if (e.type === "OEFFNEN" && wearStart) {
      const s = Math.max(wearStart.getTime(), from.getTime());
      const end = Math.min(e.startTime.getTime(), to.getTime());
      if (end > s) total += end - s;
      wearStart = null;
    }
  }
  if (wearStart) {
    const s = Math.max(wearStart.getTime(), from.getTime());
    const end = to.getTime();
    if (end > s) total += end - s;
  }

  return total / (1000 * 60 * 60);
}

/** Wearing hours for today / current week / current month. */
export function calculateWearingHoursByRange(
  entries: { type: string; startTime: Date; oeffnenGrund?: string | null }[],
  now: Date,
  reinigung: ReinigungSettings
): { tagH: number; wocheH: number; monatH: number } {
  return {
    tagH: wearingHoursInRange(entries, getMidnightToday(now), now, reinigung),
    wocheH: wearingHoursInRange(entries, getWeekStart(now), now, reinigung),
    monatH: wearingHoursInRange(entries, getMonthStart(now), now, reinigung),
  };
}

type KontrollAnforderungIn = {
  id: string; code: string; deadline: Date; kommentar: string | null;
  fulfilledAt: Date | null; createdAt: Date; withdrawnAt: Date | null; entryId: string | null;
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

export function toDatetimeLocal(date: Date | string | null | undefined): string {
  if (!date) return "";
  const d = new Date(date);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TZ,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(d);
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? "00";
  const hour = get("hour") === "24" ? "00" : get("hour");
  return `${get("year")}-${get("month")}-${get("day")}T${hour}:${get("minute")}`;
}
