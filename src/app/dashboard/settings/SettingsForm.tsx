"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { useTranslations } from "next-intl";
import { KeyRound, User } from "lucide-react";
import Section from "@/app/components/Section";
import Input from "@/app/components/Input";
import Select from "@/app/components/Select";
import Button from "@/app/components/Button";
import FormError from "@/app/components/FormError";
import FormSuccess from "@/app/components/FormSuccess";
import ExpandRow from "@/app/components/ExpandRow";
import Toggle from "@/app/components/Toggle";
import PushManager from "@/app/components/PushManager";
import PasskeyManager from "@/app/components/PasskeyManager";
import FeedbackButton from "@/app/components/FeedbackButton";
import { useLocaleSwitcher } from "@/app/hooks/useLocaleSwitcher";
import { LOCALES_LONG } from "@/lib/constants";
import { TIMEZONE_OPTIONS } from "@/lib/timezones";
import { useApiError } from "@/app/hooks/useApiError";
import { parseApiErrorCode } from "@/lib/apiClient";
import ConfirmDialog from "@/app/components/ConfirmDialog";
import WeightSettings from "./WeightSettings";
import type { SettingsFormProps } from "./getSettingsProps";
import { formColCls } from "@/app/components/inputStyles";

export default function SettingsForm({ username, email, locale, timezone, startPage, showStartPage, controlledSubs, isAdmin, hideOwnTracker, messageNotify, version, buildDate, feedbackEnabled = true, weight }: SettingsFormProps) {
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const ta = useTranslations("admin");
  const tm = useTranslations("messages");
  const apiError = useApiError();
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

  /**
   * Der ZWEITE Weg zu demselben Strafbuch-Eintrag.
   *
   * `/api/settings/password` ruft dieselbe `recordAdminPasswordChange` wie der Admin-Bereich, und
   * die schreibt, wenn das ZIEL ein Admin-Konto ist — hier also, sobald die Keyholderin ihr eigenes
   * Passwort ändert. Die Zeilen landen in fremden Akten, nicht in ihrer eigenen. Ohne Hinweis und
   * Rückfrage passierte das an dieser Stelle still, während der Admin-Bereich für exakt denselben
   * Vorgang beides zeigt. Text und Vorbehalt kommen aus dem `admin`-Namensraum — es ist dieselbe
   * Aussage, und eine zweite Fassung liefe irgendwann auseinander.
   */
  const passwordMayBeRecorded = isAdmin;
  const [pwConfirm, setPwConfirm] = useState(false);

  function handlePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwError(null);
    if (next !== confirm) { setPwError(t("passwordMismatch")); return; }
    if (passwordMayBeRecorded) { setPwConfirm(true); return; }
    void submitPassword();
  }

  async function submitPassword() {
    setPwError(null);
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

  const [messageNotifyValue, setMessageNotifyValue] = useState(messageNotify);
  const [messageNotifyError, setMessageNotifyError] = useState<string | null>(null);

  async function handleMessageNotify(checked: boolean) {
    setMessageNotifyValue(checked);
    setMessageNotifyError(null);
    try {
      const res = await fetch("/api/settings/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        // Ein Schalter für beide Kanäle: wer den Posteingang hat, will Mail UND Push gemeinsam
        // stummschalten — getrennte Schalter wären hier nur Ballast.
        body: JSON.stringify({ eventType: "MESSAGE_RECEIVED", mail: checked, push: checked }),
      });
      if (!res.ok) {
        setMessageNotifyValue(!checked); // Rollback bei Fehler
        setMessageNotifyError(apiError(await parseApiErrorCode(res)));
      }
    } catch {
      setMessageNotifyValue(!checked);
      setMessageNotifyError(tc("error"));
    }
  }

  const startPageOptions = [
    { value: "auto", label: t("startPageAuto") },
    { value: "overview", label: t("startPageOverview") },
    // Benutzerverwaltung als Startseite nur für globale Admins — die Seite ist admin-only.
    ...(isAdmin ? [{ value: "users", label: t("startPageUsers") }] : []),
    // Direkt auf die Detailseite eines bestimmten Subs landen.
    ...controlledSubs.map((s) => ({ value: s.id, label: t("startPageSub", { name: s.username }) })),
    // "Eigener Tracker" entfällt bei "kein eigener Tracker" — dieser Nutzer hat keinen grünen Bereich.
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
        // "Eigener Tracker" als Startseite ergibt ohne grünen Bereich keinen Sinn und verschwindet aus
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

  // `formColCls`: dieselbe Maske trägt `/dashboard/settings` UND `/admin/settings`. Im
  // Träger-Bereich ist die Verengung wirkungslos (die Spalte hat schon das Lesemass), im
  // Keyholder-Bereich, der auf `wideColCls` steht, greift sie. Eine geteilte Komponente kann sich
  // nicht darauf verlassen, in welcher Spalte sie landet.
  return (
    <main className={`${formColCls} flex-1 py-6 flex flex-col gap-4`}>
      {/* Ebene 1 dieser Seite, bewusst UNSICHTBAR: die Maske hatte bisher gar keine Überschrift,
          ihre Abschnitte begannen also auf Ebene 2 und die Gliederung hatte keine Wurzel — wer per
          Überschriften springt, erfuhr nicht, auf welchem Bildschirm er gelandet ist. Sichtbar
          gehört sie nicht her: der Entwurf lässt die Maske mit dem Konto beginnen, nicht mit einem
          Etikett. Die Maske trägt `/dashboard/settings` UND `/admin/settings` — deshalb ein
          neutraler Titel, der für beide stimmt. */}
      <h1 className="sr-only">{t("title")}</h1>

      {/* Avatar / User Info */}
      <div className="flex flex-col items-center gap-2 pt-4 pb-2">
        <div className="w-16 h-16 rounded-full bg-surface-raised border border-border flex items-center justify-center">
          <User size={28} className="text-foreground-faint" />
        </div>
        <p className="text-sm font-semibold text-foreground">{username}</p>
        {email && <p className="text-xs text-foreground-faint">{email}</p>}
      </div>

      {/* Account section — ohne Kasten: die Rubrik und die Haarlinien zwischen den Zeilen
          gliedern schon. Der Rahmen darum trennte die Liste von nichts. */}
      <Section title={t("account")}>
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
                  hint={passwordMayBeRecorded ? ta("passwordChangeOffenseHint") : undefined}
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

          {/* HIER stand die Design-Einstellung: hell/dunkel je Bereich und der Farbton der App.
              Beides ist entfallen, nicht verschoben. Die Farbwelt ist ab v6 keine Vorliebe mehr,
              sondern eine Ansage — dunkel, und der Ton sagt, ob verschlossen ist. Eine Einstellung
              daneben hiesse, man könne die Aussage abschalten. */}

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
            <FormSuccess message={tzSuccess ? t("saved") : null} variant="inline" />
            <FormError message={tzError} />
          </ExpandRow>

          {/* Gewicht — nur wenn die Keyholderin es freigeschaltet hat (und die Instanz es führt) */}
          {weight && (
            <ExpandRow
              label={t("weightSection")}
              open={expanded === "weight"}
              onToggle={() => toggle("weight")}
            >
              <WeightSettings {...weight} />
            </ExpandRow>
          )}

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
              <FormSuccess message={startPageSuccess ? t("saved") : null} variant="inline" />
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

          {/* Mail/Push bei neuen Nachrichten. Die Nachricht selbst wird immer geschrieben — dieser
              Schalter macht den Kanal leiser, ohne dass Information verloren geht. */}
          <div className="px-5 py-2">
            <Toggle
              label={tm("notifyLabel")}
              description={tm("notifyHint")}
              checked={messageNotifyValue}
              onChange={handleMessageNotify}
            />
            <FormError message={messageNotifyError} />
          </div>

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
      </Section>

      {/* App section */}
      <Section title={t("app")}>
        <div className="divide-y divide-border-subtle">
          <PushManager />
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
      </Section>

      {/* KEIN `danger` und vor dem Abruf schliessen — dieselbe Begründung wie im Admin-Bereich:
          das Passwort zu setzen ist erlaubt, gewarnt wird vor der Nebenwirkung, und die Fehlerzeile
          steht unmittelbar unter dem Feld. */}
      <ConfirmDialog
        open={pwConfirm}
        title={t("changePassword")}
        message={ta("passwordChangeConfirmText")}
        confirmLabel={t("saveBtn")}
        icon={<KeyRound size={20} style={{ color: "var(--color-warn)" }} />}
        onConfirm={() => { setPwConfirm(false); void submitPassword(); }}
        onCancel={() => setPwConfirm(false)}
      />
    </main>
  );
}
