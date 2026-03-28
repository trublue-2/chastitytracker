"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toDatetimeLocal, toDateLocale } from "@/lib/utils";
import { AlertCircle, Lock } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";

const OEFFNEN_GRUENDE = ["REINIGUNG", "KEYHOLDER", "NOTFALL", "ANDERES"] as const;
type OeffnenGrund = typeof OEFFNEN_GRUENDE[number];

interface Props {
  initial?: { id: string; startTime: string; note?: string | null; oeffnenGrund?: string | null };
  sperrzeitEndetAt?: string | null;
  sperrzeitUnbefristet?: boolean;
}

export default function OeffnenForm({ initial, sperrzeitEndetAt, sperrzeitUnbefristet = false }: Props) {
  const t = useTranslations("openForm");
  const tCommon = useTranslations("common");
  const dl = toDateLocale(useLocale());
  const router = useRouter();
  const [startTime, setStartTime] = useState(
    toDatetimeLocal(initial?.startTime) || toDatetimeLocal(new Date())
  );
  const [grund, setGrund] = useState<OeffnenGrund | "">(
    (initial?.oeffnenGrund as OeffnenGrund) ?? ""
  );
  const [note, setNote] = useState(initial?.note ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showWarning, setShowWarning] = useState(false);

  async function doSave() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(
        initial ? `/api/entries/${initial.id}` : "/api/entries",
        {
          method: initial ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "OEFFNEN", startTime: new Date(startTime).toISOString(), oeffnenGrund: grund, note: note.trim() || null }),
        }
      );
      setSaving(false);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setError(err.error || tCommon("savingError"));
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } catch {
      setSaving(false);
      setError(tCommon("networkError"));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!grund) { setError(t("grundRequired")); return; }
    if (!note.trim()) { setError(t("commentRequired")); return; }
    if (sperrzeitUnbefristet || (sperrzeitEndetAt && new Date(sperrzeitEndetAt) > new Date())) {
      setShowWarning(true);
      return;
    }
    await doSave();
  }

  const inputCls = "w-full bg-surface-raised border border-border rounded-xl px-4 py-3.5 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-foreground-muted focus:border-transparent transition";

  const isGesperrt = sperrzeitUnbefristet || !!(sperrzeitEndetAt && new Date(sperrzeitEndetAt) > new Date());

  return (
    <>
      {/* Warnmeldung bei aktiver Sperrzeit */}
      {showWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-6">
          <div className="bg-surface rounded-2xl shadow-2xl max-w-sm w-full p-6 flex flex-col gap-5">
            <div className="flex items-start gap-3">
              <AlertCircle size={28} className="flex-shrink-0 text-warn mt-0.5" />
              <div className="flex flex-col gap-1.5">
                <p className="font-bold text-foreground text-base leading-snug">
                  {t("modalTitle")}
                </p>
                <p className="text-sm text-foreground-muted">
                  {t("modalSubtext")}
                </p>
                <p className="text-xs text-[var(--color-sperrzeit)] font-semibold mt-1">
                  {sperrzeitUnbefristet
                    ? t("modalLockedIndefinite")
                    : sperrzeitEndetAt
                      ? t("modalLockedUntil", { date: new Date(sperrzeitEndetAt).toLocaleString(dl, { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) })
                      : null}
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => setShowWarning(false)}
                className="w-full text-sm font-semibold text-background bg-foreground rounded-xl py-3 hover:opacity-80 transition"
              >
                {t("modalStay")}
              </button>
              <button
                type="button"
                onClick={() => { setShowWarning(false); doSave(); }}
                disabled={saving}
                className="w-full text-sm font-semibold text-[var(--color-sperrzeit)] border border-[var(--color-sperrzeit-border)] bg-[var(--color-sperrzeit-bg)] rounded-xl py-3 hover:opacity-90 active:scale-[0.98] disabled:opacity-50 transition"
              >
                {saving ? tCommon("saving") : t("modalOpenAnyway")}
              </button>
            </div>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        {/* Hinweis im Formular bei aktiver Sperrzeit */}
        {isGesperrt && (
          <div className="flex items-start gap-2.5 bg-[var(--color-sperrzeit-bg)] border border-[var(--color-sperrzeit-border)] rounded-xl px-4 py-3">
            <Lock size={16} className="flex-shrink-0 text-[var(--color-sperrzeit)] mt-0.5" />
            <div>
              <p className="text-sm font-bold text-[var(--color-sperrzeit-text)]">{t("lockedWarningTitle")}</p>
              <p className="text-xs text-[var(--color-sperrzeit)] mt-0.5">
                {sperrzeitUnbefristet
                  ? t("lockedWarningTextIndefinite")
                  : t("lockedWarningText", { date: new Date(sperrzeitEndetAt!).toLocaleString(dl, { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) })}
              </p>
            </div>
          </div>
        )}
        <div>
          <label className="block text-xs font-semibold text-foreground-faint uppercase tracking-wider mb-2">
            {tCommon("dateTimeRequired")}
          </label>
          <input
            type="datetime-local"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            required
            className={inputCls}
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-foreground-faint uppercase tracking-wider mb-2">
            {t("grundLabel")}
          </label>
          <select
            value={grund}
            onChange={(e) => { setGrund(e.target.value as OeffnenGrund | ""); if (e.target.value) setError(""); }}
            required
            className={inputCls}
          >
            <option value="">–</option>
            <option value="REINIGUNG">{t("grundReinigung")}</option>
            <option value="KEYHOLDER">{t("grundKeyholder")}</option>
            <option value="NOTFALL">{t("grundNotfall")}</option>
            <option value="ANDERES">{t("grundAnderes")}</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-foreground-faint uppercase tracking-wider mb-2">
            {tCommon("commentRequired")}
          </label>
          <textarea
            value={note}
            onChange={(e) => { setNote(e.target.value); if (e.target.value.trim()) setError(""); }}
            rows={4}
            required
            placeholder={t("commentPlaceholder")}
            className={`${inputCls} resize-none`}
          />
        </div>

        {error && <p className="text-sm text-warn bg-warn-bg border border-[var(--color-warn-border)] rounded-xl px-4 py-3">{error}</p>}

        <div className="flex flex-col-reverse sm:flex-row gap-3 pt-1">
          <button type="button" onClick={() => router.push("/dashboard")}
            className="flex-1 text-sm text-foreground-muted border border-border rounded-xl py-3.5 hover:bg-surface-raised active:scale-[0.98] transition-all">
            {tCommon("cancel")}
          </button>
          <button type="submit" disabled={saving}
            className="flex-1 bg-foreground text-background text-base font-semibold py-3.5 rounded-xl hover:opacity-80 active:scale-[0.98] disabled:opacity-50 transition-all">
            {saving ? tCommon("saving") : initial ? tCommon("update") : t("saveBtn")}
          </button>
        </div>
      </form>
    </>
  );
}
