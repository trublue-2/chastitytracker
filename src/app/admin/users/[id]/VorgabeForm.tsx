"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import Button from "@/app/components/Button";
import FormError from "@/app/components/FormError";

const HOURS_PER_DAY = 24;
const HOURS_PER_WEEK = 168;
const HOURS_PER_MONTH = 730;

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
          step={unit === "%" ? 1 : 0.5}
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
  tagVal: string;
  wocheVal: string;
  monatVal: string;
  notiz: string;
}

interface Props {
  userId: string;
  vorgabeId?: string;
  initialValues?: VorgabeInitialValues;
  onCancel?: () => void;
}

export default function VorgabeForm({ userId, vorgabeId, initialValues, onCancel }: Props) {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const router = useRouter();
  const isEdit = !!vorgabeId;

  const [gueltigAb, setGueltigAb] = useState(initialValues?.gueltigAb ?? "");
  const [gueltigBis, setGueltigBis] = useState(initialValues?.gueltigBis ?? "");
  const [tagVal, setTagVal] = useState(initialValues?.tagVal ?? "");   const [tagUnit, setTagUnit] = useState("h");
  const [wocheVal, setWocheVal] = useState(initialValues?.wocheVal ?? ""); const [wocheUnit, setWocheUnit] = useState("h");
  const [monatVal, setMonatVal] = useState(initialValues?.monatVal ?? ""); const [monatUnit, setMonatUnit] = useState("h");
  const [notiz, setNotiz] = useState(initialValues?.notiz ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);

    const payload = {
      userId,
      gueltigAb,
      gueltigBis: gueltigBis || null,
      minProTagH: toHours(tagVal, tagUnit, HOURS_PER_DAY),
      minProWocheH: toHours(wocheVal, wocheUnit, HOURS_PER_WEEK),
      minProMonatH: toHours(monatVal, monatUnit, HOURS_PER_MONTH),
      notiz: notiz || null,
    };

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
      const d = await res.json();
      setError(d.error ?? tc("error"));
      return;
    }

    if (isEdit) {
      router.refresh();
      onCancel?.();
    } else {
      setGueltigAb(""); setGueltigBis("");
      setTagVal(""); setWocheVal(""); setMonatVal(""); setNotiz("");
      router.refresh();
    }
  }

  return (
    <form onSubmit={handleSubmit} className={`flex flex-col gap-4 p-5 border rounded-2xl overflow-hidden ${isEdit ? "bg-warn-bg border-[var(--color-warn-border)]" : "bg-[var(--color-request-bg)] border-[var(--color-request-border)]"}`}>
      <p className={`text-sm font-bold ${isEdit ? "text-[var(--color-warn-text)]" : "text-[var(--color-request-text)]"}`}>
        {isEdit ? t("vorgabeEditTitle") : t("vorgabeAddTitle")}
      </p>

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

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <InputWithUnit label={t("vorgabeDay")} value={tagVal} unit={tagUnit}
          onValue={setTagVal} onUnit={setTagUnit} basis={HOURS_PER_DAY} max={24} />
        <InputWithUnit label={t("vorgabeWeek")} value={wocheVal} unit={wocheUnit}
          onValue={setWocheVal} onUnit={setWocheUnit} basis={HOURS_PER_WEEK} max={168} />
        <InputWithUnit label={t("vorgabeMonth")} value={monatVal} unit={monatUnit}
          onValue={setMonatVal} onUnit={setMonatUnit} basis={HOURS_PER_MONTH} max={730} />
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
