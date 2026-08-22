"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import RemoveRowButton from "@/app/components/RemoveRowButton";
import Toggle from "@/app/components/Toggle";
import TimeInput from "@/app/components/TimeInput";
import Input from "@/app/components/Input";
import Button from "@/app/components/Button";
import InlineSettingRow from "@/app/components/InlineSettingRow";
import { inlineLabelCls as faintCls } from "@/app/components/inputStyles";
import { WEIGHING_WINDOWS_MAX } from "@/lib/constants";
import { useUserSettingsSave } from "@/app/hooks/useUserSettingsSave";
import { parseDecimalInput, weightFieldValue, weightForDisplay, weightInputToKg, type UnitSystem } from "@/lib/weight";
import type { WeighingWindow } from "@/lib/weightWindows";

/**
 * Die Gewichts-Einstellungen der Keyholderin für EINEN Sub: Freischaltung, Wiege-Fenster und die
 * Nachbesserung des Zielkorridors.
 *
 * Die Grenzen selbst setzt der Sub — sie darf sie nur **weiten**. Die Route weist eine engere Zahl
 * mit Begründung ab (`WEIGHT_CORRIDOR_NARROWER`), statt sie still zu schlucken; deshalb steht die
 * Regel hier auch als Hinweis unter den Feldern.
 */
export default function WeightToggle({
  userId, unitSystem, initialEnabled, initialWindows, subMinKg, subMaxKg, initialMinKg, initialMaxKg,
}: {
  userId: string;
  /** Anzeige-Einheit DER KEYHOLDERIN — sie darf Pfund sehen, während ihr Sub in Kilogramm einträgt. */
  unitSystem: UnitSystem;
  initialEnabled: boolean;
  initialWindows: WeighingWindow[];
  /** Was der Sub sich selbst gesetzt hat — die Schranke, hinter die sie nicht zurück darf. */
  subMinKg: number | null;
  subMaxKg: number | null;
  initialMinKg: number | null;
  initialMaxKg: number | null;
}) {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const { saving, save } = useUserSettingsSave(userId);
  const [enabled, setEnabled] = useState(initialEnabled);
  const [windows, setWindows] = useState<WeighingWindow[]>(initialWindows);
  const [min, setMin] = useState(weightFieldValue(initialMinKg, unitSystem));
  const [max, setMax] = useState(weightFieldValue(initialMaxKg, unitSystem));

  const unitLabel = unitSystem === "imperial" ? tc("unitLbs") : tc("unitKg");
  // Gelockert werden kann nur, wo der Träger selbst eine Grenze gesetzt hat. Steht dort nichts, ist
  // das Feld nicht „noch leer", sondern für sie gar nicht bedienbar — dann wird es auch nicht
  // angeboten. Ein Eingabefeld, dessen Inhalt der Server garantiert ablehnt, ist eine Einladung in
  // eine Fehlermeldung.
  const minSperre = subMinKg === null;
  const maxSperre = subMaxKg === null;
  const nichtsZuLockern = minSperre && maxSperre;

  function handleToggle(checked: boolean) {
    setEnabled(checked);
    save({ weightTrackingEnabled: checked });
  }

  // Fenster erst lokal übernehmen, wenn der Server den Stand angenommen hat — sonst zeigte die
  // Liste nach einem abgelehnten Patch weiter den ungespeicherten Zustand (Muster: ReinigungToggle).
  async function saveWindows(next: WeighingWindow[]): Promise<boolean> {
    const ok = await save({ weighingWindows: next });
    if (ok) setWindows(next);
    return ok;
  }

  async function saveTargets() {
    const toKg = (raw: string) => {
      const value = parseDecimalInput(raw);
      return value === null ? null : weightInputToKg(value, unitSystem);
    };
    await save({ targetMinKeyholderKg: toKg(min), targetMaxKeyholderKg: toKg(max) });
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
          <div className="flex flex-col gap-2">
            <p className={faintCls}>{t("weighingWindowsLabel")}</p>
            {windows.length === 0 && <p className={faintCls}>{t("weighingWindowsNone")}</p>}
            {windows.map((w, i) => (
              <InlineSettingRow key={i} label={`${i + 1}.`}>
                <TimeInput
                  value={w.start}
                  disabled={saving}
                  ariaLabel={t("weighingWindowStart")}
                  onCommit={(next) => saveWindows(windows.map((x, j) => (j === i ? { ...x, start: next } : x)))}
                />
                <span className={faintCls}>–</span>
                <TimeInput
                  value={w.end}
                  disabled={saving}
                  ariaLabel={t("weighingWindowEnd")}
                  onCommit={(next) => saveWindows(windows.map((x, j) => (j === i ? { ...x, end: next } : x)))}
                />
                <RemoveRowButton
                  ariaLabel={tc("delete")}
                  disabled={saving}
                  onClick={() => saveWindows(windows.filter((_, j) => j !== i))}
                />
              </InlineSettingRow>
            ))}
            {windows.length < WEIGHING_WINDOWS_MAX && (
              <button
                type="button"
                disabled={saving}
                onClick={() => saveWindows([...windows, { start: "06:00", end: "08:00" }])}
                className="flex items-center gap-1 text-sm text-accent hover:opacity-80 disabled:opacity-50"
              >
                <Plus size={16} /> {t("weighingWindowAdd")}
              </button>
            )}
          </div>

          <div className="flex flex-col gap-3">
            <p className={faintCls}>{t("weightKeyholderTargetLabel")}</p>
            <div className="grid grid-cols-2 gap-3">
              <Input
                label={`${t("weightTargetMin")} (${unitLabel})`}
                type="number"
                inputMode="decimal"
                value={min}
                disabled={saving || minSperre}
                onChange={(e) => setMin(e.target.value)}
              />
              <Input
                label={`${t("weightTargetMax")} (${unitLabel})`}
                type="number"
                inputMode="decimal"
                value={max}
                disabled={saving || maxSperre}
                onChange={(e) => setMax(e.target.value)}
              />
            </div>
            <p className="text-xs text-foreground-faint">
              {subMinKg === null && subMaxKg === null
                ? t("weightSubTargetNone")
                : t("weightSubTarget", {
                    min: subMinKg === null ? "–" : String(weightForDisplay(subMinKg, unitSystem)),
                    max: subMaxKg === null ? "–" : String(weightForDisplay(subMaxKg, unitSystem)),
                    unit: unitLabel,
                  })}
            </p>
            <p className="text-xs text-foreground-faint">
              {nichtsZuLockern ? t("weightNothingToWiden") : t("weightWidenOnlyHint")}
            </p>
            <Button variant="secondary" loading={saving} disabled={nichtsZuLockern} onClick={saveTargets}>
              {tc("save")}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
