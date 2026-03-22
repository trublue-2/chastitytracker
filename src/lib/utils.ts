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

/** Today at 00:00:00 local time */
export function getMidnightToday(now: Date): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Start of the current ISO week (Monday 00:00:00 local time) */
export function getWeekStart(now: Date): Date {
  const d = new Date(now);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  d.setHours(0, 0, 0, 0);
  return d;
}

/** First day of the current month at 00:00:00 local time */
export function getMonthStart(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

/** True if EXIF time differs from entry time by more than 1 hour */
export function hasExifMismatch(exifTime: Date, startTime: Date): boolean {
  return Math.abs(exifTime.getTime() - startTime.getTime()) > 3_600_000;
}

export type AnforderungStatus = "open" | "overdue" | "fulfilled" | "late" | "withdrawn";
export type VerifikationStatus = "unverified" | "ai" | "manual" | "rejected";

/** Derives AnforderungStatus: was the kontrolle submitted, and was it on time? */
export function mapAnforderungStatus(
  k: { withdrawnAt: Date | null; entryId: string | null; deadline: Date },
  entryTime: Date | null,
  now: Date
): AnforderungStatus {
  if (k.withdrawnAt) return "withdrawn";
  if (!k.entryId || !entryTime) return k.deadline < now ? "overdue" : "open";
  return entryTime > k.deadline ? "late" : "fulfilled";
}

/** Normalizes a raw verifikationStatus string to VerifikationStatus */
export function mapVerifikationStatus(vs: string | null): VerifikationStatus {
  if (vs === "ai") return "ai";
  if (vs === "manual") return "manual";
  if (vs === "rejected") return "rejected";
  return "unverified";
}


/** Builds Verschluss/Oeffnen pairs with associated Kontrollen, newest first */
export function buildPairs<
  E extends { id: string; type: string; startTime: Date },
  K extends { time: Date }
>(entries: E[], kontrollen: K[]): { verschluss: E; oeffnen: E | null; active: boolean; kontrollen: K[] }[] {
  const asc = [...entries]
    .filter((e) => e.type === "VERSCHLUSS" || e.type === "OEFFNEN")
    .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

  const pairs: { verschluss: E; oeffnen: E | null; active: boolean; kontrollen: K[] }[] = [];
  let pending: E | null = null;

  for (const e of asc) {
    if (e.type === "VERSCHLUSS") {
      if (pending) pairs.push({ verschluss: pending, oeffnen: null, active: false, kontrollen: [] });
      pending = e;
    } else if (e.type === "OEFFNEN" && pending) {
      pairs.push({ verschluss: pending, oeffnen: e, active: false, kontrollen: [] });
      pending = null;
    }
  }
  if (pending) pairs.push({ verschluss: pending, oeffnen: null, active: true, kontrollen: [] });

  for (const k of kontrollen) {
    const pair = pairs.reduce<{ verschluss: E; oeffnen: E | null; active: boolean; kontrollen: K[] } | null>((best, p) => {
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

/** Returns photo verification status for an entry */
export function photoStatus(v: { imageUrl: string | null; imageExifTime: Date | null; startTime: Date }): "no-photo" | "exif-mismatch" | "ok" {
  if (!v.imageUrl) return "no-photo";
  if (v.imageExifTime && hasExifMismatch(v.imageExifTime, v.startTime)) return "exif-mismatch";
  return "ok";
}

/** Berechnet Tragedauer in Stunden innerhalb eines Zeitraums. */
export function wearingHoursInRange(
  entries: { type: string; startTime: Date }[],
  from: Date,
  to: Date
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

export function toDatetimeLocal(date: Date | string | null | undefined): string {
  if (!date) return "";
  const d = new Date(date);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
