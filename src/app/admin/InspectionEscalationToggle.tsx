"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import Toggle from "@/app/components/Toggle";
import { inlineInputCls as inputCls, inlineLabelCls as faintCls } from "@/app/components/inputStyles";
import { useUserSettingsSave } from "@/app/hooks/useUserSettingsSave";
import { clampInputValue } from "@/lib/utils";

const DELAY_MIN = 5;
const DELAY_MAX = 1440;

/** Single "N minutes" input, committed on blur — mirrors AutoKontrolleToggle's NumberRangeRow
 *  pattern, but for one value instead of a from–to pair. */
function MinutesInput({ label, value, fallback, setValue, commit, disabled }: {
  label: string; value: number; fallback: number; setValue: (n: number) => void; commit: () => void; disabled: boolean;
}) {
  return (
    <div className="flex items-center gap-2 pl-1">
      <span className={faintCls}>{label}</span>
      <input type="number" min={DELAY_MIN} max={DELAY_MAX} value={value}
        onChange={(e) => setValue(clampInputValue(e.target.value, DELAY_MIN, DELAY_MAX, fallback))}
        onBlur={commit} disabled={disabled} className={inputCls} />
      <span className={faintCls}>min</span>
    </div>
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
          setValue={setReminderDelayMinutes}
          commit={() => save({ inspectionReminderDelayMinutes: reminderDelayMinutes })}
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
            setValue={setAutoMarkDelayMinutes}
            commit={() => save({ inspectionAutoMarkDelayMinutes: autoMarkDelayMinutes })}
            disabled={saving}
          />
        )}
      </div>
    </div>
  );
}
