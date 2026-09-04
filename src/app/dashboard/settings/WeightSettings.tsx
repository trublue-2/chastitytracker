"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import Input from "@/app/components/Input";
import Select from "@/app/components/Select";
import Button from "@/app/components/Button";
import Toggle from "@/app/components/Toggle";
import UnderweightNote from "@/app/components/UnderweightNote";
import FormError from "@/app/components/FormError";
import { useSettingsSave } from "@/app/hooks/useUserSettingsSave";
import { saveOwnNotificationChannels } from "@/lib/apiClient";
import {
  heightForDisplay, heightInputToCm, inchesToFeet,
  parseDecimalInput, weightFieldValue, weightForDisplay, weightText, weightInputToKg, type UnitSystem,
} from "@/lib/weight";

export interface WeightSettingsProps {
  unitSystem: UnitSystem;
  heightCm: number | null;
  /** Das eigene Zielgewicht des Trägers. */
  targetWeightKg: number | null;
  /** Das Ziel der Keyholderin — nur zur Ansicht. Es GILT, solange sie eines führt; seines bleibt
   *  trotzdem stehen, damit beide sehen, worüber sie sich einig oder uneinig sind. */
  keyholderTargetKg: number | null;
  /** Mail/Push zur Erinnerung ans Wiege-Fenster. Sein Schalter, nicht ihrer: die Meldung geht an
   *  IHN (`RECIPIENT_NOTIFICATION_EVENT_TYPES`). */
  reminderNotify: boolean;
}

export default function WeightSettings({
  unitSystem, heightCm, targetWeightKg, keyholderTargetKg, reminderNotify,
}: WeightSettingsProps) {
  const t = useTranslations("settings");
  const locale = useLocale();
  const tc = useTranslations("common");
  const { saving, save } = useSettingsSave("/api/settings/weight");

  const [unit, setUnit] = useState<UnitSystem>(unitSystem);
  const [height, setHeight] = useState(heightCm === null ? "" : String(heightForDisplay(heightCm, unitSystem)));
  const [target, setTarget] = useState(weightFieldValue(targetWeightKg, unitSystem));
  const [remind, setRemind] = useState(reminderNotify);
  const [remindError, setRemindError] = useState<string | null>(null);

  // Die Einheiten-Kürzel stehen in `common` — sie sind in beiden Oberflächen dieselben.
  const weightUnitLabel = unit === "imperial" ? tc("unitLbs") : tc("unitKg");
  const heightUnitLabel = unit === "imperial" ? tc("unitInch") : tc("unitCm");

  const parsedTarget = parseDecimalInput(target);

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
      setTarget((v) => {
        const parsed = parseDecimalInput(v);
        return parsed === null ? v : String(weightForDisplay(weightInputToKg(parsed, previous), value));
      });
    } else {
      setUnit(previous);
    }
  }

  async function saveHeight() {
    const parsed = parseDecimalInput(height);
    if (parsed === null) return;
    await save({ heightCm: heightInputToCm(parsed, unit) });
  }

  async function saveTarget() {
    await save({ targetWeightKg: parsedTarget === null ? null : weightInputToKg(parsedTarget, unit) });
  }

  // Eigene Route: der Kanal-Schalter hängt an der Benachrichtigungs-Tabelle, nicht an den
  // Gewichts-Spalten. EIN Schalter für alle Kanäle — anders als der Posteingang hat die Wiege-
  // Erinnerung keinen eigenen Telegram-Schalter, also muss „aus" auch Telegram meinen (sonst ginge
  // sie bei verknüpftem Chat weiter, ohne dass man sie abstellen kann).
  async function saveRemind(checked: boolean) {
    setRemind(checked);
    setRemindError(null);
    // Zurückspringen ohne Meldung sähe aus wie ein klemmender Schalter — dieselbe Behandlung wie
    // beim Nachrichten-Schalter in `SettingsForm`.
    try {
      const code = await saveOwnNotificationChannels("WEIGHT_REMINDER", { mail: checked, push: checked, telegram: checked });
      if (code) {
        setRemind(!checked);
        setRemindError(tc("error"));
      }
    } catch {
      setRemind(!checked);
      setRemindError(tc("error"));
    }
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
        <Button variant="secondary" loading={saving} onClick={saveHeight}>{tc("save")}</Button>
      </div>


      <div className="flex flex-col gap-3">
        <Input
          label={`${t("targetWeight")} (${weightUnitLabel})`}
          type="number"
          inputMode="decimal"
          value={target}
          disabled={saving}
          onChange={(e) => setTarget(e.target.value)}
          hint={keyholderTargetKg === null ? undefined : t("targetKeyholderApplies", {
            value: `${weightText(keyholderTargetKg, unit, locale)} ${weightUnitLabel}`,
          })}
        />
        <UnderweightNote
          input={target}
          unit={unit}
          heightCm={heightCm}
          message={t("targetUnderweightWarning")}
        />
        <Button variant="secondary" loading={saving} onClick={saveTarget}>{tc("save")}</Button>
      </div>

      <div className="flex flex-col gap-2">
        <Toggle
          label={t("weightReminderLabel")}
          description={t("weightReminderHint")}
          checked={remind}
          onChange={saveRemind}
        />
        <FormError message={remindError} />
      </div>
    </div>
  );
}
