"use client";

import { Scale } from "lucide-react";
import { useTranslations } from "next-intl";
import Card from "@/app/components/Card";
import DetailField from "@/app/components/DetailField";
import { weightText, type UnitSystem } from "@/lib/weight";

/**
 * Die Freigabe-Vorgabe, wie der Träger sie sieht: was verlangt ist, wo er steht, was noch fehlt
 * (docs/gewicht-freigabe-konzept.md, Abschnitt 10).
 *
 * **Ohne diese Karte verfehlt das Feature seinen Zweck.** Eine Bedingung, die er erst im Nachhinein
 * erfährt, ist Willkür; eine, gegen die er rechnen kann, erzeugt den Druck. Deshalb steht hier nicht
 * nur „noch nicht", sondern die Zahl, die ihm fehlt — und, wenn die Schwelle wandert, die von morgen.
 */
export interface WeightReleaseCardProps {
  thresholdKg: number;
  nextThresholdKg: number | null;
  averageKg: number | null;
  averageDays: number;
  direction: string;
  remainingKg: number | null;
  reason: string | null;
  /** Vorformatiert auf dem Server — Locale und Zeitzone sind dort bekannt (Muster `WeightStatsCard`). */
  notBeforeLabel: string | null;
  unitSystem: UnitSystem;
  /** Sprach-Kennung für die Zahlen — als Prop wie das Datum daneben, damit Server und Client
   *  dieselbe Zeichenkette bilden. */
  locale: string;
}

export default function WeightReleaseCard({
  thresholdKg, nextThresholdKg, averageKg, averageDays, direction, remainingKg, reason,
  notBeforeLabel, unitSystem, locale,
}: WeightReleaseCardProps) {
  const t = useTranslations("release");
  const tc = useTranslations("common");

  const unitLabel = unitSystem === "imperial" ? tc("unitLbs") : tc("unitKg");
  const show = (kg: number) => `${weightText(kg, unitSystem, locale)} ${unitLabel}`;

  return (
    <Card className="flex flex-col gap-3">
      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-foreground-faint">
        <Scale size={14} /> {t("title")}
      </p>

      <DetailField label={t("required", { days: averageDays })}>
        <p className="text-sm font-semibold text-foreground tabular-nums">
          {t(direction === "above" ? "requiredAbove" : "requiredBelow", { value: show(thresholdKg) })}
        </p>
      </DetailField>

      <DetailField label={t("current", { days: averageDays })}>
        {averageKg === null ? (
          // „Zu wenige Messungen" ist keine Schuld, sondern eine Angabe: das Mittel kommt erst
          // zustande, wenn genug Tage besetzt sind.
          <p className="text-sm text-foreground-muted">{t("noAverage")}</p>
        ) : (
          <p className="text-sm font-semibold text-foreground tabular-nums">
            {show(averageKg)}
            {remainingKg !== null && remainingKg > 0 && (
              <span className="ml-2 font-normal text-warn">{t("remaining", { value: show(remainingKg) })}</span>
            )}
          </p>
        )}
      </DetailField>

      {reason === "not_yet" && notBeforeLabel && (
        <DetailField label={t("notBefore")}>
          <p className="text-sm text-foreground-muted">{notBeforeLabel}</p>
        </DetailField>
      )}

      {/* Nur wenn die Schwelle wandert: bei fester Schwelle wäre „morgen" dieselbe Zahl noch einmal. */}
      {nextThresholdKg !== null && (
        <p className="text-xs text-foreground-faint">{t("tomorrow", { value: show(nextThresholdKg) })}</p>
      )}
    </Card>
  );
}
