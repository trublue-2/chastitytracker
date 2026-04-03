"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import { useTranslations } from "next-intl";
import ActionModal from "@/app/components/ActionModal";
import FormField from "@/app/components/FormField";
import FormError from "@/app/components/FormError";
import Input from "@/app/components/Input";
import Spinner from "@/app/components/Spinner";

interface Props {
  userId: string;
  art: "ANFORDERUNG" | "SPERRZEIT";
}

export default function VerschlussAnforderungForm({ userId, art }: Props) {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const router = useRouter();
  const isSperrzeit = art === "SPERRZEIT";
  const accentColor = isSperrzeit ? "var(--color-sperrzeit)" : "var(--color-request)";
  const accentBg = isSperrzeit ? "var(--color-sperrzeit-bg)" : "var(--color-request-bg)";

  const [nachricht, setNachricht] = useState("");
  const [mode, setMode] = useState<"duration" | "datetime">("duration");
  const [deadlineH, setDeadlineH] = useState(isSperrzeit ? "24" : "4");
  const [endetAt, setEndetAt] = useState("");
  const [withMinDauer, setWithMinDauer] = useState(false);
  const [minDauerH, setMinDauerH] = useState("24");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (mode === "datetime" && endetAt && new Date(endetAt) <= new Date()) {
      setError(t("futureDateRequired"));
      return;
    }
    setSaving(true);
    setError("");
    try {
      const payload: Record<string, unknown> = {
        userId, art,
        nachricht: nachricht.trim() || undefined,
      };
      if (mode === "datetime" && endetAt) {
        payload.endetAt = new Date(endetAt).toISOString();
      } else {
        payload.fristH = parseFloat(deadlineH) || (isSperrzeit ? 24 : 4);
      }
      if (!isSperrzeit && withMinDauer) {
        payload.dauerH = parseFloat(minDauerH) || 24;
      }

      const res = await fetch("/api/admin/verschluss-anforderung", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      setSaving(false);
      if (res.ok) {
        router.push(`/admin/users/${userId}/aktionen`);
      } else {
        setError(data.error || tc("error"));
      }
    } catch {
      setSaving(false);
      setError(tc("networkError"));
    }
  }

  const fieldCls = "w-full text-sm bg-surface-raised border border-border rounded-lg px-3 py-2 text-foreground placeholder:text-foreground-faint focus:outline-none focus-visible:outline-2 focus-visible:outline-focus-ring";

  return (
    <ActionModal
      open={true}
      onClose={() => router.push(`/admin/users/${userId}/aktionen`)}
      title={isSperrzeit ? t("setLockDuration") : t("requestLock")}
      icon={<Lock size={20} strokeWidth={2} style={{ color: accentColor }} />}
      iconBg={accentBg}
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <FormField label={t("kontrolleInstruction")}>
          <textarea
            value={nachricht}
            onChange={(e) => setNachricht(e.target.value)}
            placeholder={t("kontrolleInstruction")}
            rows={2}
            className={`${fieldCls} resize-none`}
          />
        </FormField>

        <div className="flex flex-col gap-2">
          <label className="text-xs text-foreground-faint">{t("frist")}</label>
          <div className="flex bg-surface-raised border border-border rounded-xl overflow-hidden">
            <button type="button" onClick={() => setMode("duration")}
              className={`flex-1 py-2 text-sm text-center transition-all ${
                mode === "duration" ? "bg-foreground text-background font-semibold" : "text-foreground-muted hover:bg-border-subtle"
              }`}>
              {t("durationHours")}
            </button>
            <button type="button" onClick={() => setMode("datetime")}
              className={`flex-1 py-2 text-sm text-center transition-all ${
                mode === "datetime" ? "bg-foreground text-background font-semibold" : "text-foreground-muted hover:bg-border-subtle"
              }`}>
              {t("untilDate")}
            </button>
          </div>
        </div>

        {mode === "duration" ? (
          <div className="flex items-center gap-2">
            <div className="w-24">
              <Input type="number" value={deadlineH} onChange={(e) => setDeadlineH(e.target.value)} min={0.5} step={0.5} />
            </div>
            <span className="text-xs text-foreground-faint">h</span>
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            <input type="datetime-local" value={endetAt} onChange={(e) => setEndetAt(e.target.value)}
              min={new Date().toISOString().slice(0, 16)} className={fieldCls} />
            <span className="text-xs text-foreground-faint">
              {isSperrzeit ? t("endetHintSperrzeit") : t("endetHintAnforderung")}
            </span>
          </div>
        )}

        {!isSperrzeit && (
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
                    <Input type="number" value={minDauerH} onChange={(e) => setMinDauerH(e.target.value)} min={1} step={1} />
                  </div>
                  <span className="text-xs text-foreground-faint">h</span>
                </div>
                <span className="text-xs text-foreground-faint">{t("minDurationHint")}</span>
              </div>
            )}
          </div>
        )}

        <FormError message={error} variant="compact" />

        <button type="submit" disabled={saving}
          className="flex items-center justify-center gap-2 text-sm font-medium text-white rounded-xl px-4 py-3 disabled:opacity-50 transition hover:opacity-80"
          style={{ backgroundColor: accentColor }}>
          {saving ? <Spinner size="sm" /> : <Lock size={16} />}
          {saving ? t("sending") : t("submit")}
        </button>
      </form>
    </ActionModal>
  );
}
