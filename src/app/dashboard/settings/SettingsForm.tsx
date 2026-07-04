"use client";

import { useState } from "react";
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
import PushManager from "@/app/components/PushManager";
import PasskeyManager from "@/app/components/PasskeyManager";
import ThemeToggle from "@/app/components/ThemeToggle";
import FeedbackButton from "@/app/components/FeedbackButton";
import { useLocaleSwitcher } from "@/app/hooks/useLocaleSwitcher";
import { LOCALES_LONG } from "@/lib/constants";
import { TIMEZONE_OPTIONS } from "@/lib/timezones";
import { useApiError } from "@/app/hooks/useApiError";

interface SettingsFormProps {
  username: string;
  email: string | null;
  timezone: string;
  startPage: string;
  /** Nur Keyholder/Admins sehen die Startseiten-Wahl (nur sie haben eine Übersicht). */
  showStartPage: boolean;
  version: string;
  buildDate?: string;
  feedbackEnabled?: boolean;
}

export default function SettingsForm({ username, email, timezone, startPage, showStartPage, version, buildDate, feedbackEnabled = true }: SettingsFormProps) {
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const apiError = useApiError();
  const locale = useLocale();
  const switchLocale = useLocaleSwitcher();

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

  const startPageOptions = [
    { value: "auto", label: t("startPageAuto") },
    { value: "overview", label: t("startPageOverview") },
    { value: "dashboard", label: t("startPageDashboard") },
  ];

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

          {/* Theme */}
          <ThemeToggle role="user" />

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
                hint={t("startPageHint")}
              />
              {startPageSuccess && <p className="mt-2 text-sm text-ok-text">{t("saved")}</p>}
              <FormError message={startPageError} />
            </ExpandRow>
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
