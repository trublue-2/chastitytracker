"use client";

import { useTranslations } from "next-intl";
import GoalProgressRow from "@/app/components/GoalProgressRow";
import { useLiveHours } from "@/app/hooks/useLiveHours";

interface Props {
  serverNow: string;
  tagH: number;
  wocheH: number;
  monatH: number;
  jahrH: number;
  activeVorgabe: {
    minProTagH: number | null;
    minProWocheH: number | null;
    minProMonatH: number | null;
    minProJahrH: number | null;
  };
}

export default function LiveTrainingGoals({ serverNow, tagH: baseTagH, wocheH: baseWocheH, monatH: baseMonatH, jahrH: baseJahrH, activeVorgabe }: Props) {
  const t = useTranslations("dashboard");
  const tagH = useLiveHours(baseTagH, serverNow, true);
  const wocheH = useLiveHours(baseWocheH, serverNow, true);
  const monatH = useLiveHours(baseMonatH, serverNow, true);
  const jahrH = useLiveHours(baseJahrH, serverNow, true);

  return (
    <div className="mt-4 pt-3 border-t border-white/20 flex flex-col gap-2">
      <p className="text-xs font-semibold uppercase tracking-wider text-emerald-100/70 mb-1">
        {t("kgGoals")}
      </p>
      {activeVorgabe.minProTagH != null && (
        <GoalProgressRow tone="onAccent" actual={tagH} target={activeVorgabe.minProTagH} label={t("day")} />
      )}
      {activeVorgabe.minProWocheH != null && (
        <GoalProgressRow tone="onAccent" actual={wocheH} target={activeVorgabe.minProWocheH} label={t("week")} />
      )}
      {activeVorgabe.minProMonatH != null && (
        <GoalProgressRow tone="onAccent" actual={monatH} target={activeVorgabe.minProMonatH} label={t("month")} />
      )}
      {activeVorgabe.minProJahrH != null && (
        <GoalProgressRow tone="onAccent" actual={jahrH} target={activeVorgabe.minProJahrH} label={t("year")} />
      )}
    </div>
  );
}
