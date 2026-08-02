"use client";

import { useLocale, useTranslations } from "next-intl";
import { formatElapsedMs } from "@/lib/utils";
import useRemainingMs from "@/app/hooks/useRemainingMs";

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
  const remainingMs = useRemainingMs(endetAt);

  if (remainingMs === 0) return null;

  return (
    <span suppressHydrationWarning className={className}>
      {t("sperrzeitRemainingPrefix")} {formatElapsedMs(remainingMs, locale)}
    </span>
  );
}
