"use client";

import { useLocale, useTranslations } from "next-intl";
import { formatElapsedMs } from "@/lib/utils";
import useTick from "@/app/hooks/useTick";

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
  useTick(60_000);

  const remainingMs = new Date(endetAt).getTime() - Date.now();
  if (remainingMs <= 0) return null;

  return (
    <span suppressHydrationWarning className={className}>
      {t("sperrzeitRemainingPrefix")} {formatElapsedMs(remainingMs, locale)}
    </span>
  );
}
