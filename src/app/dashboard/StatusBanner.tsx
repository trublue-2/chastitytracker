"use client";

import { useEffect, useState } from "react";
import { HelpCircle, Lock, LockOpen } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { toDateLocale, formatElapsedMs, APP_TZ } from "@/lib/utils";

interface Props {
  type: "VERSCHLUSS" | "OEFFNEN" | null;
  since: string | null;
  /** Governing timezone of the data owner (sub). Defaults to APP_TZ (Europe/Zurich). */
  tz?: string;
}


export default function StatusBanner({ type, since, tz = APP_TZ }: Props) {
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
    : "bg-gradient-to-br from-[var(--surface-raised)] to-[var(--surface)]";

  return (
    <div className={`${bg} rounded-2xl text-background px-4 py-4 flex items-start gap-3`}>
      <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 bg-white/10 mt-0.5">
        {isVerschlossen ? <Lock size={24} strokeWidth={2} /> : <LockOpen size={24} strokeWidth={2} />}
      </div>
      <div className="flex-1 min-w-0">
        {/* Status und Dauer stehen UNTEREINANDER, auf jeder Breite. Die Dauer sass bis hierher ab
            `sm` am rechten Zeilenende — eine Karten-Entscheidung: in einem Kasten von 400 px ist
            "rechts" nah. Dieser Banner erscheint aber ausschliesslich in der Spalte des
            Keyholder-Bereichs, und die steht seit Issue #76 auf 768 px; dort ist "rechts" einen
            halben Meter weit weg, und die Zeile zerfällt in zwei Inseln mit einem Loch dazwischen.
            Was zusammengehört, bleibt zusammen; der freie Platz bleibt am Rand, wo er niemanden
            stört. Dieselbe Begründung wie bei `EventRowHead` in `SessionEventRow.tsx`.

            Nebenwirkung, die mit wegfällt: vorher standen beide Fassungen gleichzeitig im DOM, eine
            davon immer verborgen — derselbe Inhalt zweimal, doppelt zu pflegen. Und sie liefen
            bereits auseinander (die Dauer trug einmal einen Doppelpunkt und `text-xl`, einmal ein
            eigenes Label und `text-3xl`).

            Die Dauer bleibt die kleinere der beiden Zahlen: der Zustand ist die Aussage des
            Banners, die Dauer ihre Ergänzung. Gross war sie nur, weil sie den weit entfernten
            rechten Rand halten musste. */}
        <p className="text-xs font-semibold uppercase tracking-widest opacity-60 mb-0.5">{t("status")}</p>
        <p className="text-2xl font-bold leading-tight">{isVerschlossen ? t("locked") : t("opened")}</p>
        <div className="flex items-baseline gap-1.5 mt-1">
          <span className="text-xs font-semibold uppercase tracking-widest opacity-60">{t("duration")}:</span>
          <span className="text-xl font-bold tabular-nums" suppressHydrationWarning>{display}</span>
        </div>
        <p className="text-xs opacity-60 mt-1">
          {t("since")} {sinceDate.toLocaleString(dl, { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: tz })}
        </p>
      </div>
    </div>
  );
}
