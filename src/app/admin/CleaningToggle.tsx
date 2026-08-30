"use client";

import type { CleaningWindows } from "@/lib/cleaningService";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Plus, X } from "lucide-react";
import RemoveRowButton from "@/app/components/RemoveRowButton";
import Toggle from "@/app/components/Toggle";
import TimeInput from "@/app/components/TimeInput";
import NumberInput from "@/app/components/NumberInput";
import InlineSettingRow from "@/app/components/InlineSettingRow";
import { inlineLabelCls as faintCls } from "@/app/components/inputStyles";
import { CLEANING_MAX_MINUTES_RANGE, CLEANING_MAX_PER_DAY_RANGE } from "@/lib/constants";
import { useUserSettingsSave } from "@/app/hooks/useUserSettingsSave";


export default function CleaningToggle({
  userId,
  initialAllowed,
  initialMaxMinutes,
  initialMaxPerDay,
  initialWindows,
}: {
  userId: string;
  initialAllowed: boolean;
  initialMaxMinutes: number;
  initialMaxPerDay: number;
  initialWindows: CleaningWindows[];
}) {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const { saving, save } = useUserSettingsSave(userId);
  const [allowed, setAllowed] = useState(initialAllowed);
  const [maxMin, setMaxMin] = useState(initialMaxMinutes);
  const [maxPerDay, setMaxPerDay] = useState(initialMaxPerDay);
  const [windows, setWindows] = useState<CleaningWindows[]>(initialWindows);

  /** Ein Zahlen-Feld speichern: jedes schickt nur sich selbst, der Service lässt die übrigen
   *  unberührt. Lokal erst übernehmen, wenn der Server den Wert angenommen hat — sonst zeigte das
   *  Feld nach einem abgelehnten Patch weiter die ungespeicherte Zahl (dasselbe Muster wie unten
   *  bei den Fenstern). Der Rückgabewert lässt `NumberInput` bei Ablehnung zurückspringen. */
  async function saveField(patch: Record<string, number>, apply: () => void): Promise<boolean> {
    const ok = await save(patch);
    if (ok) apply();
    return ok;
  }

  // CleaningWindows separat speichern (nur cleaningWindows) — der Service lässt die anderen Felder
  // unberührt. Ein unvollständiges/rückwärts laufendes Paar lehnt er mit einem stabilen Code ab
  // (`useUserSettingsSave` zeigt ihn als Toast) — die Regel steht dort, nicht hier nochmal.
  // Lokal erst übernehmen, wenn der Server den Stand angenommen hat.
  async function saveWindows(next: CleaningWindows[]): Promise<boolean> {
    const ok = await save({ cleaningWindows: next });
    if (ok) setWindows(next);
    return ok;
  }

  function handleToggle(checked: boolean) {
    setAllowed(checked);
    save({ cleaningAllowed: checked });
  }

  return (
    <div className="flex flex-col gap-3">
      <Toggle
        label={t("reinigungPausenLabel")}
        description={t("reinigungPausenDesc")}
        checked={allowed}
        disabled={saving}
        onChange={handleToggle}
      />
      {allowed && (
        <>
          <InlineSettingRow label={t("reinigungMaxLabel")} unit="min">
            <NumberInput
              value={maxMin}
              range={CLEANING_MAX_MINUTES_RANGE}
              disabled={saving}
              ariaLabel={t("reinigungMaxLabel")}
              onCommit={(n) => saveField({ cleaningMaxMinutes: n }, () => setMaxMin(n))}
            />
          </InlineSettingRow>
          <InlineSettingRow label={t("reinigungMaxProTagLabel")} unit={t("reinigungMaxProTagHint")}>
            <NumberInput
              value={maxPerDay}
              range={CLEANING_MAX_PER_DAY_RANGE}
              disabled={saving}
              ariaLabel={t("reinigungMaxProTagLabel")}
              onCommit={(n) => saveField({ cleaningMaxPerDay: n }, () => setMaxPerDay(n))}
            />
          </InlineSettingRow>
          <div className="flex flex-col gap-2 pl-1">
            <span className={faintCls}>{t("reinigungFensterLabel")}</span>
            {windows.length === 0 && (
              <span className={`${faintCls} italic`}>{t("reinigungFensterEmpty")}</span>
            )}
            {windows.map((f, i) => (
              <div key={i} className="flex items-center gap-2">
                <TimeInput
                  value={f.start}
                  disabled={saving}
                  ariaLabel={`${t("reinigungFensterLabel")} ${tc("from")}`}
                  onCommit={(v) => saveWindows(windows.map((x, j) => (j === i ? { ...x, start: v } : x)))}
                />
                <span className={faintCls}>–</span>
                <TimeInput
                  value={f.end}
                  disabled={saving}
                  ariaLabel={`${t("reinigungFensterLabel")} ${tc("to")}`}
                  onCommit={(v) => saveWindows(windows.map((x, j) => (j === i ? { ...x, end: v } : x)))}
                />
                <RemoveRowButton
                  onClick={() => saveWindows(windows.filter((_, j) => j !== i))}
                  disabled={saving}
                  ariaLabel={t("reinigungFensterRemove")}
                  tone="neutral"
                />
              </div>
            ))}
            <button
              type="button"
              onClick={() => saveWindows([...windows, { start: "19:00", end: "20:00" }])}
              disabled={saving}
              className="flex items-center gap-1 text-xs text-foreground-muted hover:text-foreground disabled:opacity-50 w-fit"
            >
              <Plus size={14} /> {t("reinigungFensterAdd")}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
