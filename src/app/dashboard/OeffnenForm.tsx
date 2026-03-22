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
}

export default function OeffnenForm({ initial, sperrzeitEndetAt }: Props) {
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
    if (sperrzeitEndetAt && new Date(sperrzeitEndetAt) > new Date()) {
      setShowWarning(true);
      return;
    }
    await doSave();
  }

  const inputCls = "w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3.5 text-base text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition";

  const isGesperrt = !!(sperrzeitEndetAt && new Date(sperrzeitEndetAt) > new Date());

  return (
    <>
      {/* Warnmeldung bei aktiver Sperrzeit */}
      {showWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-6">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 flex flex-col gap-5">
            <div className="flex items-start gap-3">
              <AlertCircle size={28} className="flex-shrink-0 text-red-500 mt-0.5" />
              <div className="flex flex-col gap-1.5">
                <p className="font-bold text-gray-900 text-base leading-snug">
                  {t("modalTitle")}
                </p>
                <p className="text-sm text-gray-600">
                  {t("modalSubtext")}
                </p>
                {sperrzeitEndetAt && (
                  <p className="text-xs text-rose-600 font-semibold mt-1">
                    {t("modalLockedUntil", { date: new Date(sperrzeitEndetAt).toLocaleString(dl, { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) })}
                  </p>
                )}
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => setShowWarning(false)}
                className="w-full text-sm font-semibold text-white bg-gray-900 rounded-xl py-3 hover:bg-gray-700 transition"
              >
                {t("modalStay")}
              </button>
              <button
                type="button"
                onClick={() => { setShowWarning(false); doSave(); }}
                disabled={saving}
                className="w-full text-sm font-semibold text-red-600 border border-red-200 bg-red-50 rounded-xl py-3 hover:bg-red-100 active:scale-[0.98] disabled:opacity-50 transition"
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
          <div className="flex items-start gap-2.5 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3">
            <Lock size={16} className="flex-shrink-0 text-rose-500 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-rose-800">{t("lockedWarningTitle")}</p>
              <p className="text-xs text-rose-600 mt-0.5">
                {t("lockedWarningText", { date: new Date(sperrzeitEndetAt!).toLocaleString(dl, { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) })}
              </p>
            </div>
          </div>
        )}
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
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
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
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
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
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

        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{error}</p>}

        <div className="flex flex-col-reverse sm:flex-row gap-3 pt-1">
          <button type="button" onClick={() => router.push("/dashboard")}
            className="flex-1 text-sm text-gray-600 border border-gray-200 rounded-xl py-3.5 hover:bg-gray-50 active:scale-[0.98] transition-all">
            {tCommon("cancel")}
          </button>
          <button type="submit" disabled={saving}
            className="flex-1 bg-gray-900 text-white text-base font-semibold py-3.5 rounded-xl hover:bg-gray-700 active:scale-[0.98] disabled:opacity-50 transition-all">
            {saving ? tCommon("saving") : initial ? tCommon("update") : t("saveBtn")}
          </button>
        </div>
      </form>
    </>
  );
}
