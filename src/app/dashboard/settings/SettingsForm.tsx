"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import { useTranslations, useLocale } from "next-intl";
import { useRouter } from "next/navigation";

const inputCls =
  "w-full border border-gray-200 rounded-xl px-4 py-3 text-base text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-gray-50";

interface Props {
  reinigungErlaubt: boolean;
  reinigungMaxMinuten: number;
}

export default function SettingsForm({ reinigungErlaubt, reinigungMaxMinuten }: Props) {
  const t = useTranslations("settings");
  const locale = useLocale();
  const router = useRouter();

  function setLocale(value: string) {
    document.cookie = `locale=${value}; path=/; max-age=31536000; SameSite=Lax`;
    router.refresh();
  }

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const [reinigungChecked, setReinigungChecked] = useState(reinigungErlaubt);
  const [reinigungMin, setReinigungMin] = useState(reinigungMaxMinuten);
  const [reinigungSaved, setReinigungSaved] = useState(false);
  const [reinigungLoading, setReinigungLoading] = useState(false);

  async function handlePassword(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (next !== confirm) { setError(t("passwordMismatch")); return; }
    setLoading(true);
    const res = await fetch("/api/settings/password", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword: current, newPassword: next }),
    });
    setLoading(false);
    if (res.ok) {
      setSuccess(true);
      setCurrent(""); setNext(""); setConfirm("");
    } else {
      const data = await res.json();
      setError(data.error ?? t("saveBtn"));
    }
  }

  async function handleReinigung(e: React.FormEvent) {
    e.preventDefault();
    setReinigungLoading(true);
    await fetch("/api/settings/reinigung", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reinigungErlaubt: reinigungChecked, reinigungMaxMinuten: reinigungMin }),
    });
    setReinigungLoading(false);
    setReinigungSaved(true);
    setTimeout(() => setReinigungSaved(false), 2500);
    router.refresh();
  }

  return (
    <main className="flex-1 w-full max-w-5xl px-6 py-8"><div className="max-w-lg">
      <h1 className="text-xl font-bold text-gray-900 mb-6">{t("title")}</h1>

      {/* Language */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6 mb-4">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">{t("language")}</h2>
        <select value={locale} onChange={(e) => setLocale(e.target.value)} className={inputCls}>
          <option value="de">Deutsch</option>
          <option value="en">English</option>
        </select>
      </div>

      {/* Reinigungsunterbrechung */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6 mb-4">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">{t("reinigungTitle")}</h2>
        <form onSubmit={handleReinigung} className="flex flex-col gap-4">
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={reinigungChecked}
              onChange={(e) => setReinigungChecked(e.target.checked)}
              className="w-5 h-5 rounded accent-indigo-600"
            />
            <span className="text-sm text-gray-700">{t("reinigungErlaubt")}</span>
          </label>
          {reinigungChecked && (
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{t("reinigungMaxMinuten")}</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={120}
                  value={reinigungMin}
                  onChange={(e) => setReinigungMin(Number(e.target.value))}
                  className="w-24 border border-gray-200 rounded-xl px-4 py-3 text-base text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-gray-50"
                />
                <span className="text-sm text-gray-500">{t("minutes")}</span>
              </div>
            </div>
          )}
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={reinigungLoading}
              className="bg-indigo-600 text-white font-semibold px-5 py-2.5 rounded-xl hover:bg-indigo-500 active:scale-95 transition-all disabled:opacity-50 text-sm"
            >
              {reinigungLoading ? t("saving") : t("saveBtn")}
            </button>
            {reinigungSaved && <span className="text-sm text-emerald-600">{t("saved")}</span>}
          </div>
        </form>
      </div>

      {/* Password */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-5">{t("changePassword")}</h2>
        {success ? (
          <p className="text-sm text-emerald-700 bg-emerald-50 rounded-xl px-4 py-3">{t("passwordChanged")}</p>
        ) : (
          <form onSubmit={handlePassword} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{t("currentPassword")}</label>
              <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} required autoComplete="current-password" className={inputCls} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{t("newPassword")}</label>
              <input type="password" value={next} onChange={(e) => setNext(e.target.value)} required minLength={4} autoComplete="new-password" className={inputCls} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{t("confirmPassword")}</label>
              <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required autoComplete="new-password" className={inputCls} />
            </div>
            {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{error}</p>}
            <button type="submit" disabled={loading} className="w-full bg-indigo-600 text-white font-semibold py-3 rounded-xl hover:bg-indigo-500 active:scale-95 transition-all disabled:opacity-50">
              {loading ? t("saving") : t("saveBtn")}
            </button>
          </form>
        )}
      </div>

      <div className="mt-4">
        <button
          onClick={() => { if (window.confirm(t("signOutConfirm"))) signOut({ callbackUrl: "/login" }); }}
          className="w-full text-sm font-semibold text-white bg-red-500 hover:bg-red-600 rounded-2xl py-4 active:scale-[0.98] transition-all"
        >
          {t("signOut")}
        </button>
      </div>
    </div></main>
  );
}
