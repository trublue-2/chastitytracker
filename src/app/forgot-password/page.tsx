"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import AuthScreen, { AuthLink } from "@/app/components/AuthScreen";
import Button from "@/app/components/Button";
import Input from "@/app/components/Input";

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
    <AuthScreen
      title={t("pageTitle")}
      footer={<AuthLink href="/login">{t("backToLogin")}</AuthLink>}
    >
      {submitted ? (
        /* Die Bestätigung ist absichtlich unauffällig und KEIN Erfolgs-Kasten: sie sagt nicht
           „gesendet", sondern „falls es dieses Konto gibt, wurde gesendet". Ein grüner Kasten
           behauptete mehr, als die Antwort hergibt — und verriete nebenbei, dass es das Konto gibt. */
        <p className="text-fliess text-foreground-muted text-center">{t("successMessage")}</p>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Input
            label={t("usernameLabel")}
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            autoFocus
            autoComplete="username"
            autoCapitalize="none"
          />
          <Button type="submit" variant="primary" fullWidth loading={loading}>
            {t("sendLink")}
          </Button>
        </form>
      )}
    </AuthScreen>
  );
}
