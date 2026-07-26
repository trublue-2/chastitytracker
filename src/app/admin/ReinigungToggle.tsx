"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Plus, X } from "lucide-react";
import Toggle from "@/app/components/Toggle";
import TimeInput from "@/app/components/TimeInput";
import NumberInput from "@/app/components/NumberInput";
import InlineSettingRow from "@/app/components/InlineSettingRow";
import { inlineLabelCls as faintCls } from "@/app/components/inputStyles";
import useToast from "@/app/hooks/useToast";
import { useApiError } from "@/app/hooks/useApiError";
import { useUserSettingsSave } from "@/app/hooks/useUserSettingsSave";

type Fenster = { start: string; end: string };

/** Ein Fenster zählt nur mit vollständigem, aufsteigendem Paar — genau das speichert der Service. */
function isCompleteFenster(f: Fenster): boolean {
  return Boolean(f.start && f.end && f.start < f.end);
}

export default function ReinigungToggle({
  userId,
  initialErlaubt,
  initialMaxMinuten,
  initialMaxProTag,
  initialFenster,
}: {
  userId: string;
  initialErlaubt: boolean;
  initialMaxMinuten: number;
  initialMaxProTag: number;
  initialFenster: Fenster[];
}) {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const toast = useToast();
  const apiError = useApiError();
  const { saving, save } = useUserSettingsSave(userId);
  const [erlaubt, setErlaubt] = useState(initialErlaubt);
  const [maxMin, setMaxMin] = useState(initialMaxMinuten);
  const [maxProTag, setMaxProTag] = useState(initialMaxProTag);
  const [fenster, setFenster] = useState<Fenster[]>(initialFenster);

  /** Ein Zahlen-Feld speichern: jedes schickt nur sich selbst, der Service lässt die übrigen
   *  unberührt. Lokal erst übernehmen, wenn der Server den Wert angenommen hat — sonst zeigte das
   *  Feld nach einem abgelehnten Patch weiter die ungespeicherte Zahl (dasselbe Muster wie unten
   *  bei den Fenstern). Der Rückgabewert lässt `NumberInput` bei Ablehnung zurückspringen. */
  async function saveField(patch: Record<string, number>, apply: () => void): Promise<boolean> {
    const ok = await save(patch);
    if (ok) apply();
    return ok;
  }

  // Fenster separat speichern (nur reinigungsFenster) — der Service lässt die anderen Felder
  // unberührt. Unvollständige/rückwärts laufende Paare verwirft der Service still; die würde ein
  // `{ok:true}` sonst als gespeichert ausweisen, obwohl sie nie in der DB landen. Deshalb hier
  // vorab ablehnen — und lokal erst übernehmen, wenn der Server den Stand angenommen hat.
  async function saveFenster(next: Fenster[]): Promise<boolean> {
    if (!next.every(isCompleteFenster)) {
      toast.error(apiError("timeRangeInvalid"));
      return false;
    }
    const ok = await save({ reinigungsFenster: next });
    if (ok) setFenster(next);
    return ok;
  }

  function handleToggle(checked: boolean) {
    setErlaubt(checked);
    save({ reinigungErlaubt: checked });
  }

  return (
    <div className="flex flex-col gap-3">
      <Toggle
        label={t("reinigungPausenLabel")}
        description={t("reinigungPausenDesc")}
        checked={erlaubt}
        disabled={saving}
        onChange={handleToggle}
      />
      {erlaubt && (
        <>
          <InlineSettingRow label={t("reinigungMaxLabel")} unit="min">
            <NumberInput
              value={maxMin}
              min={1}
              max={120}
              fallback={15}
              disabled={saving}
              ariaLabel={t("reinigungMaxLabel")}
              onCommit={(n) => saveField({ reinigungMaxMinuten: n }, () => setMaxMin(n))}
            />
          </InlineSettingRow>
          <InlineSettingRow label={t("reinigungMaxProTagLabel")} unit={t("reinigungMaxProTagHint")}>
            <NumberInput
              value={maxProTag}
              min={0}
              max={20}
              disabled={saving}
              ariaLabel={t("reinigungMaxProTagLabel")}
              onCommit={(n) => saveField({ reinigungMaxProTag: n }, () => setMaxProTag(n))}
            />
          </InlineSettingRow>
          <div className="flex flex-col gap-2 pl-1">
            <span className={faintCls}>{t("reinigungFensterLabel")}</span>
            {fenster.length === 0 && (
              <span className={`${faintCls} italic`}>{t("reinigungFensterEmpty")}</span>
            )}
            {fenster.map((f, i) => (
              <div key={i} className="flex items-center gap-2">
                <TimeInput
                  value={f.start}
                  disabled={saving}
                  ariaLabel={`${t("reinigungFensterLabel")} ${tc("from")}`}
                  onCommit={(v) => saveFenster(fenster.map((x, j) => (j === i ? { ...x, start: v } : x)))}
                />
                <span className={faintCls}>–</span>
                <TimeInput
                  value={f.end}
                  disabled={saving}
                  ariaLabel={`${t("reinigungFensterLabel")} ${tc("to")}`}
                  onCommit={(v) => saveFenster(fenster.map((x, j) => (j === i ? { ...x, end: v } : x)))}
                />
                <button
                  type="button"
                  onClick={() => saveFenster(fenster.filter((_, j) => j !== i))}
                  disabled={saving}
                  aria-label={t("reinigungFensterRemove")}
                  className="p-1 text-foreground-faint hover:text-foreground disabled:opacity-50"
                >
                  <X size={16} />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => saveFenster([...fenster, { start: "19:00", end: "20:00" }])}
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
