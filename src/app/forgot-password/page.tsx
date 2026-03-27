"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";

export default function ForgotPasswordPage() {
  const t = useTranslations("forgotPassword");
  const [username, setUsername] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username }),
    });
    setSubmitted(true);
    setLoading(false);
  }

  return (
    <div data-theme="user" className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-surface rounded-2xl border border-border-subtle shadow-sm px-8 py-10">
        <h1 className="text-xl font-bold text-foreground mb-1">{t("pageTitle")}</h1>

        {submitted ? (
          <>
            <p className="text-sm text-foreground-faint mt-3">
              {t("successMessage")}
            </p>
            <Link href="/login" className="mt-6 block text-center text-sm text-[var(--color-request)] hover:underline">
              {t("backToLogin")}
            </Link>
          </>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4 mt-4">
            <div>
              <label className="block text-xs font-semibold text-foreground-faint mb-1">{t("usernameLabel")}</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoFocus
                className="w-full px-3 py-2 border border-border rounded-xl text-sm bg-surface-raised text-foreground focus:outline-none focus:ring-2 focus:ring-foreground-muted"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-foreground text-background text-sm font-semibold py-2.5 rounded-xl hover:opacity-80 transition disabled:opacity-50"
            >
              {loading ? t("submitting") : t("sendLink")}
            </button>
            <Link href="/login" className="text-center text-xs text-foreground-faint hover:text-foreground-muted transition">
              {t("backToLogin")}
            </Link>
          </form>
        )}
      </div>
    </div>
  );
}
