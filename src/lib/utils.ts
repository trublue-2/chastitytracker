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

export function formatDateTime(date: Date | string, locale = "de-CH"): string {
  const d = new Date(date);
  return d.toLocaleString(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: APP_TZ,
  });
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
