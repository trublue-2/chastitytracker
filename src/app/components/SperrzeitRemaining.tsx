"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { formatElapsedMs } from "@/lib/utils";

/**
 * Live countdown für die verbleibende Sperrzeit. Tickt jede Minute.
 * Zeigt nichts wenn endetAt in der Vergangenheit liegt.
 */
export default function SperrzeitRemaining({
  endetAt,
  className,
}: {
  endetAt: string;
  className?: string;
}) {
  const locale = useLocale();
  const t = useTranslations("admin");
  const [, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const remainingMs = new Date(endetAt).getTime() - Date.now();
  if (remainingMs <= 0) return null;

  return (
    <span suppressHydrationWarning className={className}>
      {t("sperrzeitRemainingPrefix")} {formatElapsedMs(remainingMs, locale)}
    </span>
  );
}
