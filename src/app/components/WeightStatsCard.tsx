"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import Card from "@/app/components/Card";
import StatsCard from "@/app/components/StatsCard";
import FieldTabs from "@/app/components/FieldTabs";
import MeasurementChart from "@/app/components/MeasurementChart";
import { round1 } from "@/lib/utils";
import { bmi, dayNumber, weightForDisplay, type Corridor, type UnitSystem } from "@/lib/weight";
import { buildWeightSeries, type WeightPoint } from "@/lib/weightSeries";

/**
 * Die Gewichts-Karte der Statistik: Kennzahlen, Verlauf, Zielband.
 *
 * Warum alle Punkte auf einmal an den Client gehen und der Zeitraum HIER gefiltert wird: bei einem
 * Wert je Tag ist selbst ein Jahrzehnt eine kleine Liste, und der Umschalter soll sofort reagieren
 * statt bei jedem Klick den Server zu fragen. Gerechnet wird trotzdem in `weightSeries.ts` — dieselbe
 * Ableitung, die auch ein Server-Aufrufer (MCP) benutzen würde.
 */

/** Die Zeiträume aus der Skizze: der Monat als Vorgabe, dazu Quartal, Jahr und alles. */
const RANGES = [
  { value: "30", days: 30 },
  { value: "90", days: 90 },
  { value: "365", days: 365 },
  { value: "all", days: null },
] as const;

type RangeValue = (typeof RANGES)[number]["value"];

export interface WeightStatsCardProps {
  points: WeightPoint[];
  subCorridor: Corridor;
  keyholderCorridor: Corridor;
  /** Aktuelle Körpergrösse für die BMI-Kennzahl; null = keine hinterlegt, dann entfällt sie. */
  heightCm: number | null;
  /** Anzeige-Einheit des BETRACHTERS. */
  unitSystem: UnitSystem;
  /** Heutiger Kalendertag des Trägers (`YYYY-MM-DD`) — der Bezugspunkt der Zeiträume. */
  todayKey: string;
  /** Datums-Beschriftung eines Punktes, vom Server vorformatiert (Locale + Zeitzone dort bekannt). */
  dateLabels: Record<string, string>;
}

export default function WeightStatsCard({
  points, subCorridor, keyholderCorridor, heightCm, unitSystem, todayKey, dateLabels,
}: WeightStatsCardProps) {
  const t = useTranslations("weightStats");
  const tc = useTranslations("common");
  const [range, setRange] = useState<RangeValue>("30");

  const days = RANGES.find((r) => r.value === range)!.days;
  const series = useMemo(
    () => buildWeightSeries(points, { days, todayKey, subCorridor, keyholderCorridor }),
    [points, days, todayKey, subCorridor, keyholderCorridor],
  );

  const unitLabel = unitSystem === "imperial" ? tc("unitLbs") : tc("unitKg");
  const show = (kg: number) => `${weightForDisplay(kg, unitSystem)} ${unitLabel}`;
  const latestBmi = series.latest ? bmi(series.latest.weightKg, heightCm) : null;

  const chartPoints = series.points.map((p) => ({
    x: dayNumber(p.dayKey),
    value: weightForDisplay(p.weightKg, unitSystem),
    muted: !p.inWindow,
    label: `${dateLabels[p.dayKey] ?? p.dayKey} · ${show(p.weightKg)}`,
  }));
  const chartTrend = series.trend.map((tr) => ({
    x: dayNumber(tr.dayKey),
    value: weightForDisplay(tr.weightKg, unitSystem),
  }));

  return (
    <section className="flex flex-col gap-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-foreground-faint px-1">{t("title")}</p>

      {points.length === 0 ? (
        <Card padding="compact">
          <p className="text-sm text-foreground-muted">{t("empty")}</p>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <StatsCard label={t("current")} value={series.latest ? show(series.latest.weightKg) : "–"} />
            <StatsCard
              label={t("change")}
              // Das Vorzeichen bleibt stehen: „−1,4" ist die Information, „1,4" wäre die halbe.
              value={series.changeKg === null ? "–" : `${series.changeKg > 0 ? "+" : ""}${weightForDisplay(series.changeKg, unitSystem)} ${unitLabel}`}
            />
            {/* Der BMI als ZAHL, ohne Einordnung. Die WHO-Kategorie kennt weder Muskelmasse noch
                Statur und liest sich in dieser App schnell wie ein Urteil über den Träger. */}
            {latestBmi !== null && <StatsCard label={t("bmi")} value={String(round1(latestBmi))} />}
          </div>

          <Card className="flex flex-col gap-3">
            <FieldTabs
              ariaLabel={t("rangeLabel")}
              value={range}
              onChange={setRange}
              options={RANGES.map((r) => ({ value: r.value, label: t(`range${r.value}`) }))}
            />
            {series.points.length > 0 ? (
              <MeasurementChart
                points={chartPoints}
                trend={chartTrend}
                band={{
                  min: series.corridor.minKg === null ? null : weightForDisplay(series.corridor.minKg, unitSystem),
                  max: series.corridor.maxKg === null ? null : weightForDisplay(series.corridor.maxKg, unitSystem),
                }}
                domain={{
                  min: weightForDisplay(series.minKg, unitSystem),
                  max: weightForDisplay(series.maxKg, unitSystem),
                }}
                unit={unitLabel}
                ariaLabel={t("chartLabel")}
              />
            ) : (
              <p className="text-sm text-foreground-muted">{t("emptyRange")}</p>
            )}
            <p className="text-xs text-foreground-faint">{t("legend")}</p>
          </Card>
        </>
      )}
    </section>
  );
}
