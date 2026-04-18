"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Bug, Lightbulb, HelpCircle, Heart, Send } from "lucide-react";
import Sheet from "./Sheet";
import Textarea from "./Textarea";
import Input from "./Input";
import Button from "./Button";
import FormError from "./FormError";
import Checkbox from "./Checkbox";

type FeedbackType = "BUG" | "IDEA" | "QUESTION" | "THANKS";

function detectPlatform(): "web" | "ios" | "android" {
  if (typeof window === "undefined") return "web";
  const cap = (window as { Capacitor?: { getPlatform?: () => string } }).Capacitor;
  const p = cap?.getPlatform?.();
  if (p === "ios") return "ios";
  if (p === "android") return "android";
  return "web";
}

export default function FeedbackSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations("feedback");
  const tc = useTranslations("common");
  const pathname = usePathname();
  const locale = useLocale();

  const [type, setType] = useState<FeedbackType>("BUG");
  const [message, setMessage] = useState("");
  const [includeContact, setIncludeContact] = useState(false);
  const [contactEmail, setContactEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  // Reset form whenever the sheet is re-opened after a successful submission
  useEffect(() => {
    if (open) {
      setSuccess(false);
      setError("");
    }
  }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim()) { setError(t("messageRequired")); return; }
    if (includeContact && !contactEmail.trim()) { setError(t("emailRequired")); return; }
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          message: message.trim(),
          contactEmail: includeContact ? contactEmail.trim() : null,
          currentUrl: pathname,
          platform: detectPlatform(),
          clientLocale: locale,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || tc("networkError"));
      } else {
        setSuccess(true);
        setMessage("");
        setIncludeContact(false);
        setContactEmail("");
      }
    } catch {
      setError(tc("networkError"));
    } finally {
      setSaving(false);
    }
  }

  const types: { value: FeedbackType; icon: typeof Bug; label: string; color: string }[] = [
    { value: "BUG", icon: Bug, label: t("typeBug"), color: "text-red-500" },
    { value: "IDEA", icon: Lightbulb, label: t("typeIdea"), color: "text-amber-500" },
    { value: "QUESTION", icon: HelpCircle, label: t("typeQuestion"), color: "text-blue-500" },
    { value: "THANKS", icon: Heart, label: t("typeThanks"), color: "text-pink-500" },
  ];

  return (
    <Sheet open={open} onClose={onClose} title={t("title")}>
      {success ? (
        <div className="flex flex-col gap-4 py-6 text-center">
          <p className="text-3xl">✅</p>
          <p className="text-base font-semibold text-foreground">{t("thankYou")}</p>
          <p className="text-sm text-foreground-muted">{t("thankYouSubtitle")}</p>
          <Button variant="primary" fullWidth onClick={onClose}>{tc("close")}</Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Type picker */}
          <div className="grid grid-cols-2 gap-2">
            {types.map(({ value, icon: Icon, label, color }) => (
              <button
                key={value}
                type="button"
                onClick={() => setType(value)}
                className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm transition ${
                  type === value
                    ? "border-foreground bg-surface-raised text-foreground font-medium"
                    : "border-border bg-surface text-foreground-muted hover:bg-surface-raised"
                }`}
              >
                <Icon size={16} className={color} />
                {label}
              </button>
            ))}
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

          <Checkbox
            label={t("includeContactLabel")}
            checked={includeContact}
            onChange={(e) => setIncludeContact(e.target.checked)}
          />
          {includeContact && (
            <Input
              label={t("emailLabel")}
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              placeholder="dein@email.ch"
              required
            />
          )}

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
    </Sheet>
  );
}
