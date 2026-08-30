"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import RemoveRowButton from "@/app/components/RemoveRowButton";
import Toggle from "@/app/components/Toggle";
import TimeInput from "@/app/components/TimeInput";
import NumberInput from "@/app/components/NumberInput";
import WeekdayPicker from "@/app/components/WeekdayPicker";
import Checkbox from "@/app/components/Checkbox";
import UnderweightNote from "@/app/components/UnderweightNote";
import Input from "@/app/components/Input";
import Button from "@/app/components/Button";
import InlineSettingRow from "@/app/components/InlineSettingRow";
import { inlineLabelCls as faintCls } from "@/app/components/inputStyles";
import { WEIGHING_WINDOWS_MAX, WEIGHING_WINDOW_DURATION_RANGE } from "@/lib/constants";
import { useUserSettingsSave } from "@/app/hooks/useUserSettingsSave";
import { parseDecimalInput, weightFieldValue, weightText, weightInputToKg, type UnitSystem } from "@/lib/weight";
import { weighingWindowEnd, type WeighingWindow } from "@/lib/weightWindows";
import { ALL_WEEKDAYS } from "@/lib/weekdays";

/**
 * Die Gewichts-Einstellungen der Keyholderin für EINEN Sub: Freischaltung, Wiege-Fenster und **ihr**
 * Zielgewicht.
 *
 * Ihr Ziel gilt, solange sie eines führt; das des Trägers steht daneben und bleibt bestehen. Bis
 * v5.3.3 durfte sie seinen Korridor nur weiten — die Regel ist gestrichen. Geblieben ist die
 * Warnung unterhalb von BMI 18,5, die jetzt auch für ihre Zahl gilt.
 */
export default function WeightToggle({
  userId, unitSystem, initialEnabled, initialWindows, subTargetKg, initialTargetKg, subHeightCm,
}: {
  userId: string;
  /** Anzeige-Einheit DER KEYHOLDERIN — sie darf Pfund sehen, während ihr Sub in Kilogramm einträgt. */
  unitSystem: UnitSystem;
  initialEnabled: boolean;
  initialWindows: WeighingWindow[];
  /** Was der Träger sich selbst vorgenommen hat — bleibt sichtbar, auch wenn ihres gilt. */
  subTargetKg: number | null;
  initialTargetKg: number | null;
  /** Körpergrösse DES TRÄGERS für die Untergewichts-Warnung — nicht ihre. */
  subHeightCm: number | null;
}) {
  const t = useTranslations("admin");
  const locale = useLocale();
  const tc = useTranslations("common");
  const { saving, save } = useUserSettingsSave(userId);
  const [enabled, setEnabled] = useState(initialEnabled);
  const [windows, setWindows] = useState<WeighingWindow[]>(initialWindows);
  const [target, setTarget] = useState(weightFieldValue(initialTargetKg, unitSystem));

  const unitLabel = unitSystem === "imperial" ? tc("unitLbs") : tc("unitKg");
  const parsedTarget = parseDecimalInput(target);

  function handleToggle(checked: boolean) {
    setEnabled(checked);
    save({ weightTrackingEnabled: checked });
  }

  // Fenster erst lokal übernehmen, wenn der Server den Stand angenommen hat — sonst zeigte die
  // Liste nach einem abgelehnten Patch weiter den ungespeicherten Zustand (Muster: CleaningToggle).
  async function saveWindows(next: WeighingWindow[]): Promise<boolean> {
    const ok = await save({ weighingWindows: next });
    if (ok) setWindows(next);
    return ok;
  }

  async function saveTarget() {
    await save({ targetWeightKeyholderKg: parsedTarget === null ? null : weightInputToKg(parsedTarget, unitSystem) });
  }

  return (
    <div className="flex flex-col gap-3">
      <Toggle
        label={t("weightTrackingLabel")}
        description={t("weightTrackingDesc")}
        checked={enabled}
        disabled={saving}
        onChange={handleToggle}
      />

      {enabled && (
        <>
          <div className="flex flex-col gap-3">
            <p className={faintCls}>{t("weighingWindowsLabel")}</p>
            {windows.length === 0 && <p className={faintCls}>{t("weighingWindowsNone")}</p>}
            {windows.map((w, i) => {
              // Ein Fenster wird immer als GANZES gespeichert: die Zeile schickt den Stand, den sie
              // gerade zeigt, mit genau einem geänderten Feld. Getrennte Patches je Feld liessen
              // zwischen Start und Dauer einen Zustand entstehen, den niemand eingestellt hat.
              const patch = (change: Partial<WeighingWindow>) =>
                saveWindows(windows.map((x, j) => (j === i ? { ...x, ...change } : x)));
              return (
                <div key={i} className="flex flex-col gap-2 rounded-xl border border-border-subtle p-3">
                  <InlineSettingRow label={t("weighingWindowFrom")}>
                    <TimeInput
                      value={w.start}
                      disabled={saving}
                      ariaLabel={t("weighingWindowStart")}
                      onCommit={(next) => patch({ start: next })}
                    />
                    <NumberInput
                      value={w.durationMin}
                      disabled={saving}
                      range={WEIGHING_WINDOW_DURATION_RANGE}
                      ariaLabel={t("weighingWindowDuration")}
                      onCommit={(next) => patch({ durationMin: next })}
                    />
                    <span className={faintCls}>{t("weighingWindowDurationUnit", { end: weighingWindowEnd(w) })}</span>
                    <RemoveRowButton
                      ariaLabel={tc("delete")}
                      disabled={saving}
                      onClick={() => saveWindows(windows.filter((_, j) => j !== i))}
                    />
                  </InlineSettingRow>
                  <WeekdayPicker
                    mask={w.days}
                    disabled={saving}
                    ariaLabel={t("weighingWindowDays")}
                    onChange={(next) => patch({ days: next })}
                  />
                  <Checkbox
                    label={t("weighingWindowRemind")}
                    checked={w.remind}
                    disabled={saving}
                    onChange={(e) => patch({ remind: e.target.checked })}
                  />
                </div>
              );
            })}
            {windows.length < WEIGHING_WINDOWS_MAX && (
              <button
                type="button"
                disabled={saving}
                onClick={() => saveWindows([...windows, {
                  start: "06:00", durationMin: WEIGHING_WINDOW_DURATION_RANGE.fallback,
                  days: ALL_WEEKDAYS, remind: false,
                }])}
                className="flex items-center gap-1 text-sm text-accent hover:opacity-80 disabled:opacity-50"
              >
                <Plus size={16} /> {t("weighingWindowAdd")}
              </button>
            )}
          </div>

          <div className="flex flex-col gap-3">
            <Input
              label={`${t("weightKeyholderTargetLabel")} (${unitLabel})`}
              type="number"
              inputMode="decimal"
              value={target}
              disabled={saving}
              onChange={(e) => setTarget(e.target.value)}
              hint={t("weightKeyholderTargetHint")}
            />
            <p className="text-xs text-foreground-faint">
              {subTargetKg === null
                ? t("weightSubTargetNone")
                : t("weightSubTarget", {
                    value: `${weightText(subTargetKg, unitSystem, locale)} ${unitLabel}`,
                  })}
            </p>
            <UnderweightNote
              input={target}
              unit={unitSystem}
              heightCm={subHeightCm}
              message={t("weightTargetUnderweightWarning")}
            />
            <Button variant="secondary" loading={saving} onClick={saveTarget}>{tc("save")}</Button>
          </div>
        </>
      )}
    </div>
  );
}
