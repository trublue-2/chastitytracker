"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import Input from "@/app/components/Input";
import Select from "@/app/components/Select";
import Button from "@/app/components/Button";
import { useSettingsSave } from "@/app/hooks/useUserSettingsSave";
import {
  heightForDisplay, heightInputToCm, inchesToFeet, isUnderweightTarget, normalWeightRangeKg,
  parseDecimalInput, weightFieldValue, weightForDisplay, weightInputToKg,
  type ReferenceSex, type UnitSystem,
} from "@/lib/weight";

export interface WeightSettingsProps {
  unitSystem: UnitSystem;
  heightCm: number | null;
  referenceSex: ReferenceSex | null;
  targetMinKg: number | null;
  targetMaxKg: number | null;
  /** Hat der Sub schon eine Grösse gespeichert? Dann fragt das Formular, ob die neue Zahl eine
   *  KORREKTUR ist (die alte war nie wahr) oder eine ÄNDERUNG (echtes Wachstum) — die App kann das
   *  nicht erraten, und die Historie hängt daran. */
  hasHeightHistory: boolean;
}

export default function WeightSettings({
  unitSystem, heightCm, referenceSex, targetMinKg, targetMaxKg, hasHeightHistory,
}: WeightSettingsProps) {
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const { saving, save } = useSettingsSave("/api/settings/weight");

  const [unit, setUnit] = useState<UnitSystem>(unitSystem);
  const [height, setHeight] = useState(heightCm === null ? "" : String(heightForDisplay(heightCm, unitSystem)));
  const [heightMode, setHeightMode] = useState<"correct" | "change">("change");
  const [min, setMin] = useState(weightFieldValue(targetMinKg, unitSystem));
  const [max, setMax] = useState(weightFieldValue(targetMaxKg, unitSystem));

  // Die Einheiten-Kürzel stehen in `common` — sie sind in beiden Oberflächen dieselben.
  const weightUnitLabel = unit === "imperial" ? tc("unitLbs") : tc("unitKg");
  const heightUnitLabel = unit === "imperial" ? tc("unitInch") : tc("unitCm");

  // Der Normbereich erscheint HIER und nicht im Statistik-Block: beim Zielsetzen ist eine
  // Einordnung eine Hilfe, im Alltag wäre sie ein Etikett.
  const normal = normalWeightRangeKg(heightCm, referenceSex);
  // BEIDE Enden prüfen: eine Obergrenze im Untergewicht FORDERT es ein, eine Untergrenze dort
  // ERLAUBT es. Nur die Obergrenze zu prüfen liesse „mindestens 45 kg bei 1,85 m" wortlos durch.
  const underweight = [min, max].some((field) => {
    const value = parseDecimalInput(field);
    return value !== null && isUnderweightTarget(weightInputToKg(value, unit), heightCm);
  });

  async function saveUnit(next: string) {
    const value = next as UnitSystem;
    const previous = unit;
    setUnit(value);
    // Die Felder zeigen weiter dieselbe Person — nur in einer anderen Einheit. Ohne Umrechnung
    // stünde nach dem Umschalten „84" da und meinte plötzlich Pfund.
    if (await save({ unitSystem: value })) {
      setHeight((h) => {
        const parsed = parseDecimalInput(h);
        return parsed === null ? h : String(heightForDisplay(heightInputToCm(parsed, previous), value));
      });
      const convert = (v: string) => {
        const parsed = parseDecimalInput(v);
        return parsed === null ? v : String(weightForDisplay(weightInputToKg(parsed, previous), value));
      };
      setMin(convert);
      setMax(convert);
    } else {
      setUnit(previous);
    }
  }

  async function saveHeight() {
    const parsed = parseDecimalInput(height);
    if (parsed === null) return;
    await save({ heightCm: heightInputToCm(parsed, unit), heightMode });
  }

  async function saveTargets() {
    const parsedMin = parseDecimalInput(min);
    const parsedMax = parseDecimalInput(max);
    await save({
      targetMinKg: parsedMin === null ? null : weightInputToKg(parsedMin, unit),
      targetMaxKg: parsedMax === null ? null : weightInputToKg(parsedMax, unit),
    });
  }

  const feet = unit === "imperial" && heightCm !== null ? inchesToFeet(heightForDisplay(heightCm, unit)) : null;

  return (
    <div className="flex flex-col gap-6">
      <Select
        label={t("weightUnit")}
        value={unit}
        disabled={saving}
        onChange={(e) => saveUnit(e.target.value)}
        options={[
          { value: "metric", label: t("weightUnitMetric") },
          { value: "imperial", label: t("weightUnitImperial") },
        ]}
      />

      <div className="flex flex-col gap-3">
        <Input
          label={`${t("height")} (${heightUnitLabel})`}
          type="number"
          inputMode="decimal"
          value={height}
          disabled={saving}
          onChange={(e) => setHeight(e.target.value)}
          hint={feet ? t("heightFeetHint", { feet: feet.feet, inches: feet.inches }) : undefined}
        />
        {hasHeightHistory && (
          <Select
            label={t("heightMode")}
            value={heightMode}
            disabled={saving}
            onChange={(e) => setHeightMode(e.target.value as "correct" | "change")}
            options={[
              { value: "change", label: t("heightModeChange") },
              { value: "correct", label: t("heightModeCorrect") },
            ]}
          />
        )}
        <Button variant="secondary" loading={saving} onClick={saveHeight}>{tc("save")}</Button>
      </div>

      <Select
        label={t("referenceSex")}
        value={referenceSex ?? ""}
        disabled={saving}
        onChange={(e) => save({ referenceSex: e.target.value })}
        options={[
          { value: "", label: t("referenceSexNone") },
          { value: "m", label: t("referenceSexMale") },
          { value: "f", label: t("referenceSexFemale") },
        ]}
      />

      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <Input
            label={`${t("targetMin")} (${weightUnitLabel})`}
            type="number"
            inputMode="decimal"
            value={min}
            disabled={saving}
            onChange={(e) => setMin(e.target.value)}
          />
          <Input
            label={`${t("targetMax")} (${weightUnitLabel})`}
            type="number"
            inputMode="decimal"
            value={max}
            disabled={saving}
            onChange={(e) => setMax(e.target.value)}
          />
        </div>
        {normal && (
          <p className="text-xs text-foreground-faint">
            {t("targetNormalHint", {
              min: weightForDisplay(normal.minKg, unit),
              max: weightForDisplay(normal.maxKg, unit),
              unit: weightUnitLabel,
            })}
          </p>
        )}
        {underweight && (
          <p className="text-sm text-warn bg-warn-bg border border-[var(--color-warn-border)] rounded-xl px-4 py-3">
            {t("targetUnderweightWarning")}
          </p>
        )}
        <Button variant="secondary" loading={saving} onClick={saveTargets}>{tc("save")}</Button>
      </div>
    </div>
  );
}
