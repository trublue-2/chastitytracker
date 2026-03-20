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
      setError(t("invalidCredentials"));
    } else {
      router.push("/dashboard");
      router.refresh();
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 bg-[#f8f9fb]">
      <div className="w-full max-w-sm">
        {/* Brand */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gray-900 text-white">
            <Lock size={32} strokeWidth={2} />
          </div>
          <h1 className="mt-4 text-2xl font-bold text-gray-900 tracking-tight">KG Tracker</h1>
          <p className="mt-1 text-sm text-gray-500">{t("subtitle")}</p>
        </div>

        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-8">
          <div className="flex justify-center mb-6">
            <LocaleSwitcher current={locale} />
          </div>
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                {t("username")}
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoComplete="username"
                autoCapitalize="none"
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3.5 text-base text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                {t("password")}
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3.5 text-base text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition"
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
              className="mt-1 w-full bg-gray-900 text-white rounded-xl py-3.5 text-base font-semibold hover:bg-gray-700 active:scale-[0.98] disabled:opacity-50 transition-all"
            >
              {loading ? t("submitting") : t("submit")}
            </button>
          </form>
        </div>
        <div className="mt-4 px-1">
          <Link href="/forgot-password" className="text-sm text-gray-400 hover:text-gray-600 transition">
            {t("forgotPassword")}
          </Link>
        </div>
      </div>
    </div>
  );
}
