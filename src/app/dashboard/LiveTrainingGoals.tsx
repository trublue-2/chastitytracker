"use client";

import { useTranslations } from "next-intl";
import GoalProgressRows from "@/app/components/GoalProgressRows";
import { useLiveHours } from "@/app/hooks/useLiveHours";
import type { VorgabeTargets } from "@/lib/goalFulfillment";

interface Props {
  serverNow: string;
  tagH: number;
  wocheH: number;
  monatH: number;
  jahrH: number;
  activeVorgabe: VorgabeTargets;
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
      <GoalProgressRows
        tone="onAccent"
        actual={{ day: tagH, week: wocheH, month: monatH, year: jahrH }}
        targetH={activeVorgabe.targetH}
      />
    </div>
  );
}
