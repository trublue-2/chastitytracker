"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import { useTranslations, useLocale } from "next-intl";
import { User } from "lucide-react";
import Card from "@/app/components/Card";
import Input from "@/app/components/Input";
import Select from "@/app/components/Select";
import Toggle from "@/app/components/Toggle";
import Button from "@/app/components/Button";
import FormError from "@/app/components/FormError";
import Divider from "@/app/components/Divider";
import ExpandRow from "@/app/components/ExpandRow";
import PushManager from "@/app/components/PushManager";
import PasskeyManager from "@/app/components/PasskeyManager";
import ThemeToggle from "@/app/components/ThemeToggle";
import { useLocaleSwitcher } from "@/app/hooks/useLocaleSwitcher";
import { LOCALES_LONG } from "@/lib/constants";

interface SettingsFormProps {
  username: string;
  email: string | null;
  version: string;
  buildDate?: string;
  mobileDesktopUpload?: boolean;
}

export default function SettingsForm({ username, email, version, buildDate, mobileDesktopUpload: initialMobileDesktopUpload = false }: SettingsFormProps) {
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const locale = useLocale();
  const switchLocale = useLocaleSwitcher();

  const [mobileDesktopUpload, setMobileDesktopUpload] = useState(initialMobileDesktopUpload);
  const [uploadSaving, setUploadSaving] = useState(false);

  async function handleMobileDesktopUpload(value: boolean) {
    const previous = mobileDesktopUpload;
    setMobileDesktopUpload(value);
    setUploadSaving(true);
    try {
      const res = await fetch("/api/settings/upload", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mobileDesktopUpload: value }),
      });
      if (!res.ok) setMobileDesktopUpload(previous);
    } catch {
      setMobileDesktopUpload(previous);
    }
    setUploadSaving(false);
  }

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
      setPwError(data.error ?? tc("error"));
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
      setEmailError(data.error ?? tc("error"));
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
          <div className="px-5 py-4">
            <Toggle
              label={t("mobileUploadTitle")}
              description={t("mobileUploadDesc")}
              checked={mobileDesktopUpload}
              disabled={uploadSaving}
              onChange={(checked) => handleMobileDesktopUpload(checked)}
            />
          </div>
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
