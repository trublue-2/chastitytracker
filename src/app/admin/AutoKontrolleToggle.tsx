"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import Toggle from "@/app/components/Toggle";
import TimeInput from "@/app/components/TimeInput";
import { inlineInputCls as inputCls, inlineLabelCls as faintCls } from "@/app/components/inputStyles";
import { useUserSettingsSave } from "@/app/hooks/useUserSettingsSave";
import { clampInputValue } from "@/lib/utils";

/** Zwei Zahleneingaben „von – bis" mit gemeinsamem Bereich/Einheit; committet je Feld einzeln (onBlur). */
function NumberRangeRow({
  label, min, max, fromFallback, toFallback, from, to, setFrom, setTo, commitFrom, commitTo, unit, disabled,
}: {
  label: string; min: number; max: number; fromFallback: number; toFallback: number;
  from: number; to: number; setFrom: (n: number) => void; setTo: (n: number) => void;
  commitFrom: () => void; commitTo: () => void; unit: string; disabled: boolean;
}) {
  return (
    <div className="flex items-center gap-2 pl-1">
      <span className={faintCls}>{label}</span>
      <input type="number" min={min} max={max} value={from}
        onChange={(e) => setFrom(clampInputValue(e.target.value, min, max, fromFallback))}
        onBlur={commitFrom} disabled={disabled} className={inputCls} />
      <span className={faintCls}>–</span>
      <input type="number" min={min} max={max} value={to}
        onChange={(e) => setTo(clampInputValue(e.target.value, min, max, toFallback))}
        onBlur={commitTo} disabled={disabled} className={inputCls} />
      <span className={faintCls}>{unit}</span>
    </div>
  );
}

export default function AutoKontrolleToggle({
  userId,
  initialAktiv,
  initialPerDayMin,
  initialPerDayMax,
  initialRuheVon,
  initialRuheBis,
  initialFristVon,
  initialFristBis,
}: {
  userId: string;
  initialAktiv: boolean;
  initialPerDayMin: number;
  initialPerDayMax: number;
  initialRuheVon: string;
  initialRuheBis: string;
  initialFristVon: number;
  initialFristBis: number;
}) {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const { saving, save } = useUserSettingsSave(userId);
  const [aktiv, setAktiv] = useState(initialAktiv);
  const [perDayMin, setPerDayMin] = useState(initialPerDayMin);
  const [perDayMax, setPerDayMax] = useState(initialPerDayMax);
  const [fristVon, setFristVon] = useState(initialFristVon);
  const [fristBis, setFristBis] = useState(initialFristBis);

  function handleToggle(checked: boolean) {
    setAktiv(checked);
    save({ autoKontrolleAktiv: checked });
  }

  return (
    <div className="flex flex-col gap-3">
      <Toggle
        label={t("autoKontrolleLabel")}
        description={t("autoKontrolleDesc")}
        checked={aktiv}
        disabled={saving}
        onChange={handleToggle}
      />
      {aktiv && (
        <>
          {/* Anzahl pro Tag: zufällig zwischen Min und Max */}
          <NumberRangeRow
            label={t("autoKontrolleProTagLabel")} min={0} max={12} fromFallback={0} toFallback={0}
            from={perDayMin} to={perDayMax} setFrom={setPerDayMin} setTo={setPerDayMax}
            commitFrom={() => save({ autoKontrollePerDayMin: perDayMin })}
            commitTo={() => save({ autoKontrollePerDayMax: perDayMax })}
            unit={t("autoKontrolleProTagHint")} disabled={saving}
          />

          {/* Schlaf-Fenster (Frist darf hier nicht liegen) */}
          <div className="flex items-center gap-2 pl-1">
            <span className={faintCls}>{t("autoKontrolleRuheLabel")}</span>
            <TimeInput
              value={initialRuheVon}
              disabled={saving}
              ariaLabel={`${t("autoKontrolleRuheLabel")} ${tc("from")}`}
              onCommit={(v) => save({ autoKontrolleRuheVon: v })}
            />
            <span className={faintCls}>–</span>
            <TimeInput
              value={initialRuheBis}
              disabled={saving}
              ariaLabel={`${t("autoKontrolleRuheLabel")} ${tc("to")}`}
              onCommit={(v) => save({ autoKontrolleRuheBis: v })}
            />
          </div>

          {/* Erfüllungsdauer von–bis (Minuten) */}
          <NumberRangeRow
            label={t("autoKontrolleFristLabel")} min={5} max={240} fromFallback={15} toFallback={60}
            from={fristVon} to={fristBis} setFrom={setFristVon} setTo={setFristBis}
            commitFrom={() => save({ autoKontrolleFristVon: fristVon })}
            commitTo={() => save({ autoKontrolleFristBis: fristBis })}
            unit="min" disabled={saving}
          />
        </>
      )}
    </div>
  );
}
