"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Bug, Lightbulb, HelpCircle, Heart, Send, MessageSquareText } from "lucide-react";
import ActionModal from "./ActionModal";
import Textarea from "./Textarea";
import Input from "./Input";
import Button from "./Button";
import FormError from "./FormError";
import { parseApiError } from "@/lib/apiClient";
import { isValidEmail } from "@/lib/constants";

type FeedbackType = "BUG" | "IDEA" | "QUESTION" | "THANKS";

function detectPlatform(): "web" | "ios" | "android" {
  if (typeof window === "undefined") return "web";
  const cap = (window as { Capacitor?: { getPlatform?: () => string } }).Capacitor;
  const p = cap?.getPlatform?.();
  if (p === "ios") return "ios";
  if (p === "android") return "android";
  return "web";
}

/**
 * Each type uses one of the existing semantic CSS tokens so the picker
 * feels like the rest of the app (admin "Aktionen" row style).
 */
const TYPE_CONFIG: Record<FeedbackType, { icon: typeof Bug; bgVar: string; colorVar: string; labelKey: string }> = {
  BUG:      { icon: Bug,         bgVar: "var(--color-warn-bg)",     colorVar: "var(--color-warn)",     labelKey: "typeBug" },
  IDEA:     { icon: Lightbulb,   bgVar: "var(--color-inspect-bg)",  colorVar: "var(--color-inspect)",  labelKey: "typeIdea" },
  QUESTION: { icon: HelpCircle,  bgVar: "var(--color-request-bg)",  colorVar: "var(--color-request)",  labelKey: "typeQuestion" },
  THANKS:   { icon: Heart,       bgVar: "var(--color-orgasm-bg)",   colorVar: "var(--color-orgasm)",   labelKey: "typeThanks" },
};

export default function FeedbackSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations("feedback");
  const tc = useTranslations("common");
  const pathname = usePathname();
  const locale = useLocale();

  const [type, setType] = useState<FeedbackType>("BUG");
  const [message, setMessage] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const prefilled = useRef(false);

  useEffect(() => {
    if (!open) return;
    setSuccess(false);
    setError("");
    // Die Konto-Adresse als Vorbelegung holen — erst beim Öffnen, damit sie nicht auf jeder Seite
    // mitgeladen wird. Bleibt sie aus (kein Konto-Eintrag, Request fehlgeschlagen), tippt der Nutzer
    // selbst; das Feld ist Pflicht, nicht die hinterlegte Adresse.
    //
    // Nur EINMAL vorbelegen: wer das Feld bewusst leert oder überschreibt und den Dialog zwischendurch
    // schliesst, bekäme sonst beim nächsten Öffnen wieder die Konto-Adresse eingesetzt.
    if (prefilled.current) return;
    let cancelled = false;
    fetch("/api/settings/email")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data?.email) return;
        prefilled.current = true;
        setContactEmail((current) => current || data.email);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim()) { setError(t("messageRequired")); return; }
    if (!contactEmail.trim()) { setError(t("emailRequired")); return; }
    if (!isValidEmail(contactEmail.trim())) { setError(t("emailInvalid")); return; }
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          message: message.trim(),
          contactEmail: contactEmail.trim(),
          currentUrl: pathname,
          platform: detectPlatform(),
          clientLocale: locale,
        }),
      });
      if (!res.ok) {
        setError(await parseApiError(res, tc("networkError")));
      } else {
        setSuccess(true);
        setMessage("");
      }
    } catch {
      setError(tc("networkError"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <ActionModal
      open={open}
      onClose={onClose}
      title={t("title")}
      icon={<MessageSquareText size={20} strokeWidth={2} style={{ color: "var(--color-request)" }} />}
      iconBg="var(--color-request-bg)"
    >
      {success ? (
        <div className="flex flex-col gap-4 py-6 text-center">
          <p className="text-3xl">✅</p>
          <p className="text-base font-semibold text-foreground">{t("thankYou")}</p>
          <p className="text-sm text-foreground-muted">{t("thankYouSubtitle")}</p>
          <Button variant="primary" fullWidth onClick={onClose}>{tc("close")}</Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(TYPE_CONFIG) as FeedbackType[]).map((value) => {
              const cfg = TYPE_CONFIG[value];
              const Icon = cfg.icon;
              const active = type === value;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setType(value)}
                  className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm text-left transition ${
                    active
                      ? "border-foreground bg-surface-raised"
                      : "border-border bg-surface hover:bg-surface-raised"
                  }`}
                >
                  <span className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: cfg.bgVar }}>
                    <Icon size={16} strokeWidth={2} style={{ color: cfg.colorVar }} />
                  </span>
                  <span className={active ? "font-semibold text-foreground" : "text-foreground-muted"}>
                    {t(cfg.labelKey)}
                  </span>
                </button>
              );
            })}
          </div>

          <Textarea
            label={t("messageLabel")}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={5}
            maxLength={2000}
            placeholder={t("messagePlaceholder")}
            required
          />

          <Input
            label={t("emailLabel")}
            type="email"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
            placeholder="dein@email.ch"
            hint={t("emailHint")}
            required
          />

          <div className="text-xs text-foreground-faint bg-surface-raised rounded-lg px-3 py-2.5 leading-relaxed">
            {t.rich("privacyNote", {
              strong: (chunks) => <strong className="text-foreground-muted">{chunks}</strong>,
            })}
          </div>

          <FormError message={error} />

          <Button
            type="submit"
            variant="primary"
            fullWidth
            loading={saving}
            icon={<Send size={16} />}
          >
            {t("submit")}
          </Button>
        </form>
      )}
    </ActionModal>
  );
}
