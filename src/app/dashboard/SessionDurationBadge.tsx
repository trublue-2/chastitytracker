"use client";

import { useLocale } from "next-intl";
import { formatElapsedMs } from "@/lib/utils";
import useTick from "@/app/hooks/useTick";

export default function SessionDurationBadge({ since, pausedMs = 0 }: { since: string; pausedMs?: number }) {
  const locale = useLocale();
  useTick(1000);
  // Sekündlich tickend — ohne tabellarische Ziffern springt die Breite bei jeder Sekunde.
  // Bisher hing das daran, dass alle drei Aufrufer es von aussen mitgaben; der nächste hätte
  // es vergessen.
  return <span suppressHydrationWarning className="tabular-nums">{formatElapsedMs(Date.now() - new Date(since).getTime() - pausedMs, locale, true)}</span>;
}
