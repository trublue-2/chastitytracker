"use client";

import { useState } from "react";
import { Lock } from "lucide-react";
import { useTranslations } from "next-intl";
import DateTimePicker from "@/app/components/DateTimePicker";
import FormError from "@/app/components/FormError";
import Input from "@/app/components/Input";
import Select from "@/app/components/Select";
import Textarea from "@/app/components/Textarea";
import Button from "@/app/components/Button";
import type { DeviceOption } from "@/lib/queries";

/**
 * Shared form body for "Verschluss anfordern" (ANFORDERUNG) and "Sperrdauer setzen" (SPERRZEIT).
 * Caller wraps this in an ActionModal and provides onSuccess.
 */
export default function VerschlussAnforderungFields({
  userId,
  art,
  devices,
  onSuccess,
}: {
  userId: string;
  art: "ANFORDERUNG" | "SPERRZEIT";
  devices: DeviceOption[];
  onSuccess: () => void;
}) {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const isSperrzeit = art === "SPERRZEIT";
  const accentColor = isSperrzeit ? "var(--color-sperrzeit)" : "var(--color-request)";

  const [nachricht, setNachricht] = useState("");
  const [mode, setMode] = useState<"duration" | "datetime">("duration");
  const [deadlineH, setDeadlineH] = useState(isSperrzeit ? "24" : "4");
  const [endetAt, setEndetAt] = useState("");
  const [withMinDauer, setWithMinDauer] = useState(false);
  const [minDauerH, setMinDauerH] = useState("24");
  const [deviceId, setDeviceId] = useState("");
  const [reinigungErlaubt, setReinigungErlaubt] = useState(false);
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
      if (!isSperrzeit && deviceId) {
        payload.deviceId = deviceId;
      }
      if (isSperrzeit || withMinDauer) {
        payload.reinigungErlaubt = reinigungErlaubt;
      }

      const res = await fetch("/api/admin/verschluss-anforderung", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) onSuccess();
      else setError(data.error || tc("error"));
    } catch {
      setError(tc("networkError"));
    } finally {
      setSaving(false);
    }
  }

  const reinigungCheckbox = (
    <div className="flex flex-col gap-1">
      <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" checked={reinigungErlaubt} onChange={(e) => setReinigungErlaubt(e.target.checked)}
          className="w-4 h-4" style={{ accentColor }} />
        <span className="text-xs text-foreground-faint">{t("reinigungErlaubtLabel")}</span>
      </label>
      <span className="text-xs text-foreground-faint pl-6">{t("reinigungErlaubtHint")}</span>
    </div>
  );

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <Textarea
        label={t("kontrolleInstruction")}
        value={nachricht}
        onChange={(e) => setNachricht(e.target.value)}
        placeholder={t("kontrolleInstruction")}
        rows={2}
      />

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
        <DateTimePicker
          value={endetAt}
          onChange={(e) => setEndetAt(e.target.value)}
          min={new Date().toISOString().slice(0, 16)}
          hint={isSperrzeit ? t("endetHintSperrzeit") : t("endetHintAnforderung")}
        />
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
              <div className="mt-1">{reinigungCheckbox}</div>
            </div>
          )}
        </div>
      )}

      {isSperrzeit && reinigungCheckbox}

      {!isSperrzeit && devices.length > 0 && (
        <Select
          label={t("selectDeviceLabel")}
          options={[
            { value: "", label: t("selectDevicePlaceholder") },
            ...devices.map((d) => ({ value: d.id, label: d.name })),
          ]}
          value={deviceId}
          onChange={(e) => setDeviceId(e.target.value)}
        />
      )}

      <FormError message={error} variant="compact" />

      <Button
        type="submit"
        variant="semantic"
        semantic={isSperrzeit ? "sperrzeit" : "request"}
        fullWidth
        loading={saving}
        icon={<Lock size={16} />}
      >
        {saving ? t("sending") : t("submit")}
      </Button>
    </form>
  );
}
