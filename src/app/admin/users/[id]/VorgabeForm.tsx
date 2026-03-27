"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

const HOURS_PER_DAY = 24;
const HOURS_PER_WEEK = 168;
const HOURS_PER_MONTH = 730;

function toHours(value: string, unit: string, basis: number): number | null {
  const n = parseFloat(value);
  if (isNaN(n) || n <= 0) return null;
  return unit === "%" ? (n / 100) * basis : n;
}

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
          className="flex-1 bg-surface-raised border border-border rounded-xl px-4 py-3 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-foreground-muted transition"
        />
        <select
          value={unit}
          onChange={(e) => onUnit(e.target.value)}
          className="bg-surface-raised border border-border rounded-xl px-3 py-3 text-sm text-foreground-muted focus:outline-none focus:ring-2 focus:ring-foreground-muted transition"
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
      setError(d.error ?? t("vorgabeSave"));
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

  const inputDate = "bg-surface-raised border border-border rounded-xl px-4 py-3 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-foreground-muted transition w-full";

  return (
    <form onSubmit={handleSubmit} className={`flex flex-col gap-4 p-5 border rounded-2xl overflow-hidden ${isEdit ? "bg-warn-bg border-[var(--color-warn-border)]" : "bg-[var(--color-request-bg)] border-[var(--color-request-border)]"}`}>
      <p className={`text-sm font-bold ${isEdit ? "text-[var(--color-warn-text)]" : "text-[var(--color-request-text)]"}`}>
        {isEdit ? t("vorgabeEditTitle") : t("vorgabeAddTitle")}
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-foreground-faint uppercase tracking-wider mb-1.5">{t("vorgabeFromRequired")}</label>
          <input type="date" required value={gueltigAb} onChange={(e) => setGueltigAb(e.target.value)} className={inputDate} />
        </div>
        <div>
          <label className="block text-xs font-semibold text-foreground-faint uppercase tracking-wider mb-1.5">{t("vorgabeToOptional")}</label>
          <div className="flex gap-2 items-center">
            <input type="date" value={gueltigBis} onChange={(e) => setGueltigBis(e.target.value)} className={inputDate} />
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
          className="bg-surface-raised border border-border rounded-xl px-4 py-3 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-foreground-muted transition w-full" />
      </div>

      {error && <p className="text-sm text-warn">{error}</p>}

      <div className="flex gap-2">
        <button type="submit" disabled={saving}
          className="flex-1 text-background bg-foreground font-semibold py-3 rounded-xl active:scale-[0.98] disabled:opacity-50 hover:opacity-80 transition-all text-sm">
          {saving ? t("vorgabeSaving") : isEdit ? t("vorgabeSaveChanges") : t("vorgabeSave")}
        </button>
        {isEdit && onCancel && (
          <button type="button" onClick={onCancel}
            className="px-5 py-3 rounded-xl border border-border text-foreground-muted text-sm font-medium hover:bg-surface-raised transition">
            {tc("cancel")}
          </button>
        )}
      </div>
    </form>
  );
}
