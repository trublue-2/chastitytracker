"use client";

import { useTranslations } from "next-intl";
import GoalProgressRow from "@/app/components/GoalProgressRow";
import { useNowMs } from "@/app/hooks/useLiveHours";
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
  periodEndMs,
  serverNow,
  tone,
}: {
  /** Ist-Stunden je Periode. */
  actual: ByPeriod<number>;
  /** Ziel-Stunden je Periode zum BEWERTEN — `null`, wo nichts gesetzt oder die Periode geteilt ist. */
  targetH: ByPeriod<number | null>;
  /** Ende jedes Zeitraums (Epoch-ms), serverseitig aus der Zeitzone des Trägers gerechnet.
   *  Fehlt es, bleibt es beim reinen Prozentwert. */
  periodEndMs?: ByPeriod<number>;
  serverNow?: string;
  tone?: "onSurface" | "onAccent";
}) {
  const t = useTranslations("dashboard");
  // Derselbe Takt, den die Stunden schon benutzen: die Restzeit schrumpft, während die Stunden
  // wachsen, und beides muss im selben Augenblick stimmen — sonst zeigt eine Zeile kurzzeitig
  // „noch 0min" und die nächste rechnet schon mit dem Folgetag.
  const nowMs = useNowMs(serverNow ?? "");
  const labels = {
    reached: t("goalReached"),
    remaining: (time: string) => t("goalRemaining", { time }),
    tight: (time: string) => t("goalTight", { time }),
    missing: (time: string) => t("goalMissing", { time }),
  };
  // Der Abstand ZWISCHEN den Zeilen gehört hierher, nicht an die Aufrufstelle. Er stand an zweien
  // und war an beiden ein anderer: die KG-Ziele erbten die 8 px ihres `Section`, die
  // Kategorie-Ziele brachten 14 px mit. Dieselbe Figur, zwei Takte, auf einem Bildschirm
  // untereinander.
  return (
    <div className="flex flex-col gap-3">
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
            remainingMs={periodEndMs && serverNow ? periodEndMs[period] - nowMs : undefined}
            outlookLabels={periodEndMs && serverNow ? labels : undefined}
          />
        );
      })}
    </div>
  );
}
