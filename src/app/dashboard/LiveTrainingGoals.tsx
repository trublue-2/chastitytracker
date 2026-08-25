"use client";

import { useTranslations } from "next-intl";
import BlockHeading from "@/app/components/BlockHeading";
import GoalProgressRows from "@/app/components/GoalProgressRows";
import { useLiveHours } from "@/app/hooks/useLiveHours";
import type { ByPeriod, VorgabeTargets } from "@/lib/goalFulfillment";

interface Props {
  serverNow: string;
  /** Ende jedes Zeitraums — serverseitig, weil die Grenzen an der Zeitzone des Trägers hängen. */
  periodEndMs: ByPeriod<number>;
  tagH: number;
  wocheH: number;
  monatH: number;
  jahrH: number;
  activeVorgabe: VorgabeTargets;
}

export default function LiveTrainingGoals({ serverNow, periodEndMs, tagH: baseTagH, wocheH: baseWocheH, monatH: baseMonatH, jahrH: baseJahrH, activeVorgabe }: Props) {
  const t = useTranslations("dashboard");
  const tagH = useLiveHours(baseTagH, serverNow, true);
  const wocheH = useLiveHours(baseWocheH, serverNow, true);
  const monatH = useLiveHours(baseMonatH, serverNow, true);
  const jahrH = useLiveHours(baseJahrH, serverNow, true);

  return (
    // Ein benannter Abschnitt auf dem Grund, keine Zeile im Kartenkopf. `tone` entfällt: seit der
    // Held keine Akzentfläche mehr ist, steht hier nichts mehr "auf" etwas.
    <section className="pt-5 flex flex-col gap-3.5">
      <BlockHeading className="tracking-[0.16em]">{t("kgGoals")}</BlockHeading>
      <GoalProgressRows
        actual={{ day: tagH, week: wocheH, month: monatH, year: jahrH }}
        targetH={activeVorgabe.targetH}
        periodEndMs={periodEndMs}
        serverNow={serverNow}
      />
    </section>
  );
}
