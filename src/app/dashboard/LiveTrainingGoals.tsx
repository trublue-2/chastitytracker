"use client";

import { useTranslations } from "next-intl";
import { formatHoursHM } from "@/lib/utils";
import { useLiveHours } from "@/app/hooks/useLiveHours";

function ProgressBar({ actual, target, label }: { actual: number; target: number; label: string }) {
  if (target <= 0) return null;
  const pct = Math.min(100, Math.round((actual / target) * 100));
  const color = pct >= 100 ? "bg-white" : pct >= 70 ? "bg-white/70" : "bg-white/40";
  const fmt = (h: number) => formatHoursHM(h).slice(0, -1);
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-white/70 w-11 shrink-0">{label}</span>
      <div className="w-16 sm:w-24 bg-white/15 rounded-full h-1.5 overflow-hidden shrink-0">
        <div className={`h-1.5 rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-white/60 tabular-nums text-right shrink-0 w-[7.5rem]">{fmt(actual)} / {fmt(target)}h</span>
      <span className="text-xs font-semibold text-white w-9 text-right shrink-0">{pct}%</span>
    </div>
  );
}

interface Props {
  serverNow: string;
  tagH: number;
  wocheH: number;
  monatH: number;
  activeVorgabe: {
    minProTagH: number | null;
    minProWocheH: number | null;
    minProMonatH: number | null;
  };
}

export default function LiveTrainingGoals({ serverNow, tagH: baseTagH, wocheH: baseWocheH, monatH: baseMonatH, activeVorgabe }: Props) {
  const t = useTranslations("dashboard");
  const tagH = useLiveHours(baseTagH, serverNow, true);
  const wocheH = useLiveHours(baseWocheH, serverNow, true);
  const monatH = useLiveHours(baseMonatH, serverNow, true);

  return (
    <div className="mt-4 pt-3 border-t border-white/20 flex flex-col gap-2">
      <p className="text-xs font-semibold uppercase tracking-wider text-emerald-100/70 mb-1">
        {t("trainingGoals")}
      </p>
      {activeVorgabe.minProTagH != null && (
        <ProgressBar actual={tagH} target={activeVorgabe.minProTagH} label={t("day")} />
      )}
      {activeVorgabe.minProWocheH != null && (
        <ProgressBar actual={wocheH} target={activeVorgabe.minProWocheH} label={t("week")} />
      )}
      {activeVorgabe.minProMonatH != null && (
        <ProgressBar actual={monatH} target={activeVorgabe.minProMonatH} label={t("month")} />
      )}
    </div>
  );
}
