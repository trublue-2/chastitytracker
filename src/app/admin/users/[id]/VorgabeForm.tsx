"use client";

import { parseApiErrorCode } from "@/lib/apiClient";
import { useApiError } from "@/app/hooks/useApiError";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import Button from "@/app/components/Button";
import FormFieldLabel from "@/app/components/FormFieldLabel";
import FormError from "@/app/components/FormError";
import WeekdayPicker from "@/app/components/WeekdayPicker";
import AddRowButton from "@/app/components/AddRowButton";
import RemoveRowButton from "@/app/components/RemoveRowButton";
import { editRowCardCls } from "@/app/components/inputStyles";
import { coveragePct } from "@/lib/percent";
import { HOURS_PER_DAY, HOURS_PER_WEEK, HOURS_PER_MONTH, HOURS_PER_YEAR } from "@/lib/constants";
import { ALL_WEEKDAYS } from "@/lib/weekdays";
import { WEEKDAY_GOAL_RULES_MAX, type WeekdayGoalRule } from "@/lib/weekdayGoal";

function toHours(value: string, unit: string, basis: number): number | null {
  const n = parseFloat(value);
  if (isNaN(n) || n <= 0) return null;
  return unit === "%" ? (n / 100) * basis : n;
}

// Ohne Fokus-Klassen: `globals.css` setzt den Ring ungeschichtet auf `:focus-visible` und schlägt
// damit jede Utility aus `@layer utilities`. Die frühere Kombination war schon deshalb wirkungslos —
// und liess den Abstand (`outline-offset`) weg, den die globale Regel mitbringt.
const fieldCls = "bg-surface-raised border border-border rounded-lg px-3 py-2 text-sm text-foreground transition";

function InputWithUnit({
  label, value, unit, onValue, onUnit, basis, max,
}: {
  label: string; value: string; unit: string;
  onValue: (v: string) => void; onUnit: (u: string) => void;
  basis: number; max: number;
}) {
  return (
    <div>
      <FormFieldLabel className="mb-1.5">{label}</FormFieldLabel>
      <div className="flex gap-2">
        <input
          type="number"
          value={value}
          onChange={(e) => onValue(e.target.value)}
          min={0}
          max={unit === "%" ? 100 : max}
          // "any": Dezimalwerte erlauben (z.B. 16.8 h). Ein fester step (0.5) machte Nicht-Vielfache
          // ungültig und blockierte das gesamte Formular-Submit (inkl. Enddatum).
          step="any"
          placeholder="–"
          // `min-w-0`: sonst schrumpft das Zahlenfeld nicht unter seine Eigenbreite (~170px) und
          // schiebt sich samt Einheiten-Auswahl in die Nachbarspalte — die Felder überlappten.
          className={`flex-1 min-w-0 ${fieldCls}`}
        />
        <select
          value={unit}
          onChange={(e) => onUnit(e.target.value)}
          className={`${fieldCls} px-3 py-2`}
        >
          <option value="h">h</option>
          <option value="%">%</option>
        </select>
      </div>
      {value && (
        <p className="text-xs text-foreground-faint mt-1">
          {unit === "%" && !isNaN(parseFloat(value))
            ? `≈ ${((parseFloat(value) / 100) * basis).toFixed(1)} h`
            : !isNaN(parseFloat(value))
            ? `≈ ${coveragePct(parseFloat(value), basis) ?? 0} %`
            : ""}
        </p>
      )}
    </div>
  );
}

export interface VorgabeInitialValues {
  gueltigAb: string;
  gueltigBis: string;
  validUntilManual: boolean;
  tagVal: string;
  wocheVal: string;
  monatVal: string;
  jahrVal: string;
  /** Wochentag-Ausnahmen des Tages-Solls (geparst) — leer = keine. */
  weekdayExceptions: WeekdayGoalRule[];
  notiz: string;
  categoryId: string;
}

/** Eine Zeile der Wochentag-Ausnahmen: Tage-Auswahl + Std./Tag (0 = Ruhetag). Interaktion wie die
 *  Auto-Kontroll-Tagesregeln (`AutoKontrolleToggle`) — die Ausnahme wird immer als GANZES ersetzt. */
function WeekdayExceptionRow({
  rule, disabled, onChange, onRemove, daysAria, hoursLabel, removeAria,
}: {
  rule: WeekdayGoalRule; disabled: boolean;
  onChange: (next: WeekdayGoalRule) => void; onRemove: () => void;
  daysAria: string; hoursLabel: string; removeAria: string;
}) {
  return (
    <div className={editRowCardCls}>
      <div className="flex items-center justify-between gap-2">
        <WeekdayPicker mask={rule.days} disabled={disabled} ariaLabel={daysAria}
          onChange={(days) => onChange({ ...rule, days })} />
        <RemoveRowButton onClick={onRemove} disabled={disabled} ariaLabel={removeAria} tone="neutral" />
      </div>
      <label className="flex items-center gap-2 text-sm text-foreground">
        <span className="text-foreground-muted">{hoursLabel}</span>
        <input
          type="number" min={0} max={HOURS_PER_DAY} step="any" value={String(rule.hours)}
          disabled={disabled} aria-label={hoursLabel}
          onChange={(e) => onChange({ ...rule, hours: Math.max(0, parseFloat(e.target.value) || 0) })}
          className={`w-24 min-w-0 ${fieldCls}`}
        />
      </label>
    </div>
  );
}

export interface CategoryOption {
  id: string;
  name: string;
}

interface Props {
  userId: string;
  vorgabeId?: string;
  initialValues?: VorgabeInitialValues;
  onCancel?: () => void;
  categories?: CategoryOption[];
}

export default function VorgabeForm({ userId, vorgabeId, initialValues, onCancel, categories }: Props) {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const apiError = useApiError();
  const router = useRouter();
  const isEdit = !!vorgabeId;
  const showCategoryPicker = (categories?.length ?? 0) > 1;

  const [gueltigAb, setGueltigAb] = useState(initialValues?.gueltigAb ?? "");
  const [gueltigBis, setGueltigBis] = useState(initialValues?.gueltigBis ?? "");
  const [tagVal, setTagVal] = useState(initialValues?.tagVal ?? "");   const [tagUnit, setTagUnit] = useState("h");
  const [wocheVal, setWocheVal] = useState(initialValues?.wocheVal ?? ""); const [wocheUnit, setWocheUnit] = useState("h");
  const [monatVal, setMonatVal] = useState(initialValues?.monatVal ?? ""); const [monatUnit, setMonatUnit] = useState("h");
  const [jahrVal, setJahrVal] = useState(initialValues?.jahrVal ?? ""); const [jahrUnit, setJahrUnit] = useState("h");
  const [notiz, setNotiz] = useState(initialValues?.notiz ?? "");
  const [categoryId, setCategoryId] = useState(initialValues?.categoryId ?? categories?.[0]?.id ?? "");
  const initialExceptions = initialValues?.weekdayExceptions ?? [];
  const [exceptions, setExceptions] = useState<WeekdayGoalRule[]>(initialExceptions);
  // Ausklappbar: mit bestehenden Ausnahmen offen, sonst zugeklappt — der Regelfall ist ein Ziel ohne
  // Abweichungen und soll den Abschnitt nicht aufblähen.
  const [showExceptions, setShowExceptions] = useState(initialExceptions.length > 0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);

    // „Manuell" nur, wenn ein Enddatum steht UND es entweder schon manuell war oder gerade
    // geändert wurde. So bleibt ein bloss vorbefülltes (per Verkettung abgeleitetes) Datum
    // weiter automatisch verkettbar, statt beim Bearbeiten anderer Felder einzufrieren.
    const validUntilManual = !!gueltigBis &&
      ((initialValues?.validUntilManual ?? false) || gueltigBis !== (initialValues?.gueltigBis ?? ""));

    const payload = {
      userId,
      categoryId: categoryId || null,
      gueltigAb,
      gueltigBis: gueltigBis || null,
      validUntilManual,
      minProTagH: toHours(tagVal, tagUnit, HOURS_PER_DAY),
      minProWocheH: toHours(wocheVal, wocheUnit, HOURS_PER_WEEK),
      minProMonatH: toHours(monatVal, monatUnit, HOURS_PER_MONTH),
      minProJahrH: toHours(jahrVal, jahrUnit, HOURS_PER_YEAR),
      minProTagWochentage: exceptions,
      notiz: notiz || null,
    };

    try {
      const res = await fetch(
        isEdit ? `/api/admin/vorgaben/${vorgabeId}` : "/api/admin/vorgaben",
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );

      setSaving(false);
      if (!res.ok) {
        setError(apiError(await parseApiErrorCode(res)));
        return;
      }

      if (isEdit) {
        router.refresh();
        onCancel?.();
      } else {
        setGueltigAb(""); setGueltigBis("");
        setTagVal(""); setWocheVal(""); setMonatVal(""); setJahrVal(""); setNotiz("");
        setExceptions([]); setShowExceptions(false);
        router.refresh();
      }
    } catch {
      // Netzwerkfehler (offline/DNS) — ohne dies bliebe die Promise unbehandelt und der Nutzer
      // saehe nur den gestoppten Spinner ohne Meldung. Muster wie in den Geschwister-Formularen.
      setSaving(false);
      setError(tc("networkError"));
    }
  }

  return (
    <form onSubmit={handleSubmit} className={`flex flex-col gap-4 p-5 border rounded-2xl overflow-hidden ${isEdit ? "bg-warn-bg border-[var(--color-warn-border)]" : "bg-[var(--color-request-bg)] border-[var(--color-request-border)]"}`}>
      <p className={`text-sm font-bold ${isEdit ? "text-[var(--color-warn-text)]" : "text-[var(--color-request-text)]"}`}>
        {isEdit ? t("vorgabeEditTitle") : t("vorgabeAddTitle")}
      </p>

      {showCategoryPicker && (
        <div>
          <FormFieldLabel className="mb-1.5">{t("vorgabeCategory")}</FormFieldLabel>
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={`w-full ${fieldCls}`}>
            {categories!.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <FormFieldLabel className="mb-1.5">{t("vorgabeFromRequired")}</FormFieldLabel>
          <input type="date" required value={gueltigAb} onChange={(e) => setGueltigAb(e.target.value)} className={`w-full ${fieldCls}`} />
        </div>
        <div>
          <FormFieldLabel className="mb-1.5">{t("vorgabeToOptional")}</FormFieldLabel>
          <div className="flex gap-2 items-center">
            <input type="date" value={gueltigBis} onChange={(e) => setGueltigBis(e.target.value)} className={`w-full ${fieldCls}`} />
            {gueltigBis && (
              <button type="button" onClick={() => setGueltigBis("")}
                title={t("vorgabeClearDate")}
                className="text-foreground-faint hover:text-warn transition text-lg leading-none flex-shrink-0">
                ×
              </button>
            )}
          </div>
          {!gueltigBis && <p className="text-xs text-foreground-faint mt-1">{t("vorgabeDateOpen")}</p>}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <InputWithUnit label={t("vorgabeDay")} value={tagVal} unit={tagUnit}
          onValue={setTagVal} onUnit={setTagUnit} basis={HOURS_PER_DAY} max={HOURS_PER_DAY} />
        <InputWithUnit label={t("vorgabeWeek")} value={wocheVal} unit={wocheUnit}
          onValue={setWocheVal} onUnit={setWocheUnit} basis={HOURS_PER_WEEK} max={HOURS_PER_WEEK} />
        <InputWithUnit label={t("vorgabeMonth")} value={monatVal} unit={monatUnit}
          onValue={setMonatVal} onUnit={setMonatUnit} basis={HOURS_PER_MONTH} max={HOURS_PER_MONTH} />
        <InputWithUnit label={t("vorgabeYear")} value={jahrVal} unit={jahrUnit}
          onValue={setJahrVal} onUnit={setJahrUnit} basis={HOURS_PER_YEAR} max={HOURS_PER_YEAR} />
      </div>

      {/* Abweichende Wochentage: ersetzen an ihren Tagen das Basis-Tagesziel. Ausklappbar, weil der
          Regelfall ein Ziel ohne Abweichung ist. Interaktion wie die Auto-Kontroll-Tagesregeln. */}
      <div className="flex flex-col gap-2">
        <button type="button" onClick={() => setShowExceptions((s) => !s)}
          aria-expanded={showExceptions}
          className="flex items-center gap-1.5 text-sm font-medium text-foreground-muted hover:text-foreground transition w-fit">
          <span aria-hidden="true" className="text-xs">{showExceptions ? "▾" : "▸"}</span>
          {t("vorgabeWeekdayExceptions")}
          {exceptions.length > 0 && <span className="text-foreground-faint">({exceptions.length})</span>}
        </button>
        {showExceptions && (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-foreground-faint">{t("vorgabeWeekdayExceptionsHint")}</p>
            {exceptions.length === 0 && (
              <span className="text-xs text-foreground-faint italic">{t("vorgabeWeekdayExceptionsEmpty")}</span>
            )}
            {exceptions.map((rule, i) => (
              <WeekdayExceptionRow
                key={i}
                rule={rule}
                disabled={saving}
                daysAria={t("vorgabeWeekdayExceptionDays")}
                hoursLabel={t("vorgabeWeekdayExceptionHours")}
                removeAria={t("vorgabeWeekdayExceptionRemove")}
                onChange={(next) => setExceptions(exceptions.map((x, j) => (j === i ? next : x)))}
                onRemove={() => setExceptions(exceptions.filter((_, j) => j !== i))}
              />
            ))}
            {exceptions.length < WEEKDAY_GOAL_RULES_MAX && (
              <AddRowButton
                label={t("vorgabeWeekdayExceptionAdd")}
                disabled={saving}
                // Neue Ausnahme als Kopie des Basis-Tagesziels (in Stunden), falls gesetzt — sonst 0.
                onClick={() => setExceptions([...exceptions, { days: ALL_WEEKDAYS, hours: toHours(tagVal, tagUnit, HOURS_PER_DAY) ?? 0 }])}
              />
            )}
          </div>
        )}
      </div>

      <div>
        <FormFieldLabel className="mb-1.5">{t("vorgabeNoteOptional")}</FormFieldLabel>
        <input type="text" value={notiz} onChange={(e) => setNotiz(e.target.value)}
          placeholder="z.B. Trainingsstufe 2"
          className={`w-full ${fieldCls}`} />
      </div>

      <FormError message={error || null} />

      <div className="flex gap-2">
        <Button type="submit" variant="primary" loading={saving} className="flex-1">
          {isEdit ? t("vorgabeSaveChanges") : t("vorgabeSave")}
        </Button>
        {isEdit && onCancel && (
          <Button type="button" variant="secondary" onClick={onCancel}>
            {tc("cancel")}
          </Button>
        )}
      </div>
    </form>
  );
}
