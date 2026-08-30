"use client";

import { useLocale, useTranslations } from "next-intl";
import { formatElapsedMs } from "@/lib/utils";
import useRemainingMs from "@/app/hooks/useRemainingMs";

/**
 * Live countdown für die verbleibende Sperrzeit. Tickt jede Minute.
 * Zeigt nichts wenn endsAt in der Vergangenheit liegt.
 */
export default function LockPeriodRemaining({
  endsAt,
  className,
}: {
  endsAt: string;
  className?: string;
}) {
  const locale = useLocale();
  const t = useTranslations("admin");
  const remainingMs = useRemainingMs(endsAt);

  if (remainingMs === 0) return null;

  return (
    // `tabular-nums` gehört HIERHER, nicht in die zwei Aufrufer: die Zahl tickt jede Minute,
    // und eine Ziffernbreite, die sich beim Ticken ändert, lässt die Zeile zappeln.
    <span suppressHydrationWarning className={`tabular-nums ${className ?? ""}`}>
      {t("sperrzeitRemainingPrefix")} {formatElapsedMs(remainingMs, locale)}
    </span>
  );
}
