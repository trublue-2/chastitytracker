"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import Toggle from "@/app/components/Toggle";
import NumberInput from "@/app/components/NumberInput";
import InlineSettingRow from "@/app/components/InlineSettingRow";
import {
  INSPECTION_REMINDER_DELAY_RANGE, INSPECTION_AUTO_MARK_DELAY_RANGE, INSPECTION_JOKER_BALANCE_RANGE,
  INSPECTION_JOKER_MINUTES_RANGE, type NumberRange,
} from "@/lib/constants";
import SettingLabel from "@/app/components/SettingLabel";
import { useUserSettingsSave } from "@/app/hooks/useUserSettingsSave";

/** Single number input, committed on blur. Default unit: minutes. */
function NumberSettingInput({ label, value, range, commit, disabled, unit = "min" }: {
  label: string; value: number; range: NumberRange; commit: (n: number) => Promise<boolean>; disabled: boolean;
  unit?: string;
}) {
  return (
    <InlineSettingRow label={label} unit={unit}>
      <NumberInput value={value} range={range}
        disabled={disabled} ariaLabel={label} onCommit={commit} />
    </InlineSettingRow>
  );
}

export default function InspectionEscalationToggle({
  userId,
  initialReminderEnabled,
  initialReminderDelayMinutes,
  initialAutoMarkEnabled,
  initialAutoMarkDelayMinutes,
  initialJokerBalance,
  initialJokerMinutes,
}: {
  userId: string;
  initialReminderEnabled: boolean;
  initialReminderDelayMinutes: number;
  initialAutoMarkEnabled: boolean;
  initialAutoMarkDelayMinutes: number;
  initialJokerBalance: number;
  initialJokerMinutes: number;
}) {
  const t = useTranslations("admin");
  const { saving, save } = useUserSettingsSave(userId);
  const [reminderEnabled, setReminderEnabled] = useState(initialReminderEnabled);
  const [reminderDelayMinutes, setReminderDelayMinutes] = useState(initialReminderDelayMinutes);
  const [autoMarkEnabled, setAutoMarkEnabled] = useState(initialAutoMarkEnabled);
  const [autoMarkDelayMinutes, setAutoMarkDelayMinutes] = useState(initialAutoMarkDelayMinutes);
  const [jokerBalance, setJokerBalance] = useState(initialJokerBalance);
  const [jokerMinutes, setJokerMinutes] = useState(initialJokerMinutes);

  /** Lokal erst übernehmen, wenn der Server den Wert angenommen hat; der Rückgabewert lässt das
   *  Feld bei Ablehnung auf den gespeicherten Stand zurückspringen. */
  async function saveDelay(patch: Record<string, number>, apply: () => void): Promise<boolean> {
    const ok = await save(patch);
    if (ok) apply();
    return ok;
  }

  return (
    <div className="flex flex-col gap-3">
      <Toggle
        label={t("inspectionReminderLabel")}
        description={t("inspectionReminderDesc")}
        checked={reminderEnabled}
        disabled={saving}
        onChange={(checked) => { setReminderEnabled(checked); save({ inspectionReminderEnabled: checked }); }}
      />
      {reminderEnabled && (
        <NumberSettingInput
          label={t("inspectionReminderDelayLabel")} value={reminderDelayMinutes} range={INSPECTION_REMINDER_DELAY_RANGE}
          commit={(n) => saveDelay({ inspectionReminderDelayMinutes: n }, () => setReminderDelayMinutes(n))}
          disabled={saving}
        />
      )}

      {/* Stufe 2 — visuell unter Stufe 1, aber unabhängig schaltbar (siehe Plan: getrennte Schalter). */}
      <div className="pl-4 flex flex-col gap-3 border-l border-border-subtle">
        <Toggle
          label={t("inspectionAutoMarkLabel")}
          description={t("inspectionAutoMarkDesc")}
          checked={autoMarkEnabled}
          disabled={saving}
          onChange={(checked) => { setAutoMarkEnabled(checked); save({ inspectionAutoMarkEnabled: checked }); }}
        />
        {autoMarkEnabled && (
          <NumberSettingInput
            label={t("inspectionAutoMarkDelayLabel")} value={autoMarkDelayMinutes} range={INSPECTION_AUTO_MARK_DELAY_RANGE}
            commit={(n) => saveDelay({ inspectionAutoMarkDelayMinutes: n }, () => setAutoMarkDelayMinutes(n))}
            disabled={saving}
          />
        )}
      </div>

      {/* Fristen-Joker: VOR der Eskalation, aber hier, weil er dieselbe Frist betrifft. Das Guthaben
          setzt die Keyholderin absolut — aufladen und wegnehmen ist dieselbe Eingabe. */}
      <div className="flex flex-col gap-3 pt-3 border-t border-border-subtle">
        <SettingLabel label={t("inspectionJokerLabel")} description={t("inspectionJokerDesc")} />
        <NumberSettingInput
          label={t("inspectionJokerBalanceLabel")} value={jokerBalance} range={INSPECTION_JOKER_BALANCE_RANGE} unit=""
          commit={(n) => saveDelay({ inspectionJokerBalance: n }, () => setJokerBalance(n))}
          disabled={saving}
        />
        {jokerBalance > 0 && (
          <NumberSettingInput
            label={t("inspectionJokerMinutesLabel")} value={jokerMinutes} range={INSPECTION_JOKER_MINUTES_RANGE}
            commit={(n) => saveDelay({ inspectionJokerMinutes: n }, () => setJokerMinutes(n))}
            disabled={saving}
          />
        )}
      </div>
    </div>
  );
}
