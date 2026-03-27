"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import Link from "next/link";
import { useTranslations, useLocale } from "next-intl";
import LocaleSwitcher from "@/app/components/LocaleSwitcher";

export default function LoginPage() {
  const t = useTranslations("login");
  const locale = useLocale();
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const result = await signIn("credentials", { username, password, redirect: false });
    setLoading(false);
    if (result?.error) {
      const lockRes = await fetch(`/api/auth/lockout?username=${encodeURIComponent(username)}`);
      const lockData = await lockRes.json();
      setError(lockData.locked ? t("accountLocked") : t("invalidCredentials"));
    } else {
      router.push("/dashboard");
      router.refresh();
    }
  }

  return (
    <div data-theme="user" className="min-h-screen flex flex-col items-center justify-center px-4 bg-background">
      <div className="w-full max-w-sm">
        {/* Brand */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-foreground text-background">
            <Lock size={32} strokeWidth={2} />
          </div>
          <h1 className="mt-4 text-2xl font-bold text-foreground tracking-tight">KG Tracker</h1>
          <p className="mt-1 text-sm text-foreground-muted">{t("subtitle")}</p>
        </div>

        <div className="bg-surface rounded-3xl shadow-sm border border-border p-8">
          <div className="flex justify-center mb-6">
            <LocaleSwitcher current={locale} />
          </div>
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <div>
              <label className="block text-xs font-semibold text-foreground-faint uppercase tracking-wider mb-2">
                {t("username")}
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoComplete="username"
                autoCapitalize="none"
                className="w-full bg-surface-raised border border-border rounded-xl px-4 py-3.5 text-base text-foreground placeholder:text-foreground-faint focus:outline-none focus:ring-2 focus:ring-foreground-muted focus:border-transparent transition"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-foreground-faint uppercase tracking-wider mb-2">
                {t("password")}
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="w-full bg-surface-raised border border-border rounded-xl px-4 py-3.5 text-base text-foreground placeholder:text-foreground-faint focus:outline-none focus:ring-2 focus:ring-foreground-muted focus:border-transparent transition"
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-sm text-red-600 text-center">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="mt-1 w-full bg-foreground text-background rounded-xl py-3.5 text-base font-semibold hover:opacity-80 active:scale-[0.98] disabled:opacity-50 transition-all"
            >
              {loading ? t("submitting") : t("submit")}
            </button>
          </form>
        </div>
        <div className="mt-4 px-1">
          <Link href="/forgot-password" className="text-sm text-foreground-faint hover:text-foreground-muted transition">
            {t("forgotPassword")}
          </Link>
        </div>
      </div>
    </div>
  );
}
