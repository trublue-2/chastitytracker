"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import { useTranslations, useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { User, ChevronRight } from "lucide-react";
import { setLocaleCookie } from "@/lib/locale";
import Card from "@/app/components/Card";
import Input from "@/app/components/Input";
import Select from "@/app/components/Select";
import Toggle from "@/app/components/Toggle";
import Button from "@/app/components/Button";
import FormError from "@/app/components/FormError";
import Divider from "@/app/components/Divider";
import PushManager from "@/app/components/PushManager";

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
  const router = useRouter();

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

  function setLocale(value: string) {
    setLocaleCookie(value);
    router.refresh();
  }

  const [expandPassword, setExpandPassword] = useState(false);
  const [expandEmail, setExpandEmail] = useState(false);
  const [expandLanguage, setExpandLanguage] = useState(false);

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

  // Email
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

  const langOptions = [
    { value: "de", label: "Deutsch" },
    { value: "en", label: "English" },
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
          <div>
            <button
              className="w-full flex items-center justify-between px-5 py-4 hover:bg-surface-raised transition text-left"
              onClick={() => { setExpandPassword(!expandPassword); setExpandEmail(false); setExpandLanguage(false); }}
            >
              <span className="text-sm text-foreground">{t("changePassword")}</span>
              <ChevronRight
                size={16}
                className={`text-foreground-faint transition-transform duration-200 ${expandPassword ? "rotate-90" : ""}`}
              />
            </button>
            {expandPassword && (
              <div className="px-5 pb-5">
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
              </div>
            )}
          </div>

          {/* Email change */}
          <div>
            <button
              className="w-full flex items-center justify-between px-5 py-4 hover:bg-surface-raised transition text-left"
              onClick={() => { setExpandEmail(!expandEmail); setExpandPassword(false); setExpandLanguage(false); }}
            >
              <span className="text-sm text-foreground">{t("changeEmail")}</span>
              <ChevronRight
                size={16}
                className={`text-foreground-faint transition-transform duration-200 ${expandEmail ? "rotate-90" : ""}`}
              />
            </button>
            {expandEmail && (
              <div className="px-5 pb-5">
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
              </div>
            )}
          </div>

          {/* Language */}
          <div>
            <button
              className="w-full flex items-center justify-between px-5 py-4 hover:bg-surface-raised transition text-left"
              onClick={() => { setExpandLanguage(!expandLanguage); setExpandPassword(false); setExpandEmail(false); }}
            >
              <span className="text-sm text-foreground">{t("language")}</span>
              <ChevronRight
                size={16}
                className={`text-foreground-faint transition-transform duration-200 ${expandLanguage ? "rotate-90" : ""}`}
              />
            </button>
            {expandLanguage && (
              <div className="px-5 pb-5">
                <Select
                  value={locale}
                  onChange={(e) => setLocale(e.target.value)}
                  options={langOptions}
                />
              </div>
            )}
          </div>

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
