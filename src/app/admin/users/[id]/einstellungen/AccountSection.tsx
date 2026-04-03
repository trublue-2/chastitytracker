"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronRight } from "lucide-react";
import Card from "@/app/components/Card";
import Input from "@/app/components/Input";
import Button from "@/app/components/Button";
import FormError from "@/app/components/FormError";

interface Props {
  userId: string;
  username: string;
  email: string | null;
  role: string;
  isSelf: boolean;
}

export default function AccountSection({ userId, username, email, role, isSelf }: Props) {
  const t = useTranslations("admin");
  const ts = useTranslations("settings");
  const tc = useTranslations("common");

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
    } else {
      setEmailError(tc("error"));
    }
  }

  return (
    <Card padding="none" className="overflow-hidden">
      <div className="px-5 py-3 border-b border-border-subtle">
        <p className="text-xs font-semibold uppercase tracking-wider text-foreground-faint">{t("sectionAccount")}</p>
      </div>
      <div className="divide-y divide-border-subtle">

        {/* Username (read-only) */}
        <div className="flex items-center justify-between px-5 py-4">
          <div>
            <p className="text-sm font-medium text-foreground">{t("usernameLabel")}</p>
            <p className="text-xs text-foreground-faint font-mono mt-0.5">{username}</p>
          </div>
        </div>

        {/* Email */}
        <div>
          <button
            className="w-full flex items-center justify-between px-5 py-4 hover:bg-surface-raised transition text-left"
            onClick={() => { setExpandEmail(!expandEmail); setExpandPassword(false); }}
          >
            <div>
              <span className="text-sm text-foreground">{ts("changeEmail")}</span>
              {email && <p className="text-xs text-foreground-faint mt-0.5">{email}</p>}
              {!email && <p className="text-xs text-foreground-faint mt-0.5 italic">{t("noEmail")}</p>}
            </div>
            <ChevronRight
              size={16}
              className={`text-foreground-faint transition-transform duration-200 ${expandEmail ? "rotate-90" : ""}`}
            />
          </button>
          {expandEmail && (
            <div className="px-5 pb-5">
              {emailSuccess ? (
                <p className="text-sm text-ok-text bg-ok-bg border border-ok-border rounded-xl px-4 py-3">{ts("emailSaved")}</p>
              ) : (
                <form onSubmit={handleEmail} className="flex flex-col gap-4">
                  <Input
                    label={ts("emailLabel")}
                    type="email"
                    value={emailValue}
                    onChange={(e) => setEmailValue(e.target.value)}
                    placeholder="user@example.com"
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

        {/* Password */}
        <div>
          <button
            className="w-full flex items-center justify-between px-5 py-4 hover:bg-surface-raised transition text-left"
            onClick={() => { setExpandPassword(!expandPassword); setExpandEmail(false); }}
          >
            <span className="text-sm text-foreground">{ts("changePassword")}</span>
            <ChevronRight
              size={16}
              className={`text-foreground-faint transition-transform duration-200 ${expandPassword ? "rotate-90" : ""}`}
            />
          </button>
          {expandPassword && (
            <div className="px-5 pb-5">
              {pwSuccess ? (
                <p className="text-sm text-ok-text bg-ok-bg border border-ok-border rounded-xl px-4 py-3">{ts("passwordChanged")}</p>
              ) : (
                <form onSubmit={handlePassword} className="flex flex-col gap-4">
                  <Input
                    label={ts("newPassword")}
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

      </div>
    </Card>
  );
}
