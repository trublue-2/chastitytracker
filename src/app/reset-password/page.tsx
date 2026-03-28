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
    return <p className="text-sm text-warn">{t("invalidLink")}</p>;
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 mt-4">
      <div>
        <label className="block text-xs font-semibold text-foreground-faint mb-1">{t("newPassword")}</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
          autoFocus
          className="w-full px-3 py-2 border border-border rounded-xl text-sm bg-surface-raised text-foreground focus:outline-none focus:ring-2 focus:ring-foreground-muted"
        />
      </div>
      <div>
        <label className="block text-xs font-semibold text-foreground-faint mb-1">{t("confirmPassword")}</label>
        <input
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
          className="w-full px-3 py-2 border border-border rounded-xl text-sm bg-surface-raised text-foreground focus:outline-none focus:ring-2 focus:ring-foreground-muted"
        />
      </div>
      {error && <p className="text-xs text-warn">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="w-full bg-foreground text-background text-sm font-semibold py-2.5 rounded-xl hover:opacity-80 transition disabled:opacity-50"
      >
        {loading ? t("submitting") : t("setPassword")}
      </button>
    </form>
  );
}

export default function ResetPasswordPage() {
  const t = useTranslations("resetPassword");
  return (
    <div data-theme="user" className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-surface rounded-2xl border border-border-subtle shadow-sm px-8 py-10">
        <h1 className="text-xl font-bold text-foreground mb-1">{t("pageTitle")}</h1>
        <Suspense>
          <ResetPasswordForm />
        </Suspense>
        <Link href="/login" className="mt-4 block text-center text-xs text-foreground-faint hover:text-foreground-muted transition">
          {t("backToLogin")}
        </Link>
      </div>
    </div>
  );
}
