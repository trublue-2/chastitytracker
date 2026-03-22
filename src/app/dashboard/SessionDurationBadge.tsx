"use client";

import { useEffect, useState } from "react";
import { useLocale } from "next-intl";

function elapsed(from: Date, locale: string): string {
  const ms = Date.now() - from.getTime();
  const totalMinutes = Math.floor(ms / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  const dayUnit = locale === "en" ? "d" : "T";
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}${dayUnit}`);
  if (hours > 0) parts.push(`${hours}h`);
  parts.push(`${minutes}min`);
  return parts.join(" ");
}

export default function SessionDurationBadge({ since }: { since: string }) {
  const locale = useLocale();
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 60000);
    return () => clearInterval(id);
  }, []);
  return <span suppressHydrationWarning>{elapsed(new Date(since), locale)}</span>;
}
