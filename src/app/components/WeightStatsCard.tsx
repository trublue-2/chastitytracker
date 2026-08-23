"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import Card from "@/app/components/Card";
import StatsCard from "@/app/components/StatsCard";
import FieldTabs from "@/app/components/FieldTabs";
import MeasurementChart from "@/app/components/MeasurementChart";
import WeightRow from "@/app/components/WeightRow";
import { round1 } from "@/lib/utils";
import { bmi, dayNumber, targetProgress, weightForDisplay, type UnitSystem, type WeightTarget } from "@/lib/weight";
import { buildWeightSeries, withinRange, type WeightPoint } from "@/lib/weightSeries";
import type { WeightRowData } from "@/lib/weightRows";

/**
 * Die Gewichts-Karte der Statistik: Kennzahlen, Verlauf, Ziel und Fortschritt.
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

/** Wie viele Zeilen die Liste zeigt, bevor sie nachlädt. Ein Wert je Tag: „seit Beginn" ist nach
 *  zwei Jahren siebenhundert Zeilen, und die will niemand auf einmal im Bild haben. */
const LIST_CHUNK = 30;

export interface WeightStatsCardProps {
  points: WeightPoint[];
  /** Dieselben Messungen als volle Zeilen, JÜNGSTE ZUERST — die Liste unter dem Diagramm. */
  rows: WeightRowData[];
  /** Das WIRKSAME Ziel — das der Keyholderin, solange sie eines führt, sonst das des Trägers. */
  target: WeightTarget | null;
  /** Das Gewicht, das beim Setzen des Ziels galt — der Bezugspunkt des Fortschritts. */
  startKg: number | null;
  /** Aktuelle Körpergrösse für die BMI-Kennzahl; null = keine hinterlegt, dann entfällt sie. */
  heightCm: number | null;
  /** Anzeige-Einheit des BETRACHTERS. */
  unitSystem: UnitSystem;
  /** Datums-Locale und Zeitzone des TRÄGERS für die Zeilen der Liste — als Prop und nicht im Client
   *  ermittelt, damit Server- und Client-Render dieselbe Zeichenkette bilden (Muster: `EntryRow`). */
  locale: string;
  tz: string;
  /** Heutiger Kalendertag des Trägers (`YYYY-MM-DD`) — der Bezugspunkt der Zeiträume. */
  todayKey: string;
  /** Datums-Beschriftung eines Punktes, vom Server vorformatiert (Locale + Zeitzone dort bekannt). */
  dateLabels: Record<string, string>;
  /** Die Schwelle der offenen Freigabe-Vorgabe (kg) — `null`, wenn keine steht. Sie erscheint als
   *  zweite gestrichelte Linie: der Träger soll sehen, wo die Bedingung im Verlauf liegt. */
  releaseThresholdKg: number | null;
}

export default function WeightStatsCard({
  points, rows, target, startKg, heightCm, unitSystem, locale, tz, todayKey, dateLabels,
  releaseThresholdKg,
}: WeightStatsCardProps) {
  const t = useTranslations("weightStats");
  const tList = useTranslations("weightList");
  const tc = useTranslations("common");
  const [range, setRange] = useState<RangeValue>("30");
  const [shown, setShown] = useState(LIST_CHUNK);

  const days = RANGES.find((r) => r.value === range)!.days;
  const series = useMemo(
    () => buildWeightSeries(points, { days, todayKey, target }),
    [points, days, todayKey, target],
  );
  // Dieselbe Grenze wie beim Diagramm — die Liste zeigt genau die Messungen, die auch die Kurve
  // zeichnet. `rows` steht bereits absteigend; der Filter lässt die Reihenfolge unangetastet.
  const rowsInRange = useMemo(
    () => withinRange(rows, { days, todayKey }),
    [rows, days, todayKey],
  );

  const unitLabel = unitSystem === "imperial" ? tc("unitLbs") : tc("unitKg");
  const show = (kg: number) => `${weightForDisplay(kg, unitSystem)} ${unitLabel}`;
  const latestBmi = series.latest ? bmi(series.latest.weightKg, heightCm) : null;
  // Der Fortschritt rechnet gegen die JÜNGSTE Messung, nicht gegen die letzte des gewählten
  // Zeitraums: „wie weit bin ich" ist eine Frage an heute, nicht an den Ausschnitt, den gerade
  // jemand betrachtet.
  const latestOverall = points.length ? points[points.length - 1] : null;
  const progress = target && latestOverall
    ? targetProgress({ targetKg: target.kg, startKg, currentKg: latestOverall.weightKg })
    : null;

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
            {progress && (
              <StatsCard
                label={progress.reached ? t("targetReached") : t("targetRemaining", { value: show(progress.remainingKg) })}
                value={show(progress.targetKg)}
                variant={progress.percent === null ? "default" : "progress"}
                progress={progress.percent ?? undefined}
                color={progress.reached ? "ok" : undefined}
              />
            )}
          </div>

          <Card className="flex flex-col gap-3">
            <FieldTabs
              ariaLabel={t("rangeLabel")}
              value={range}
              onChange={(next) => { setRange(next); setShown(LIST_CHUNK); }}
              options={RANGES.map((r) => ({ value: r.value, label: t(`range${r.value}`) }))}
            />
            {series.points.length > 0 ? (
              <MeasurementChart
                points={chartPoints}
                trend={chartTrend}
                markers={[
                  ...(target
                    ? [{ value: weightForDisplay(target.kg, unitSystem), label: `${t("target")} · ${show(target.kg)}` }]
                    : []),
                  // Die Schwelle der Freigabe-Vorgabe in der WARN-Farbe: das Ziel ist ein Vorhaben,
                  // diese Linie eine Bedingung mit Folgen — gleich gefärbt läsen sich beide als
                  // dasselbe.
                  ...(releaseThresholdKg !== null
                    ? [{
                        value: weightForDisplay(releaseThresholdKg, unitSystem),
                        label: `${tList("releaseMarker")} · ${show(releaseThresholdKg)}`,
                        color: "var(--color-warn)",
                      }]
                    : []),
                ]}
                // Die Spanne umfasst auch die Freigabe-Schwelle. `buildWeightSeries` kennt nur das
                // Ziel; eine Linie, die aus dem Bild läuft, zeigt nicht, wie weit es noch ist — und
                // genau dafür ist sie da.
                domain={{
                  min: weightForDisplay(Math.min(series.minKg, releaseThresholdKg ?? series.minKg), unitSystem),
                  max: weightForDisplay(Math.max(series.maxKg, releaseThresholdKg ?? series.maxKg), unitSystem),
                }}
                unit={unitLabel}
                ariaLabel={t("chartLabel")}
              />
            ) : (
              <p className="text-sm text-foreground-muted">{t("emptyRange")}</p>
            )}
            <p className="text-xs text-foreground-faint">{t("legend")}</p>
          </Card>

          {/* Die Kurve zeigt die Richtung, die Liste die einzelne Messung: Uhrzeit, Foto, Notiz und
              den von der Waage gelesenen Wert. Zusammen in einer Karte, weil beides derselbe
              Zeitraum ist — wer den Tab umlegt, bewegt Kurve und Liste zugleich. */}
          {rowsInRange.length > 0 && (
            <Card padding="none">
              <p className="px-5 pt-4 pb-2 text-xs font-semibold uppercase tracking-wider text-foreground-faint">
                {tList("title")}
              </p>
              <div className="divide-y divide-border-subtle border-t border-border-subtle">
                {rowsInRange.slice(0, shown).map((row) => (
                  <WeightRow key={row.id} row={row} locale={locale} tz={tz} unitSystem={unitSystem} />
                ))}
              </div>
              {rowsInRange.length > shown && (
                <div className="flex items-center justify-between px-5 py-3 border-t border-border-subtle">
                  <span className="text-xs text-foreground-faint tabular-nums">
                    {tList("countHint", { shown, total: rowsInRange.length })}
                  </span>
                  <button
                    type="button"
                    onClick={() => setShown((n) => n + LIST_CHUNK)}
                    className="text-xs font-medium text-accent hover:opacity-80"
                  >
                    {tList("showMore")}
                  </button>
                </div>
              )}
            </Card>
          )}
        </>
      )}
    </section>
  );
}
