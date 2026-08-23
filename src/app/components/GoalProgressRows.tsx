"use client";

import { useTranslations } from "next-intl";
import GoalProgressRow from "@/app/components/GoalProgressRow";
import { GOAL_PERIODS, type ByPeriod } from "@/lib/goalFulfillment";

/**
 * Die vier Ziel-Zeilen (Tag/Woche/Monat/Jahr) einer Trainingsvorgabe.
 *
 * Stand vorher dreimal als gleicher Vierzeiler im Baum — in der grünen Session-Karte
 * (`LiveTrainingGoals`), in der KG-Zeile und in der Kategorie-Zeile der Trainingsvorgaben-Karte
 * (`CategoryGoalsLive`).
 *
 * Eine Zeile erscheint, wo `targetH` einen Wert trägt. Ob eine Periode überhaupt bewertet wird,
 * entscheidet `goalFulfillment.ts` — diese Komponente muss die Regel nicht kennen und kann sie
 * deshalb auch nicht anders auslegen als die übrigen Anzeigen.
 *
 * Die vierte Zielanzeige (`StatsMain`) bleibt bewusst aussen vor: sie ist zweizeilig, mit Pille
 * statt Prozentzahl — eine andere Form, nicht dieselbe mit anderer Farbe (siehe `GoalProgressRow`).
 */
export default function GoalProgressRows({
  actual,
  targetH,
  tone,
}: {
  /** Ist-Stunden je Periode. */
  actual: ByPeriod<number>;
  /** Ziel-Stunden je Periode zum BEWERTEN — `null`, wo nichts gesetzt oder die Periode geteilt ist. */
  targetH: ByPeriod<number | null>;
  tone?: "onSurface" | "onAccent";
}) {
  const t = useTranslations("dashboard");
  return (
    <>
      {GOAL_PERIODS.map((period) => {
        const target = targetH[period];
        if (!target) return null;
        return (
          <GoalProgressRow
            key={period}
            tone={tone}
            label={t(period)}
            actual={actual[period]}
            target={target}
          />
        );
      })}
    </>
  );
}
