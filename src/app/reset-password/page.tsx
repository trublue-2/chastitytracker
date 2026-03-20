"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";

function ResetPasswordForm() {
  const t = useTranslations("resetPassword");
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const router = useRouter();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password !== confirm) { setError(t("mismatch")); return; }
    setLoading(true);
    const res = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) { setError(data.error ?? t("mismatch")); return; }
    router.push("/login?reset=1");
  }

  if (!token) {
    return <p className="text-sm text-red-500">{t("invalidLink")}</p>;
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 mt-4">
      <div>
        <label className="block text-xs font-semibold text-gray-500 mb-1">{t("newPassword")}</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
          autoFocus
          className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
        />
      </div>
      <div>
        <label className="block text-xs font-semibold text-gray-500 mb-1">{t("confirmPassword")}</label>
        <input
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
          className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
        />
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="w-full bg-gray-900 text-white text-sm font-semibold py-2.5 rounded-xl hover:bg-gray-700 transition disabled:opacity-50"
      >
        {loading ? t("submitting") : t("setPassword")}
      </button>
    </form>
  );
}

export default function ResetPasswordPage() {
  const t = useTranslations("resetPassword");
  return (
    <div className="min-h-screen bg-[#f8f9fb] flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl border border-gray-100 shadow-sm px-8 py-10">
        <h1 className="text-xl font-bold text-gray-900 mb-1">{t("pageTitle")}</h1>
        <Suspense>
          <ResetPasswordForm />
        </Suspense>
        <Link href="/login" className="mt-4 block text-center text-xs text-gray-400 hover:text-gray-600 transition">
          {t("backToLogin")}
        </Link>
      </div>
    </div>
  );
}
