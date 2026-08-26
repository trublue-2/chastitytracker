"use client";

import { useTranslations } from "next-intl";
import Section from "@/app/components/Section";
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
    //
    // `Section` statt eines von Hand gebauten `<section>` mit eigener Rubrik: die Abweichung war
    // messbar, nicht theoretisch — 14 px zwischen Rubrik und Inhalt statt 8, und eine Laufweite von
    // 0,16 em auf der Überschrift gegen `tracking-wider` (0,05 em) bei allen anderen. Dieselbe
    // Figur dreimal anders gesetzt liest sich als Schludrigkeit, auch wenn niemand die Werte
    // benennen kann.
    <Section title={t("kgGoals")}>
      <GoalProgressRows
        actual={{ day: tagH, week: wocheH, month: monatH, year: jahrH }}
        targetH={activeVorgabe.targetH}
        periodEndMs={periodEndMs}
        serverNow={serverNow}
      />
    </Section>
  );
}
