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
    // Ein benannter Abschnitt auf dem Grund, keine Zeile im Kartenkopf. `tone` entfällt: seit der
    // Held keine Akzentfläche mehr ist, steht hier nichts mehr "auf" etwas.
    <section className="pt-5 flex flex-col gap-2">
      <p className="text-rubrik font-semibold uppercase tracking-[0.16em] text-foreground-faint mb-1">
        {t("kgGoals")}
      </p>
      <GoalProgressRows
        actual={{ day: tagH, week: wocheH, month: monatH, year: jahrH }}
        targetH={activeVorgabe.targetH}
      />
    </section>
  );
}
