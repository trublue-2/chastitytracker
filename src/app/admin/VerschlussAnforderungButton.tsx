"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import { useTranslations } from "next-intl";
import ActionModal from "@/app/components/ActionModal";
import FormError from "@/app/components/FormError";
import Button from "@/app/components/Button";
import Input from "@/app/components/Input";
import Textarea from "@/app/components/Textarea";

interface Props {
  userId: string;
  hasEmail: boolean;
  isLocked: boolean;
  hasOffeneAnforderung: boolean;
  hasActiveSperrzeit: boolean;
}

export default function VerschlussAnforderungButton({
  userId, hasEmail, isLocked, hasOffeneAnforderung, hasActiveSperrzeit,
}: Props) {
  const t = useTranslations("admin");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [nachricht, setNachricht] = useState("");
  const [deadlineH, setDeadlineH] = useState(isLocked ? "24" : "4");
  const [withMinDauer, setWithMinDauer] = useState(false);
  const [minDauerH, setMinDauerH] = useState("24");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const art = isLocked ? "SPERRZEIT" : "ANFORDERUNG";
  const isAnforderung = art === "ANFORDERUNG";
  const label = isAnforderung ? t("requestLock") : t("setLockDuration");
  const accentColor = isAnforderung ? "var(--color-request)" : "var(--color-sperrzeit)";
  const accentBg = isAnforderung ? "var(--color-request-bg)" : "var(--color-sperrzeit-bg)";

  if (isAnforderung && (isLocked || !hasEmail || hasOffeneAnforderung)) return null;
  if (!isAnforderung && (!isLocked || hasActiveSperrzeit)) return null;

  function reset() {
    setOpen(false); setError(""); setNachricht(""); setDeadlineH(isLocked ? "24" : "4"); setWithMinDauer(false); setMinDauerH("24");
  }

  async function handleSubmit() {
    setSaving(true);
    setError("");
    try {
      const payload: Record<string, unknown> = {
        userId, art,
        nachricht: nachricht.trim() || undefined,
        fristH: parseFloat(deadlineH) || (isAnforderung ? 4 : 24),
      };
      if (isAnforderung && withMinDauer) {
        payload.dauerH = parseFloat(minDauerH) || 24;
      }

      const res = await fetch("/api/admin/verschluss-anforderung", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      setSaving(false);
      if (res.ok) { reset(); router.refresh(); }
      else setError(data.error || t("kontrolleTitle"));
    } catch {
      setSaving(false);
      setError(t("kontrolleTitle"));
    }
  }

  const btnBase = isAnforderung
    ? "text-[var(--color-request)] border-[var(--color-request-border)] bg-[var(--color-request-bg)] hover:opacity-80"
    : "text-[var(--color-sperrzeit)] border-[var(--color-sperrzeit-border)] bg-[var(--color-sperrzeit-bg)] hover:opacity-80";

  return (
    <>
      <button
        onClick={() => { setOpen(true); setError(""); }}
        className={`flex items-center gap-1.5 text-xs font-medium border rounded-lg px-2.5 py-2 transition ${btnBase}`}
      >
        <Lock size={11} />
        {label}
      </button>

      <ActionModal
        open={open}
        onClose={reset}
        title={label}
        icon={<Lock size={20} strokeWidth={2} style={{ color: accentColor }} />}
        iconBg={accentBg}
      >
        <Textarea
          label={t("messageLabel")}
          value={nachricht}
          onChange={(e) => setNachricht(e.target.value)}
          placeholder={t("messageLabel")}
          rows={2}
        />

        <div className="flex items-center gap-2">
          <label className="text-xs text-foreground-faint whitespace-nowrap">{t("kontrolleHours")}</label>
          <div className="w-24">
            <Input
              type="number"
              value={deadlineH}
              onChange={(e) => setDeadlineH(e.target.value)}
              min={0.5}
              step={0.5}
            />
          </div>
          <span className="text-xs text-foreground-faint">h</span>
        </div>

        {isAnforderung && (
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={withMinDauer} onChange={(e) => setWithMinDauer(e.target.checked)}
                className="accent-[var(--color-request)] w-4 h-4" />
              <span className="text-xs text-foreground-faint">{t("minDurationLabel")}</span>
            </label>
            {withMinDauer && (
              <div className="flex flex-col gap-1.5 pl-6">
                <div className="flex items-center gap-2">
                  <div className="w-24">
                    <Input
                      type="number"
                      value={minDauerH}
                      onChange={(e) => setMinDauerH(e.target.value)}
                      min={1}
                      step={1}
                    />
                  </div>
                  <span className="text-xs text-foreground-faint">h</span>
                </div>
                <span className="text-xs text-foreground-faint">{t("minDurationHint")}</span>
              </div>
            )}
          </div>
        )}

        <FormError message={error} variant="compact" />

        <Button
          variant="semantic"
          semantic={isAnforderung ? "request" : "sperrzeit"}
          fullWidth
          loading={saving}
          icon={<Lock size={16} />}
          onClick={handleSubmit}
        >
          {t("submit")}
        </Button>
      </ActionModal>
    </>
  );
}
