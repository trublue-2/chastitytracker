"use client";

import { useLocale } from "next-intl";
import { formatElapsedMs } from "@/lib/utils";
import useTick from "@/app/hooks/useTick";

export default function SessionDurationBadge({ since, pausedMs = 0 }: { since: string; pausedMs?: number }) {
  const locale = useLocale();
  useTick(1000);
  return <span suppressHydrationWarning>{formatElapsedMs(Date.now() - new Date(since).getTime() - pausedMs, locale, true)}</span>;
}
