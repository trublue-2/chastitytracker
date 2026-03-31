"use client";

import { useEffect, useState } from "react";
import { HelpCircle, Lock, LockOpen } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { toDateLocale, formatElapsedMs, APP_TZ } from "@/lib/utils";

interface Props {
  type: "VERSCHLUSS" | "OEFFNEN" | null;
  since: string | null;
}


export default function StatusBanner({ type, since }: Props) {
  const t = useTranslations("statusBanner");
  const locale = useLocale();
  const dl = toDateLocale(locale);
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60000);
    return () => clearInterval(id);
  }, []);

  if (!type || !since) {
    return (
      <div className="rounded-2xl border border-border bg-surface px-6 py-5 flex items-center gap-3">
        <HelpCircle size={24} className="text-foreground-faint flex-shrink-0" />
        <p className="text-sm text-foreground-faint">{t("noEntry")}</p>
      </div>
    );
  }

  const sinceDate = new Date(since);
  const display = formatElapsedMs(Date.now() - sinceDate.getTime(), locale);
  const isVerschlossen = type === "VERSCHLUSS";

  const bg = isVerschlossen
    ? "bg-gradient-to-br from-[var(--color-lock)] to-[var(--color-lock-muted)]"
    : "bg-gradient-to-br from-slate-700 to-slate-600";

  return (
    <div className={`${bg} rounded-2xl text-background px-4 py-4 flex items-start gap-3`}>
      <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 bg-white/10 mt-0.5">
        {isVerschlossen ? <Lock size={24} strokeWidth={2} /> : <LockOpen size={24} strokeWidth={2} />}
      </div>
      <div className="flex-1 min-w-0">
        {/* Mobile: gestapelt */}
        <div className="sm:hidden">
          <p className="text-xs font-semibold uppercase tracking-widest opacity-60 mb-0.5">{t("status")}</p>
          <p className="text-2xl font-bold leading-tight">{isVerschlossen ? t("locked") : t("opened")}</p>
          <div className="flex items-baseline gap-1.5 mt-1">
            <span className="text-xs font-semibold uppercase tracking-widest opacity-60">{t("duration")}:</span>
            <span className="text-xl font-bold tabular-nums" suppressHydrationWarning>{display}</span>
          </div>
        </div>
        {/* Desktop: nebeneinander */}
        <div className="hidden sm:flex items-start justify-between gap-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest opacity-60 mb-0.5">{t("status")}</p>
            <p className="text-2xl font-bold">{isVerschlossen ? t("locked") : t("opened")}</p>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-xs font-semibold uppercase tracking-widest opacity-60 mb-0.5">{t("duration")}</p>
            <p className="text-3xl font-bold tabular-nums leading-tight" suppressHydrationWarning>{display}</p>
          </div>
        </div>
        <p className="text-xs opacity-60 mt-1">
          {t("since")} {sinceDate.toLocaleString(dl, { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: APP_TZ })}
        </p>
      </div>
    </div>
  );
}
