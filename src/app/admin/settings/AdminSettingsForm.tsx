"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { User, ChevronRight } from "lucide-react";
import Card from "@/app/components/Card";
import Input from "@/app/components/Input";
import Button from "@/app/components/Button";
import FormError from "@/app/components/FormError";
import Divider from "@/app/components/Divider";
import PushManager from "@/app/components/PushManager";

interface Props {
  userId: string;
  username: string;
  email: string | null;
  version: string;
  buildDate?: string;
}

export default function AdminSettingsForm({ userId, username, email, version, buildDate }: Props) {
  const t = useTranslations("settings");
  const ta = useTranslations("admin");
  const tc = useTranslations("common");
  const router = useRouter();

  const [expandPassword, setExpandPassword] = useState(false);
  const [expandEmail, setExpandEmail] = useState(false);

  // Password
  const [password, setPassword] = useState("");
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwSuccess, setPwSuccess] = useState(false);
  const [pwSaving, setPwSaving] = useState(false);

  async function handlePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwError(null);
    setPwSaving(true);
    const res = await fetch(`/api/admin/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    setPwSaving(false);
    if (res.ok) {
      setPwSuccess(true);
      setPassword("");
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
    const res = await fetch(`/api/admin/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: emailValue }),
    });
    setEmailSaving(false);
    if (res.ok) {
      setEmailSuccess(true);
      router.refresh();
    } else {
      setEmailError(tc("error"));
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
        <span className="text-xs font-semibold text-foreground-faint bg-surface-raised px-2 py-0.5 rounded-full">{ta("roleAdmin")}</span>
      </div>

      {/* Account section */}
      <Card padding="none">
        <p className="px-5 pt-4 pb-1 text-[10px] font-semibold text-foreground-faint uppercase tracking-widest">
          {t("account")}
        </p>
        <div className="divide-y divide-border-subtle">

          {/* Password */}
          <div>
            <button
              className="w-full flex items-center justify-between px-5 py-4 hover:bg-surface-raised transition text-left"
              onClick={() => { setExpandPassword(!expandPassword); setExpandEmail(false); }}
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
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={8}
                      autoComplete="new-password"
                    />
                    <FormError message={pwError} />
                    <Button type="submit" variant="primary" fullWidth loading={pwSaving}>
                      {tc("save")}
                    </Button>
                  </form>
                )}
              </div>
            )}
          </div>

          {/* Email */}
          <div>
            <button
              className="w-full flex items-center justify-between px-5 py-4 hover:bg-surface-raised transition text-left"
              onClick={() => { setExpandEmail(!expandEmail); setExpandPassword(false); }}
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
                      placeholder="admin@example.com"
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

      {/* Notifications */}
      <Card padding="none">
        <p className="px-5 pt-4 pb-1 text-[10px] font-semibold text-foreground-faint uppercase tracking-widest">
          {ta("notificationsTitle")}
        </p>
        <div className="divide-y divide-border-subtle">
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
