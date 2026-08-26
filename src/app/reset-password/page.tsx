"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import AuthScreen, { AuthLink } from "@/app/components/AuthScreen";
import Button from "@/app/components/Button";
import FormError from "@/app/components/FormError";
import Input from "@/app/components/Input";
import { useApiError } from "@/app/hooks/useApiError";
import { parseApiErrorCode } from "@/lib/apiClient";

function ResetPasswordForm() {
  const t = useTranslations("resetPassword");
  const tc = useTranslations("common");
  const apiError = useApiError();
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
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      // `parseApiErrorCode` statt `res.json()`: eine HTML-Fehlerseite (500 vom Server, 502 vom Proxy)
      // liesse ein rohes `.json()` hier werfen — der Nutzer bekäme gar keine Meldung.
      if (!res.ok) { setError(apiError(await parseApiErrorCode(res))); return; }
      router.push("/login?reset=1");
    } catch {
      setError(tc("networkError"));
    } finally {
      setLoading(false);
    }
  }

  // Ohne Token gibt es kein Formular, nur die Auskunft warum. Sie kommt als Fehler-Karte statt als
  // loser roter Satz — es ist derselbe Rang wie ein abgelehnter Versuch, also dieselbe Darstellung.
  if (!token) {
    return <FormError message={t("invalidLink")} />;
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <Input
        label={t("newPassword")}
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
        minLength={8}
        autoFocus
        autoComplete="new-password"
      />
      <Input
        label={t("confirmPassword")}
        type="password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        required
        autoComplete="new-password"
      />
      <FormError message={error} />
      <Button type="submit" variant="primary" fullWidth loading={loading}>
        {t("setPassword")}
      </Button>
    </form>
  );
}

export default function ResetPasswordPage() {
  const t = useTranslations("resetPassword");
  return (
    <AuthScreen
      title={t("pageTitle")}
      footer={<AuthLink href="/login">{t("backToLogin")}</AuthLink>}
    >
      <Suspense>
        <ResetPasswordForm />
      </Suspense>
    </AuthScreen>
  );
}
