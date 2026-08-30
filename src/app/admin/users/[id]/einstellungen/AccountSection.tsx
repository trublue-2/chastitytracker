"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronRight } from "lucide-react";
import SettingsSection from "@/app/components/SettingsSection";
import Input from "@/app/components/Input";
import Button from "@/app/components/Button";
import FormError from "@/app/components/FormError";
import PasswordChangeConfirm from "@/app/components/PasswordChangeConfirm";
import { useApiError } from "@/app/hooks/useApiError";

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
  const apiError = useApiError();

  const [expandPassword, setExpandPassword] = useState(false);
  const [expandEmail, setExpandEmail] = useState(false);

  // Password
  const [password, setPassword] = useState("");
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwSuccess, setPwSuccess] = useState(false);
  const [pwSaving, setPwSaving] = useState(false);
  /**
   * Hinweis am Feld UND Rückfrage — beides, und das ist eine Entscheidung, keine Vorsicht auf Vorrat.
   *
   * Der Hinweis allein reicht nicht. Ein Dialog, der eine Überraschung bestätigt, ist immer noch
   * eine Überraschung — deshalb steht der Satz VOR dem Tippen am Feld. Aber ein Satz unter einem
   * Passwortfeld wird beim Ausfüllen überlesen, und die Folge trifft hier nicht den Handelnden: sie
   * trägt sich in die Akte eines ANDEREN ein, der davon nichts mitbekommt. Genau dafür ist die
   * Rückfrage da — sie ist der Moment, in dem die Keyholderin sich fragt, ob gerade eine Sperrzeit
   * läuft, was ihr sonst niemand sagt.
   *
   * Die Regel dahinter, für die nächste Handlung dieser Art: **eine Rückfrage gehört dorthin, wo
   * eine Handlung für einen ANDEREN Folgen hat — nicht nur dorthin, wo Daten verschwinden.** Dieses
   * Formular war das reinste Beispiel für die umgekehrte Anwendung: der Löschen-Knopf desselben
   * Bereichs fragte nach, das Passwortfeld sagte kein Wort.
   *
   * Die E-Mail-Änderung daneben bleibt bewusst ohne beides: sie erzeugt keinen Eintrag.
   */
  const [pwConfirm, setPwConfirm] = useState(false);

  /**
   * Kann dieser Passwortwechsel einen Strafbuch-Eintrag auslösen?
   *
   * `recordAdminPasswordChange` schreibt nur, wenn das ZIEL ein Admin-Konto ist — und dann eine
   * Zeile je Träger, für den gerade eine Sperrzeit läuft. Der Eintrag landet also in fremden Akten,
   * nicht in der des Kontos, dessen Passwort hier steht.
   *
   * Die zweite Bedingung (läuft überhaupt eine Sperrzeit?) kann diese Seite nicht beantworten: sie
   * gilt für ALLE Träger der Instanz, nicht nur für den, dessen Einstellungen offen sind. Genau
   * deshalb steht sie im Text als Vorbehalt und nicht als Bedingung im Code — behauptet würde sonst
   * mehr, als hier zu wissen ist. Bei einem gewöhnlichen Konto entsteht nie ein Eintrag; dort wäre
   * jeder Hinweis eine Warnung vor nichts.
   */
  const passwordMayBeRecorded = role === "admin";

  /** Setzt das Passwort — aufgerufen entweder direkt oder aus der Rückfrage. */
  async function submitPassword() {
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
      setPwError(apiError(data.error));
    }
  }

  function handlePassword(e: React.FormEvent) {
    e.preventDefault();
    if (passwordMayBeRecorded) {
      setPwConfirm(true);
      return;
    }
    void submitPassword();
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
      const data = await res.json();
      setEmailError(apiError(data.error));
    }
  }

  return (
    <SettingsSection title={t("sectionAccount")} description={t("sectionAccountDesc")}>
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
                    // Der Hinweis gehört ans FELD und nicht nur in die Rückfrage: er soll gelesen
                    // werden, bevor jemand ein Passwort tippt, nicht erst, wenn es dasteht.
                    hint={passwordMayBeRecorded ? t("passwordChangeOffenseHint") : undefined}
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

      {/* KEIN `danger`: das Passwort zu setzen ist erlaubt und oft nötig — Rot wäre eine Warnung vor
          einer gültigen Handlung. Gewarnt wird vor der NEBENWIRKUNG, und die steht im Text.

          Vor dem Abruf schliessen, nicht danach: die Fehlerzeile (`FormError`) steht unmittelbar
          unter dem Feld, also dort, wo der Nutzer nach dem Schliessen ohnehin hinsieht — und
          `ConfirmDialog` hat keinen Platz für sie. */}
      <PasswordChangeConfirm
        open={pwConfirm}
        confirmLabel={tc("save")}
        onConfirm={() => { setPwConfirm(false); void submitPassword(); }}
        onCancel={() => setPwConfirm(false)}
      />
    </SettingsSection>
  );
}
