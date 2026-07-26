"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import Toggle from "@/app/components/Toggle";
import NumberInput from "@/app/components/NumberInput";
import InlineSettingRow from "@/app/components/InlineSettingRow";
import { useUserSettingsSave } from "@/app/hooks/useUserSettingsSave";

const DELAY_MIN = 5;
const DELAY_MAX = 1440;

/** Single "N minutes" input, committed on blur. */
function MinutesInput({ label, value, fallback, commit, disabled }: {
  label: string; value: number; fallback: number; commit: (n: number) => Promise<boolean>; disabled: boolean;
}) {
  return (
    <InlineSettingRow label={label} unit="min">
      <NumberInput value={value} min={DELAY_MIN} max={DELAY_MAX} fallback={fallback}
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
}: {
  userId: string;
  initialReminderEnabled: boolean;
  initialReminderDelayMinutes: number;
  initialAutoMarkEnabled: boolean;
  initialAutoMarkDelayMinutes: number;
}) {
  const t = useTranslations("admin");
  const { saving, save } = useUserSettingsSave(userId);
  const [reminderEnabled, setReminderEnabled] = useState(initialReminderEnabled);
  const [reminderDelayMinutes, setReminderDelayMinutes] = useState(initialReminderDelayMinutes);
  const [autoMarkEnabled, setAutoMarkEnabled] = useState(initialAutoMarkEnabled);
  const [autoMarkDelayMinutes, setAutoMarkDelayMinutes] = useState(initialAutoMarkDelayMinutes);

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
        <MinutesInput
          label={t("inspectionReminderDelayLabel")} value={reminderDelayMinutes} fallback={5}
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
          <MinutesInput
            label={t("inspectionAutoMarkDelayLabel")} value={autoMarkDelayMinutes} fallback={60}
            commit={(n) => saveDelay({ inspectionAutoMarkDelayMinutes: n }, () => setAutoMarkDelayMinutes(n))}
            disabled={saving}
          />
        )}
      </div>
    </div>
  );
}
