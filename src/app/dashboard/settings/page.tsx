"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import { useTranslations, useLocale } from "next-intl";
import { useRouter } from "next/navigation";

const inputCls =
  "w-full border border-gray-200 rounded-xl px-4 py-3 text-base text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-gray-50";

export default function SettingsPage() {
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (next !== confirm) {
      setError(t("passwordMismatch"));
      return;
    }
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

  return (
    <main className="flex-1 w-full max-w-5xl px-6 py-8"><div className="max-w-lg">
      <h1 className="text-xl font-bold text-gray-900 mb-6">{t("title")}</h1>

      <div className="bg-white rounded-2xl border border-gray-100 p-6 mb-4">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">{t("language")}</h2>
        <select
          value={locale}
          onChange={(e) => setLocale(e.target.value)}
          className={inputCls}
        >
          <option value="de">Deutsch</option>
          <option value="en">English</option>
        </select>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 p-6">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-5">{t("changePassword")}</h2>

        {success ? (
          <p className="text-sm text-emerald-700 bg-emerald-50 rounded-xl px-4 py-3">
            {t("passwordChanged")}
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{t("currentPassword")}</label>
              <input
                type="password"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                required
                autoComplete="current-password"
                className={inputCls}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{t("newPassword")}</label>
              <input
                type="password"
                value={next}
                onChange={(e) => setNext(e.target.value)}
                required
                minLength={4}
                autoComplete="new-password"
                className={inputCls}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{t("confirmPassword")}</label>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                autoComplete="new-password"
                className={inputCls}
              />
            </div>
            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{error}</p>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-600 text-white font-semibold py-3 rounded-xl hover:bg-indigo-500 active:scale-95 transition-all disabled:opacity-50"
            >
              {loading ? t("saving") : t("saveBtn")}
            </button>
          </form>
        )}
      </div>

      {/* Mobile: Abmelden */}
      <div className="mt-4">
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="w-full text-sm font-semibold text-white bg-red-500 hover:bg-red-600 rounded-2xl py-4 active:scale-[0.98] transition-all"
        >
          {t("signOut")}
        </button>
      </div>
    </div></main>
  );
}
