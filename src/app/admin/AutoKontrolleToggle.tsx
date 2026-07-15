"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import Button from "@/app/components/Button";
import Toggle from "@/app/components/Toggle";
import { TimeField } from "@/app/components/TimeInput";
import { inlineInputCls as inputCls, inlineLabelCls as faintCls } from "@/app/components/inputStyles";
import { useUserSettingsSave } from "@/app/hooks/useUserSettingsSave";
import { clampInputValue } from "@/lib/utils";

/** Zwei Uhrzeit-Eingaben „von – bis" (Schlaf- bzw. festes Auslöse-Fenster). */
function TimeRangeRow({
  label, from, to, setFrom, setTo, disabled, fromAria, toAria,
}: {
  label: string; from: string; to: string; setFrom: (v: string) => void; setTo: (v: string) => void;
  disabled: boolean; fromAria: string; toAria: string;
}) {
  return (
    <div className="flex items-center gap-2 pl-1">
      <span className={faintCls}>{label}</span>
      <TimeField value={from} disabled={disabled} ariaLabel={fromAria} onChange={setFrom} />
      <span className={faintCls}>–</span>
      <TimeField value={to} disabled={disabled} ariaLabel={toAria} onChange={setTo} />
    </div>
  );
}

/** Zwei Zahleneingaben „von – bis" mit gemeinsamem Bereich/Einheit. */
function NumberRangeRow({
  label, min, max, fromFallback, toFallback, from, to, setFrom, setTo, unit, disabled,
}: {
  label: string; min: number; max: number; fromFallback: number; toFallback: number;
  from: number; to: number; setFrom: (n: number) => void; setTo: (n: number) => void;
  unit: string; disabled: boolean;
}) {
  return (
    <div className="flex items-center gap-2 pl-1">
      <span className={faintCls}>{label}</span>
      <input type="number" min={min} max={max} value={from}
        onChange={(e) => setFrom(clampInputValue(e.target.value, min, max, fromFallback))}
        disabled={disabled} className={inputCls} />
      <span className={faintCls}>–</span>
      <input type="number" min={min} max={max} value={to}
        onChange={(e) => setTo(clampInputValue(e.target.value, min, max, toFallback))}
        disabled={disabled} className={inputCls} />
      <span className={faintCls}>{unit}</span>
    </div>
  );
}

interface AutoKontrolleForm {
  aktiv: boolean;
  perDayMin: number;
  perDayMax: number;
  ruheVon: string;
  ruheBis: string;
  fristVon: number;
  fristBis: number;
  fensterVon: string; // "" = kein festes Auslöse-Fenster
  fensterBis: string;
}

/** Vorschlag beim EINSCHALTEN des festen Fensters — nur, wenn noch nichts gesetzt ist. */
const FENSTER_DEFAULT = { von: "10:00", bis: "18:00" } as const;

/**
 * Alle Felder werden lokal gehalten und mit EINEM PATCH gespeichert. Ein Commit je Feld (onBlur) würde
 * den Tagesplan mehrfach hintereinander anfassen — der Keyholder soll seine Änderungen erst als Ganzes
 * abschicken und dann genau einen Replan auslösen.
 */
export default function AutoKontrolleToggle({
  userId,
  initialAktiv,
  initialPerDayMin,
  initialPerDayMax,
  initialRuheVon,
  initialRuheBis,
  initialFristVon,
  initialFristBis,
  initialFensterVon,
  initialFensterBis,
}: {
  userId: string;
  initialAktiv: boolean;
  initialPerDayMin: number;
  initialPerDayMax: number;
  initialRuheVon: string;
  initialRuheBis: string;
  initialFristVon: number;
  initialFristBis: number;
  initialFensterVon: string;
  initialFensterBis: string;
}) {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const { saving, save } = useUserSettingsSave(userId);
  const initial: AutoKontrolleForm = {
    aktiv: initialAktiv, perDayMin: initialPerDayMin, perDayMax: initialPerDayMax,
    ruheVon: initialRuheVon, ruheBis: initialRuheBis, fristVon: initialFristVon, fristBis: initialFristBis,
    fensterVon: initialFensterVon, fensterBis: initialFensterBis,
  };
  const [form, setForm] = useState(initial);
  // Der zuletzt vom Server angenommene Stand — Referenz für „geändert?". Ein abgelehnter Patch (z.B.
  // leere Uhrzeit) lässt ihn stehen, das Formular bleibt dirty und der Keyholder kann korrigieren.
  const [saved, setSaved] = useState(initial);
  const dirty = (Object.keys(form) as (keyof AutoKontrolleForm)[]).some((k) => form[k] !== saved[k]);

  function set<K extends keyof AutoKontrolleForm>(key: K, value: AutoKontrolleForm[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  // Festes Auslöse-Fenster an, sobald eine der beiden Zeiten gesetzt ist (leer = aus).
  const fensterOn = form.fensterVon !== "" || form.fensterBis !== "";

  async function handleSave() {
    // Der Server hebt ein „Bis" unter das „Von" an (raiseMaxToMin). Dieselbe Normalisierung hier, sonst
    // zeigte das Formular nach dem Speichern eine Zahl an, die so nie gespeichert wurde — und wäre dabei
    // als „nicht geändert" markiert, weil `saved` den ungespeicherten Stand übernommen hätte.
    // Ein festes Fenster gilt nur, wenn BEIDE Zeiten stehen (so wertet es auch der Service:
    // fixedWindowMinutes verlangt Von UND Bis). Ist nur eine gesetzt, als „aus" speichern — sonst
    // zeigte der Toggle „an", während die Auslösungen sich doch übers Wach-Fenster verteilten.
    const fensterComplete = form.fensterVon !== "" && form.fensterBis !== "";
    const normalized: AutoKontrolleForm = {
      ...form,
      perDayMax: Math.max(form.perDayMin, form.perDayMax),
      fristBis: Math.max(form.fristVon, form.fristBis),
      fensterVon: fensterComplete ? form.fensterVon : "",
      fensterBis: fensterComplete ? form.fensterBis : "",
    };
    const ok = await save({
      autoKontrolleAktiv: normalized.aktiv,
      autoKontrollePerDayMin: normalized.perDayMin,
      autoKontrollePerDayMax: normalized.perDayMax,
      autoKontrolleRuheVon: normalized.ruheVon,
      autoKontrolleRuheBis: normalized.ruheBis,
      autoKontrolleFristVon: normalized.fristVon,
      autoKontrolleFristBis: normalized.fristBis,
      autoKontrolleFensterVon: normalized.fensterVon,
      autoKontrolleFensterBis: normalized.fensterBis,
    });
    if (ok) {
      setForm(normalized);
      setSaved(normalized);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <Toggle
        label={t("autoKontrolleLabel")}
        description={t("autoKontrolleDesc")}
        checked={form.aktiv}
        disabled={saving}
        onChange={(checked) => set("aktiv", checked)}
      />
      {form.aktiv && (
        <>
          {/* Anzahl pro Tag: zufällig zwischen Min und Max */}
          <NumberRangeRow
            label={t("autoKontrolleProTagLabel")} min={0} max={12} fromFallback={0} toFallback={0}
            from={form.perDayMin} to={form.perDayMax}
            setFrom={(n) => set("perDayMin", n)} setTo={(n) => set("perDayMax", n)}
            unit={t("autoKontrolleProTagHint")} disabled={saving}
          />

          {/* Schlaf-Fenster (Frist darf hier nicht liegen) */}
          <TimeRangeRow
            label={t("autoKontrolleRuheLabel")}
            from={form.ruheVon} to={form.ruheBis}
            setFrom={(v) => set("ruheVon", v)} setTo={(v) => set("ruheBis", v)}
            disabled={saving}
            fromAria={`${t("autoKontrolleRuheLabel")} ${tc("from")}`}
            toAria={`${t("autoKontrolleRuheLabel")} ${tc("to")}`}
          />

          {/* Erfüllungsdauer von–bis (Minuten) */}
          <NumberRangeRow
            label={t("autoKontrolleFristLabel")} min={5} max={240} fromFallback={15} toFallback={60}
            from={form.fristVon} to={form.fristBis}
            setFrom={(n) => set("fristVon", n)} setTo={(n) => set("fristBis", n)}
            unit="min" disabled={saving}
          />

          {/* Optionales festes Auslöse-Fenster: aus (leer) → Trigger verteilen sich übers Wach-Fenster */}
          <Toggle
            label={t("autoKontrolleFensterLabel")}
            description={t("autoKontrolleFensterDesc")}
            checked={fensterOn}
            disabled={saving}
            onChange={(on) => setForm((f) => ({
              ...f,
              fensterVon: on ? (f.fensterVon || FENSTER_DEFAULT.von) : "",
              fensterBis: on ? (f.fensterBis || FENSTER_DEFAULT.bis) : "",
            }))}
          />
          {fensterOn && (
            <TimeRangeRow
              label={t("autoKontrolleFensterLabel")}
              from={form.fensterVon} to={form.fensterBis}
              setFrom={(v) => set("fensterVon", v)} setTo={(v) => set("fensterBis", v)}
              disabled={saving}
              fromAria={`${t("autoKontrolleFensterLabel")} ${tc("from")}`}
              toAria={`${t("autoKontrolleFensterLabel")} ${tc("to")}`}
            />
          )}
        </>
      )}
      <Button size="sm" onClick={handleSave} loading={saving} disabled={!dirty} className="w-fit">
        {tc("save")}
      </Button>
    </div>
  );
}
