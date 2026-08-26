"use client";

import { useState } from "react";
import { signIn, getSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import AuthScreen, { AuthLink } from "@/app/components/AuthScreen";
import Button from "@/app/components/Button";
import FormError from "@/app/components/FormError";
import Input from "@/app/components/Input";
import LocaleSwitcher from "@/app/components/LocaleSwitcher";
import PasskeyLoginButton from "@/app/components/PasskeyLoginButton";
import { clearSwUserCache } from "@/lib/swMessages";
import { syncLocaleCookieFromLogin } from "@/lib/locale";

export default function LoginPage() {
  const t = useTranslations("login");
  const tc = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  /**
   * Warum die abgelehnte Anmeldung scheiterte — Sperre oder falsche Daten.
   *
   * Die Auskunft ist eine Verfeinerung, kein Teil der Anmeldung: antwortet die Route nicht oder nicht
   * mit dem erwarteten JSON, darf das die Meldung nicht verschlucken. „Ungültige Anmeldedaten" wäre
   * dann auch nur geraten — bei einer gestörten Datenbank scheitert die Anmeldung selbst bei
   * richtigem Passwort. Deshalb in dem Fall die neutrale Meldung.
   */
  async function rejectionMessage(): Promise<string> {
    const data = await fetch(`/api/auth/lockout?username=${encodeURIComponent(username)}`)
      .then((res) => (res.ok ? res.json() : null))
      .catch(() => null);
    if (!data) return t("loginFailed");
    return data.locked ? t("accountLocked") : t("invalidCredentials");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const result = await signIn("credentials", { username, password, redirect: false });
      if (result?.error) {
        setError(await rejectionMessage());
        return;
      }
      clearSwUserCache();
      const session = await getSession(); // Session-Cookie sicher gesetzt, bevor der Landing-Resolver auf "/" greift.
      // Sprache dieses Accounts übernehmen — sonst bliebe das Cookie eines vorher an DIESEM Browser
      // angemeldeten Users stehen (falsche UI-Sprache trotz korrekter Einstellung).
      syncLocaleCookieFromLogin((session?.user as { locale?: string })?.locale);
      // Ziel entscheidet der serverseitige Resolver (src/lib/landing.ts) anhand der startPage-Präferenz.
      router.push("/");
      router.refresh();
    } catch {
      setError(tc("networkError"));
    } finally {
      setLoading(false);
    }
  }

  return (
    /* Der Titel IST hier die Wortmarke: auf diesem Bildschirm gibt es nichts zu benennen ausser der
       App selbst. Sie steht deshalb in der Serif, die anderswo die Titel trägt — vorher stand sie
       fett in der Grotesk und war damit die einzige Überschrift der App, die nicht mitspielte. */
    <AuthScreen
      title="KG Tracker"
      subtitle={t("subtitle")}
      footer={<AuthLink href="/forgot-password">{t("forgotPassword")}</AuthLink>}
    >
      <div className="flex justify-center">
        <LocaleSwitcher current={locale} />
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Input
          label={t("username")}
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
          autoComplete="username"
          autoCapitalize="none"
        />
        <Input
          label={t("password")}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
        />
        <FormError message={error} />
        <Button type="submit" variant="primary" fullWidth loading={loading}>
          {t("submit")}
        </Button>
      </form>

      {/* Passkey nur auf Browsern, die ihn können — und die Haarlinie MIT ihm. Sie stand hier im
          Wrapper und rendete deshalb immer, während der Knopf `null` liefert, solange WebAuthn
          fehlt oder noch nicht geprüft ist (das ist beim ersten Bild IMMER so, `supported` wird
          erst im Effekt gesetzt). Übrig blieb ein freistehender Strich am Fuss des Formulars, der
          nichts von nichts trennte. Die Trennung gehört zu dem, was sie abtrennt. */}
      <PasskeyLoginButton />
    </AuthScreen>
  );
}
