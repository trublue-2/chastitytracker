"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { useTranslations, useLocale } from "next-intl";
import { User } from "lucide-react";
import Card from "@/app/components/Card";
import Input from "@/app/components/Input";
import Select from "@/app/components/Select";
import Button from "@/app/components/Button";
import FormError from "@/app/components/FormError";
import Divider from "@/app/components/Divider";
import ExpandRow from "@/app/components/ExpandRow";
import Toggle from "@/app/components/Toggle";
import PushManager from "@/app/components/PushManager";
import PasskeyManager from "@/app/components/PasskeyManager";
import ThemeToggle from "@/app/components/ThemeToggle";
import FeedbackButton from "@/app/components/FeedbackButton";
import { useLocaleSwitcher } from "@/app/hooks/useLocaleSwitcher";
import { LOCALES_LONG } from "@/lib/constants";
import { TIMEZONE_OPTIONS } from "@/lib/timezones";
import { useApiError } from "@/app/hooks/useApiError";
import type { SettingsFormProps } from "./getSettingsProps";

export default function SettingsForm({ username, email, timezone, startPage, showStartPage, isAdmin, hideOwnTracker, version, buildDate, feedbackEnabled = true }: SettingsFormProps) {
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const ta = useTranslations("admin");
  const apiError = useApiError();
  const locale = useLocale();
  const switchLocale = useLocaleSwitcher();
  const router = useRouter();

  const [expanded, setExpanded] = useState<string | null>(null);
  function toggle(section: string) {
    setExpanded((prev) => (prev === section ? null : section));
  }

  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwSuccess, setPwSuccess] = useState(false);
  const [pwSaving, setPwSaving] = useState(false);

  async function handlePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwError(null);
    if (next !== confirm) { setPwError(t("passwordMismatch")); return; }
    setPwSaving(true);
    const res = await fetch("/api/settings/password", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newPassword: next }),
    });
    setPwSaving(false);
    if (res.ok) {
      setPwSuccess(true);
      setNext(""); setConfirm("");
    } else {
      const data = await res.json();
      setPwError(apiError(data.error));
    }
  }

  const [emailValue, setEmailValue] = useState(email ?? "");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailSuccess, setEmailSuccess] = useState(false);
  const [emailSaving, setEmailSaving] = useState(false);

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    setEmailError(null);
    setEmailSaving(true);
    const res = await fetch("/api/settings/email", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: emailValue }),
    });
    setEmailSaving(false);
    if (res.ok) {
      setEmailSuccess(true);
    } else {
      const data = await res.json();
      setEmailError(apiError(data.error));
    }
  }

  const [tzValue, setTzValue] = useState(timezone);
  const [tzSuccess, setTzSuccess] = useState(false);
  const [tzError, setTzError] = useState<string | null>(null);
  const [tzSaving, setTzSaving] = useState(false);

  async function handleTimezone(value: string) {
    setTzValue(value);
    setTzSuccess(false);
    setTzError(null);
    setTzSaving(true);
    try {
      const res = await fetch("/api/settings/timezone", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timezone: value }),
      });
      if (res.ok) {
        setTzSuccess(true);
      } else {
        const data = await res.json();
        setTzError(apiError(data.error));
      }
    } catch {
      setTzError(tc("error"));
    } finally {
      setTzSaving(false);
    }
  }

  const [startPageValue, setStartPageValue] = useState(startPage);
  const [startPageSuccess, setStartPageSuccess] = useState(false);
  const [startPageError, setStartPageError] = useState<string | null>(null);
  const [startPageSaving, setStartPageSaving] = useState(false);

  async function handleStartPage(value: string) {
    setStartPageValue(value);
    setStartPageSuccess(false);
    setStartPageError(null);
    setStartPageSaving(true);
    try {
      const res = await fetch("/api/settings/start-page", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startPage: value }),
      });
      if (res.ok) {
        setStartPageSuccess(true);
      } else {
        const data = await res.json();
        setStartPageError(apiError(data.error));
      }
    } catch {
      setStartPageError(tc("error"));
    } finally {
      setStartPageSaving(false);
    }
  }

  const [hideOwnValue, setHideOwnValue] = useState(hideOwnTracker);
  const [hideOwnError, setHideOwnError] = useState<string | null>(null);

  const startPageOptions = [
    { value: "auto", label: t("startPageAuto") },
    { value: "overview", label: t("startPageOverview") },
    // Benutzerverwaltung als Startseite nur für globale Admins — die Seite ist admin-only.
    ...(isAdmin ? [{ value: "users", label: t("startPageUsers") }] : []),
    // "Eigener KG-Tracker" entfällt bei "kein eigener Tracker" — dieser Nutzer hat keinen grünen Bereich.
    ...(hideOwnValue ? [] : [{ value: "dashboard", label: t("startPageDashboard") }]),
  ];

  async function handleHideOwn(checked: boolean) {
    setHideOwnValue(checked);
    setHideOwnError(null);
    try {
      const res = await fetch("/api/settings/hide-own-tracker", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hideOwnTracker: checked }),
      });
      if (!res.ok) {
        setHideOwnValue(!checked); // Rollback bei Fehler
        const data = await res.json();
        setHideOwnError(apiError(data.error));
      } else {
        // "Eigener KG-Tracker" als Startseite ergibt ohne grünen Bereich keinen Sinn und verschwindet aus
        // dem Select → gespeicherte Präferenz auf "auto" zurücksetzen, damit kein optionsloser Wert bleibt.
        if (checked && startPageValue === "dashboard") await handleStartPage("auto");
        // Nav (Meine Sicht) + Routing lesen hideOwnTracker frisch server-seitig → sofort wirksam machen.
        router.refresh();
      }
    } catch {
      setHideOwnValue(!checked);
      setHideOwnError(tc("error"));
    }
  }

  return (
    <main className="flex-1 w-full max-w-2xl mx-auto px-4 py-6 flex flex-col gap-4">

      {/* Avatar / User Info */}
      <div className="flex flex-col items-center gap-2 pt-4 pb-2">
        <div className="w-16 h-16 rounded-full bg-surface-raised border border-border flex items-center justify-center">
          <User size={28} className="text-foreground-faint" />
        </div>
        <p className="text-sm font-semibold text-foreground">{username}</p>
        {email && <p className="text-xs text-foreground-faint">{email}</p>}
      </div>

      {/* Account section */}
      <Card padding="none">
        <p className="px-5 pt-4 pb-1 text-[10px] font-semibold text-foreground-faint uppercase tracking-widest">
          {t("account")}
        </p>
        <div className="divide-y divide-border-subtle">

          {/* Password change */}
          <ExpandRow
            label={t("changePassword")}
            open={expanded === "password"}
            onToggle={() => toggle("password")}
          >
            {pwSuccess ? (
              <p className="text-sm text-ok-text bg-ok-bg border border-ok-border rounded-xl px-4 py-3">{t("passwordChanged")}</p>
            ) : (
              <form onSubmit={handlePassword} className="flex flex-col gap-4">
                <Input
                  label={t("newPassword")}
                  type="password"
                  value={next}
                  onChange={(e) => setNext(e.target.value)}
                  required
                  minLength={8}
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
                <FormError message={pwError} />
                <Button type="submit" variant="primary" fullWidth loading={pwSaving}>
                  {t("saveBtn")}
                </Button>
              </form>
            )}
          </ExpandRow>

          {/* Email change */}
          <ExpandRow
            label={t("changeEmail")}
            open={expanded === "email"}
            onToggle={() => toggle("email")}
          >
            {emailSuccess ? (
              <p className="text-sm text-ok-text bg-ok-bg border border-ok-border rounded-xl px-4 py-3">{t("emailSaved")}</p>
            ) : (
              <form onSubmit={handleEmail} className="flex flex-col gap-4">
                <Input
                  label={t("emailLabel")}
                  type="email"
                  value={emailValue}
                  onChange={(e) => setEmailValue(e.target.value)}
                  placeholder="name@example.com"
                />
                <FormError message={emailError} />
                <Button type="submit" variant="primary" fullWidth loading={emailSaving}>
                  {tc("save")}
                </Button>
              </form>
            )}
          </ExpandRow>

          {/* Theme — Keyholder/Admins (haben das blaue Portal, gleiche Bedingung wie showStartPage)
              stellen beide Designs ein: Admin-Portal (blau) UND eigener Tracker (grün). Reine Subs
              sehen nur ihr eigenes. So sind die Einstellungen in grüner und blauer Ansicht identisch. */}
          {showStartPage ? (
            <>
              <ThemeToggle role="admin" label={ta("designAdmin")} />
              <ThemeToggle role="user" label={ta("designUser")} />
            </>
          ) : (
            <ThemeToggle role="user" />
          )}

          {/* Language */}
          <ExpandRow
            label={t("language")}
            open={expanded === "language"}
            onToggle={() => toggle("language")}
          >
            <Select
              value={locale}
              onChange={(e) => switchLocale(e.target.value)}
              options={LOCALES_LONG}
            />
          </ExpandRow>

          {/* Timezone */}
          <ExpandRow
            label={t("timezone")}
            open={expanded === "timezone"}
            onToggle={() => toggle("timezone")}
          >
            <Select
              value={tzValue}
              onChange={(e) => handleTimezone(e.target.value)}
              options={TIMEZONE_OPTIONS}
              disabled={tzSaving}
              hint={t("timezoneHint")}
            />
            {tzSuccess && <p className="mt-2 text-sm text-ok-text">{t("saved")}</p>}
            <FormError message={tzError} />
          </ExpandRow>

          {/* Startseite nach Login — nur für Keyholder/Admins sinnvoll */}
          {showStartPage && (
            <ExpandRow
              label={t("startPage")}
              open={expanded === "startPage"}
              onToggle={() => toggle("startPage")}
            >
              <Select
                value={startPageValue}
                onChange={(e) => handleStartPage(e.target.value)}
                options={startPageOptions}
                disabled={startPageSaving}
                hint={hideOwnValue ? t("startPageHintNoTracker") : t("startPageHint")}
              />
              {startPageSuccess && <p className="mt-2 text-sm text-ok-text">{t("saved")}</p>}
              <FormError message={startPageError} />
            </ExpandRow>
          )}

          {/* "Kein eigener Tracker" — für alle mit blauem Portal (Admins + reine Keyholder). Blendet die
              eigene Karte, "Meine Sicht" und den grünen Tracker aus (rein UI/Routing, keine Datenänderung). */}
          {showStartPage && (
            <div className="px-5 py-2">
              <Toggle
                label={t("hideOwnTracker")}
                description={t("hideOwnTrackerHint")}
                checked={hideOwnValue}
                onChange={handleHideOwn}
              />
              <FormError message={hideOwnError} />
            </div>
          )}

          {/* Feedback */}
          {feedbackEnabled && <FeedbackButton variant="menu" />}

          {/* Sign out */}
          <button
            className="w-full flex items-center px-5 py-4 hover:bg-surface-raised transition text-left"
            onClick={() => { if (window.confirm(t("signOutConfirm"))) signOut({ callbackUrl: "/login" }); }}
          >
            <span className="text-sm text-warn font-medium">{t("signOut")}</span>
          </button>

        </div>
      </Card>

      <Divider />

      {/* App section */}
      <Card padding="none">
        <p className="px-5 pt-4 pb-1 text-[10px] font-semibold text-foreground-faint uppercase tracking-widest">
          {t("app")}
        </p>
        <div className="divide-y divide-border-subtle">
          <PushManager />
          <Divider />
          <PasskeyManager />
          <div className="flex items-center justify-between px-5 py-4">
            <span className="text-sm text-foreground">{t("version")}</span>
            <span className="text-sm text-foreground-faint font-mono">{version}</span>
          </div>
          <div className="flex items-center justify-between px-5 py-4">
            <span className="text-sm text-foreground">{t("buildDate")}</span>
            <span className="text-sm text-foreground-faint">{buildDate ?? t("buildDateLocal")}</span>
          </div>
        </div>
      </Card>

    </main>
  );
}
