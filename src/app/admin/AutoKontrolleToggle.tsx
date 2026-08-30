"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import Button from "@/app/components/Button";
import Toggle from "@/app/components/Toggle";
import { TimeField } from "@/app/components/TimeInput";
import NumberInput from "@/app/components/NumberInput";
import InlineSettingRow from "@/app/components/InlineSettingRow";
import { inlineLabelCls as faintCls } from "@/app/components/inputStyles";
import {
  AUTO_INSPECTION_PER_DAY_RANGE, AUTO_INSPECTION_DEADLINE_FROM_RANGE, AUTO_INSPECTION_DEADLINE_TO_RANGE,
  type NumberRange,
} from "@/lib/constants";
import { useUserSettingsSave } from "@/app/hooks/useUserSettingsSave";
import WeekdayPicker from "@/app/components/WeekdayPicker";
import RemoveRowButton from "@/app/components/RemoveRowButton";
import SettingLabel from "@/app/components/SettingLabel";
import { Plus } from "lucide-react";
import { ALL_WEEKDAYS } from "@/lib/weekdays";
import {
  AUTO_INSPECTION_DAY_RULES_MAX, parseAutoInspectionDayRules, type AutoInspectionDayRule,
} from "@/lib/autoKontrolleDayRules";

/** Beschriftung der beiden Felder einer „von – bis"-Zeile: die sichtbare Beschriftung steht nur
 *  einmal vor dem Paar, für Screenreader braucht jedes Feld seine eigene. */
function useRangeAria(label: string): [string, string] {
  const tc = useTranslations("common");
  return [`${label} ${tc("from")}`, `${label} ${tc("to")}`];
}

/** Zwei Uhrzeit-Eingaben „von – bis" (Schlaf- bzw. festes Auslöse-Fenster). */
function TimeRangeRow({
  label, from, to, setFrom, setTo, disabled,
}: {
  label: string; from: string; to: string; setFrom: (v: string) => void; setTo: (v: string) => void;
  disabled: boolean;
}) {
  const [fromAria, toAria] = useRangeAria(label);
  return (
    <InlineSettingRow label={label}>
      <TimeField value={from} disabled={disabled} ariaLabel={fromAria} onChange={setFrom} />
      <span className={faintCls}>–</span>
      <TimeField value={to} disabled={disabled} ariaLabel={toAria} onChange={setTo} />
    </InlineSettingRow>
  );
}

/** Zwei Zahleneingaben „von – bis" mit gemeinsamer Einheit. Je Feld ein eigener Bereich, weil sich der
 *  Vorschlag einer geleerten Eingabe unterscheiden KANN: bei der Frist 15 „von" / 60 „bis", bei der
 *  Anzahl pro Tag teilen sich beide Felder dieselbe Konstante. */
function NumberRangeRow({
  label, fromRange, toRange, from, to, setFrom, setTo, unit, disabled,
}: {
  label: string; fromRange: NumberRange; toRange: NumberRange;
  from: number; to: number; setFrom: (n: number) => void; setTo: (n: number) => void;
  unit: string; disabled: boolean;
}) {
  const [fromAria, toAria] = useRangeAria(label);
  return (
    <InlineSettingRow label={label} unit={unit}>
      <NumberInput value={from} range={fromRange}
        disabled={disabled} ariaLabel={fromAria} onCommit={setFrom} />
      <span className={faintCls}>–</span>
      <NumberInput value={to} range={toRange}
        disabled={disabled} ariaLabel={toAria} onCommit={setTo} />
    </InlineSettingRow>
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
  nurBeiSperre: boolean;
  days: number; // Wochentage, an denen überhaupt geplant wird
  dayRules: AutoInspectionDayRule[];
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
  initialNurBeiSperre,
  initialDays,
  initialDayRules,
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
  initialNurBeiSperre: boolean;
  initialDays: number;
  /** Roh aus der Spalte (JSON-String oder null) — geparst wird hier, mit demselben tolerant lesenden
   *  Parser wie der Server. */
  initialDayRules: unknown;
}) {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const { saving, save } = useUserSettingsSave(userId);
  const initial: AutoKontrolleForm = {
    aktiv: initialAktiv, perDayMin: initialPerDayMin, perDayMax: initialPerDayMax,
    ruheVon: initialRuheVon, ruheBis: initialRuheBis, fristVon: initialFristVon, fristBis: initialFristBis,
    fensterVon: initialFensterVon, fensterBis: initialFensterBis, nurBeiSperre: initialNurBeiSperre,
    days: initialDays, dayRules: parseAutoInspectionDayRules(initialDayRules),
  };
  const [form, setForm] = useState(initial);
  // Der zuletzt vom Server angenommene Stand — Referenz für „geändert?". Ein abgelehnter Patch (z.B.
  // leere Uhrzeit) lässt ihn stehen, das Formular bleibt dirty und der Keyholder kann korrigieren.
  const [saved, setSaved] = useState(initial);
  // Über den serialisierten Wert, nicht über `!==`: die Tages-Ausnahmen sind ein Array und wären
  // sonst immer ungleich sich selbst — das Formular stünde dauerhaft auf „geändert".
  const dirty = (Object.keys(form) as (keyof AutoKontrolleForm)[])
    .some((k) => JSON.stringify(form[k]) !== JSON.stringify(saved[k]));

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
      // Dieselbe Regel je Ausnahme — ein halbes Fenster lehnt der Service ab, statt es still als
      // „kein Fenster" zu speichern. Hier vollständig machen, damit der Keyholder nicht wegen einer
      // versehentlich geleerten Uhrzeit eine Fehlermeldung für die ganze Liste bekommt.
      dayRules: form.dayRules.map((r) => (r.fensterVon && r.fensterBis ? r : { ...r, fensterVon: "", fensterBis: "" })),
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
      autoKontrolleNurBeiSperre: normalized.nurBeiSperre,
      autoKontrolleDays: normalized.days,
      autoKontrolleDayRules: normalized.dayRules,
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
          {/* Nur während einer aktiven Sperrzeit auslösen (sonst wird eine fällige Kontrolle verworfen) */}
          <Toggle
            label={t("autoKontrolleNurBeiSperreLabel")}
            description={t("autoKontrolleNurBeiSperreDesc")}
            checked={form.nurBeiSperre}
            disabled={saving}
            onChange={(checked) => set("nurBeiSperre", checked)}
          />

          {/* Anzahl pro Tag: zufällig zwischen Min und Max */}
          <NumberRangeRow
            label={t("autoKontrolleProTagLabel")}
            fromRange={AUTO_INSPECTION_PER_DAY_RANGE} toRange={AUTO_INSPECTION_PER_DAY_RANGE}
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
          />

          {/* Erfüllungsdauer von–bis (Minuten) */}
          <NumberRangeRow
            label={t("autoKontrolleFristLabel")}
            fromRange={AUTO_INSPECTION_DEADLINE_FROM_RANGE} toRange={AUTO_INSPECTION_DEADLINE_TO_RANGE}
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
            />
          )}

          {/* An welchen Wochentagen überhaupt geplant wird. */}
          <div className="flex flex-col gap-2 pl-1">
            <SettingLabel label={t("autoKontrolleDaysLabel")} description={t("autoKontrolleDaysDesc")} />
            <WeekdayPicker
              mask={form.days}
              disabled={saving}
              ariaLabel={t("autoKontrolleDaysLabel")}
              // „An keinem Tag" wäre eine zweite, stille Art, die Automatik abzuschalten — dafür
              // ist der Schalter ganz oben da. Die Wache dagegen steht im `WeekdayPicker`.
              onChange={(next) => set("days", next)}
            />
          </div>

          {/* Tages-Ausnahmen: ersetzen an ihren Tagen Schlaf- und Auslöse-Fenster. */}
          <div className="flex flex-col gap-2 pl-1">
            <SettingLabel label={t("autoKontrolleDayRulesLabel")} description={t("autoKontrolleDayRulesDesc")} />
            {form.dayRules.length === 0 && (
              <span className={`${faintCls} italic`}>{t("autoKontrolleDayRulesEmpty")}</span>
            )}
            {form.dayRules.map((r, i) => {
              // Eine Ausnahme wird immer als GANZES ersetzt — dasselbe Vorgehen wie bei den
              // Reinigungs- und Wiege-Fenstern.
              const patch = (change: Partial<AutoInspectionDayRule>) =>
                set("dayRules", form.dayRules.map((x, j) => (j === i ? { ...x, ...change } : x)));
              const ruleWindowOn = r.fensterVon !== "" || r.fensterBis !== "";
              return (
                <div key={i} className="flex flex-col gap-2 rounded-xl border border-border-subtle p-3">
                  <div className="flex items-center justify-between gap-2">
                    <WeekdayPicker
                      mask={r.days}
                      disabled={saving}
                      ariaLabel={t("autoKontrolleDayRuleDays")}
                      onChange={(next) => patch({ days: next })}
                    />
                    <RemoveRowButton
                      onClick={() => set("dayRules", form.dayRules.filter((_, j) => j !== i))}
                      disabled={saving}
                      ariaLabel={t("autoKontrolleDayRuleRemove")}
                      tone="neutral"
                    />
                  </div>
                  <TimeRangeRow
                    label={t("autoKontrolleRuheLabel")}
                    from={r.ruheVon} to={r.ruheBis}
                    setFrom={(v) => patch({ ruheVon: v })} setTo={(v) => patch({ ruheBis: v })}
                    disabled={saving}
                  />
                  <Toggle
                    label={t("autoKontrolleFensterLabel")}
                    checked={ruleWindowOn}
                    disabled={saving}
                    onChange={(on) => patch({
                      fensterVon: on ? (r.fensterVon || FENSTER_DEFAULT.von) : "",
                      fensterBis: on ? (r.fensterBis || FENSTER_DEFAULT.bis) : "",
                    })}
                  />
                  {ruleWindowOn && (
                    <TimeRangeRow
                      label={t("autoKontrolleFensterLabel")}
                      from={r.fensterVon} to={r.fensterBis}
                      setFrom={(v) => patch({ fensterVon: v })} setTo={(v) => patch({ fensterBis: v })}
                      disabled={saving}
                    />
                  )}
                </div>
              );
            })}
            {form.dayRules.length < AUTO_INSPECTION_DAY_RULES_MAX && (
              <button
                type="button"
                onClick={() => set("dayRules", [...form.dayRules, {
                  // Der Grundstand als Ausgangspunkt: die Ausnahme entsteht als Kopie dessen, was
                  // ohnehin gilt, und der Keyholder ändert daran genau das eine, was abweichen soll.
                  days: ALL_WEEKDAYS,
                  ruheVon: form.ruheVon, ruheBis: form.ruheBis,
                  fensterVon: form.fensterVon, fensterBis: form.fensterBis,
                }])}
                disabled={saving}
                className="flex items-center gap-1 text-xs text-foreground-muted hover:text-foreground disabled:opacity-50 w-fit"
              >
                <Plus size={14} /> {t("autoKontrolleDayRuleAdd")}
              </button>
            )}
          </div>
        </>
      )}
      <Button size="sm" onClick={handleSave} loading={saving} disabled={!dirty} className="w-fit">
        {tc("save")}
      </Button>
    </div>
  );
}
