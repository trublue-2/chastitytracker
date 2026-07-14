"use client";

import { parseApiErrorCode } from "@/lib/apiClient";
import { useApiError } from "@/app/hooks/useApiError";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import Button from "@/app/components/Button";
import FormError from "@/app/components/FormError";
import { HOURS_PER_DAY, HOURS_PER_WEEK, HOURS_PER_MONTH, HOURS_PER_YEAR } from "@/lib/constants";

function toHours(value: string, unit: string, basis: number): number | null {
  const n = parseFloat(value);
  if (isNaN(n) || n <= 0) return null;
  return unit === "%" ? (n / 100) * basis : n;
}

const fieldCls = "bg-surface-raised border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus-visible:outline-2 focus-visible:outline-focus-ring transition";

function InputWithUnit({
  label, value, unit, onValue, onUnit, basis, max,
}: {
  label: string; value: string; unit: string;
  onValue: (v: string) => void; onUnit: (u: string) => void;
  basis: number; max: number;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-foreground-faint uppercase tracking-wider mb-1.5">{label}</label>
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
          className={`flex-1 ${fieldCls}`}
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
            ? `≈ ${((parseFloat(value) / basis) * 100).toFixed(0)} %`
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
  notiz: string;
  categoryId: string;
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
          <label className="block text-xs font-semibold text-foreground-faint uppercase tracking-wider mb-1.5">{t("vorgabeCategory")}</label>
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={`w-full ${fieldCls}`}>
            {categories!.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-foreground-faint uppercase tracking-wider mb-1.5">{t("vorgabeFromRequired")}</label>
          <input type="date" required value={gueltigAb} onChange={(e) => setGueltigAb(e.target.value)} className={`w-full ${fieldCls}`} />
        </div>
        <div>
          <label className="block text-xs font-semibold text-foreground-faint uppercase tracking-wider mb-1.5">{t("vorgabeToOptional")}</label>
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

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <InputWithUnit label={t("vorgabeDay")} value={tagVal} unit={tagUnit}
          onValue={setTagVal} onUnit={setTagUnit} basis={HOURS_PER_DAY} max={HOURS_PER_DAY} />
        <InputWithUnit label={t("vorgabeWeek")} value={wocheVal} unit={wocheUnit}
          onValue={setWocheVal} onUnit={setWocheUnit} basis={HOURS_PER_WEEK} max={HOURS_PER_WEEK} />
        <InputWithUnit label={t("vorgabeMonth")} value={monatVal} unit={monatUnit}
          onValue={setMonatVal} onUnit={setMonatUnit} basis={HOURS_PER_MONTH} max={HOURS_PER_MONTH} />
        <InputWithUnit label={t("vorgabeYear")} value={jahrVal} unit={jahrUnit}
          onValue={setJahrVal} onUnit={setJahrUnit} basis={HOURS_PER_YEAR} max={HOURS_PER_YEAR} />
      </div>

      <div>
        <label className="block text-xs font-semibold text-foreground-faint uppercase tracking-wider mb-1.5">{t("vorgabeNoteOptional")}</label>
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
