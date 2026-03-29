"use client";

import { useEffect, useState } from "react";
import { useLocale } from "next-intl";
import { formatElapsedMs } from "@/lib/utils";

export default function SessionDurationBadge({ since, pausedMs = 0 }: { since: string; pausedMs?: number }) {
  const locale = useLocale();
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 60000);
    return () => clearInterval(id);
  }, []);
  return <span suppressHydrationWarning>{formatElapsedMs(Date.now() - new Date(since).getTime() - pausedMs, locale)}</span>;
}
