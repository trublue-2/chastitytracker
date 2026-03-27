"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import { useTranslations, useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { User, ChevronRight } from "lucide-react";

interface SettingsFormProps {
  username: string;
  email: string | null;
  version: string;
  buildDate?: string;
}

const inputCls =
  "w-full border border-border rounded-xl px-4 py-3 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-foreground/20 bg-surface-raised";

export default function SettingsForm({ username, email, version, buildDate }: SettingsFormProps) {
  const t = useTranslations("settings");
  const locale = useLocale();
  const router = useRouter();

  function setLocale(value: string) {
    document.cookie = `locale=${value}; path=/; max-age=31536000; SameSite=Lax`;
    router.refresh();
  }

  const [expandPassword, setExpandPassword] = useState(false);
  const [expandEmail, setExpandEmail] = useState(false);
  const [expandLanguage, setExpandLanguage] = useState(false);

  // Password change state
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwSuccess, setPwSuccess] = useState(false);
  const [pwLoading, setPwLoading] = useState(false);

  async function handlePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwError(null);
    if (next !== confirm) { setPwError(t("passwordMismatch")); return; }
    setPwLoading(true);
    const res = await fetch("/api/settings/password", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword: current, newPassword: next }),
    });
    setPwLoading(false);
    if (res.ok) {
      setPwSuccess(true);
      setCurrent(""); setNext(""); setConfirm("");
    } else {
      const data = await res.json();
      setPwError(data.error ?? t("saveBtn"));
    }
  }

  return (
    <main className="flex-1 w-full max-w-5xl px-4 py-6">
      <div className="max-w-lg mx-auto flex flex-col gap-4">

        {/* Avatar / User Info */}
        <div className="flex flex-col items-center gap-2 pt-6 pb-4">
          <div className="w-16 h-16 rounded-full bg-surface-raised border border-border flex items-center justify-center">
            <User size={28} className="text-foreground-faint" />
          </div>
          <p className="text-sm font-semibold text-foreground">{username}</p>
          {email && <p className="text-xs text-foreground-faint">{email}</p>}
        </div>

        {/* KONTO-Sektion */}
        <div className="bg-surface rounded-2xl border border-border-subtle overflow-hidden">
          <p className="px-5 pt-4 pb-1 text-[10px] font-semibold text-foreground-faint uppercase tracking-widest">
            Konto
          </p>
          <div className="divide-y divide-border-subtle">

            {/* Passwort ändern */}
            <div>
              <button
                className="w-full flex items-center justify-between px-5 py-4 hover:bg-surface-raised transition text-left"
                onClick={() => { setExpandPassword(!expandPassword); setExpandEmail(false); setExpandLanguage(false); }}
              >
                <span className="text-sm text-foreground">{t("changePassword")}</span>
                <ChevronRight
                  size={16}
                  className={`text-foreground-faint transition-transform duration-200 ${expandPassword ? "rotate-90" : ""}`}
                />
              </button>
              {expandPassword && (
                <div className="px-5 pb-5">
                  {pwSuccess ? (
                    <p className="text-sm text-emerald-700 bg-emerald-50 rounded-xl px-4 py-3">{t("passwordChanged")}</p>
                  ) : (
                    <form onSubmit={handlePassword} className="flex flex-col gap-4">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-semibold text-foreground-faint uppercase tracking-wider">{t("currentPassword")}</label>
                        <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} required autoComplete="current-password" className={inputCls} />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-semibold text-foreground-faint uppercase tracking-wider">{t("newPassword")}</label>
                        <input type="password" value={next} onChange={(e) => setNext(e.target.value)} required minLength={4} autoComplete="new-password" className={inputCls} />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-semibold text-foreground-faint uppercase tracking-wider">{t("confirmPassword")}</label>
                        <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required autoComplete="new-password" className={inputCls} />
                      </div>
                      {pwError && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{pwError}</p>}
                      <button
                        type="submit"
                        disabled={pwLoading}
                        className="w-full bg-foreground text-background font-semibold py-3 rounded-xl hover:opacity-80 active:scale-95 transition-all disabled:opacity-50"
                      >
                        {pwLoading ? t("saving") : t("saveBtn")}
                      </button>
                    </form>
                  )}
                </div>
              )}
            </div>

            {/* E-Mail ändern */}
            <div>
              <button
                className="w-full flex items-center justify-between px-5 py-4 hover:bg-surface-raised transition text-left"
                onClick={() => { setExpandEmail(!expandEmail); setExpandPassword(false); setExpandLanguage(false); }}
              >
                <span className="text-sm text-foreground">E-Mail ändern</span>
                <ChevronRight
                  size={16}
                  className={`text-foreground-faint transition-transform duration-200 ${expandEmail ? "rotate-90" : ""}`}
                />
              </button>
              {expandEmail && (
                <div className="px-5 pb-5">
                  <p className="text-sm text-foreground-faint">E-Mail-Änderung ist derzeit nicht verfügbar.</p>
                </div>
              )}
            </div>

            {/* Sprache */}
            <div>
              <button
                className="w-full flex items-center justify-between px-5 py-4 hover:bg-surface-raised transition text-left"
                onClick={() => { setExpandLanguage(!expandLanguage); setExpandPassword(false); setExpandEmail(false); }}
              >
                <span className="text-sm text-foreground">{t("language")}</span>
                <ChevronRight
                  size={16}
                  className={`text-foreground-faint transition-transform duration-200 ${expandLanguage ? "rotate-90" : ""}`}
                />
              </button>
              {expandLanguage && (
                <div className="px-5 pb-5">
                  <select value={locale} onChange={(e) => setLocale(e.target.value)} className={inputCls}>
                    <option value="de">Deutsch</option>
                    <option value="en">English</option>
                  </select>
                </div>
              )}
            </div>

            {/* Abmelden */}
            <button
              className="w-full flex items-center px-5 py-4 hover:bg-surface-raised transition text-left"
              onClick={() => { if (window.confirm(t("signOutConfirm"))) signOut({ callbackUrl: "/login" }); }}
            >
              <span className="text-sm text-warn font-medium">{t("signOut")}</span>
            </button>

          </div>
        </div>

        {/* APP-Sektion */}
        <div className="bg-surface rounded-2xl border border-border-subtle overflow-hidden mb-6">
          <p className="px-5 pt-4 pb-1 text-[10px] font-semibold text-foreground-faint uppercase tracking-widest">
            App
          </p>
          <div className="divide-y divide-border-subtle">
            <div className="flex items-center justify-between px-5 py-4">
              <span className="text-sm text-foreground">Version</span>
              <span className="text-sm text-foreground-faint font-mono">{version}</span>
            </div>
            <div className="flex items-center justify-between px-5 py-4">
              <span className="text-sm text-foreground">Build-Datum</span>
              <span className="text-sm text-foreground-faint">{buildDate ?? "lokal"}</span>
            </div>
          </div>
        </div>

      </div>
    </main>
  );
}
