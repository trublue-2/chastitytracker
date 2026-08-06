"use client";

import { useState } from "react";
import { Lock } from "lucide-react";
import { useTranslations } from "next-intl";
import { toDatetimeLocal, fromDatetimeLocal } from "@/lib/utils";
import DateTimePicker from "@/app/components/DateTimePicker";
import FormError from "@/app/components/FormError";
import Input from "@/app/components/Input";
import Select from "@/app/components/Select";
import Textarea from "@/app/components/Textarea";
import Button from "@/app/components/Button";
import FieldTabs from "@/app/components/FieldTabs";
import HoursInput from "@/app/components/HoursInput";
import type { DeviceOption } from "@/lib/queries";
import { parseApiErrorCode } from "@/lib/apiClient";
import { useApiError } from "@/app/hooks/useApiError";

/**
 * Shared form body for "Verschluss anfordern" (ANFORDERUNG) and "Sperrdauer setzen" (SPERRZEIT).
 * Caller wraps this in an ActionModal and provides onSuccess.
 */
export default function VerschlussAnforderungFields({
  userId,
  art,
  devices,
  tz,
  minNow,
  onSuccess,
}: {
  userId: string;
  art: "ANFORDERUNG" | "SPERRZEIT";
  devices: DeviceOption[];
  /** Governing timezone of the sub (data owner) — formats datetime-local defaults + submit. */
  tz: string;
  /** Server-computed "now" wall-clock in the sub's tz — the datetime-local min (replaces the UTC-bug min). */
  minNow: string;
  onSuccess: () => void;
}) {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const apiError = useApiError();
  const isSperrzeit = art === "SPERRZEIT";
  const accentColor = isSperrzeit ? "var(--color-sperrzeit)" : "var(--color-request)";

  const [nachricht, setNachricht] = useState("");
  const [mode, setMode] = useState<"duration" | "datetime">("duration");
  const defaultDurationH = isSperrzeit ? "24" : "4";
  const [deadlineH, setDeadlineH] = useState(defaultDurationH);
  // Base all datetime defaults on the SERVER-provided `minNow` (not client `Date.now()`) so the
  // initializers are deterministic across SSR + hydration.
  const nowBaseMs = fromDatetimeLocal(minNow, tz).getTime();
  // Datetime default = now + default duration, so switching between tabs preserves intent.
  const [endetAt, setEndetAt] = useState(() =>
    toDatetimeLocal(new Date(nowBaseMs + parseFloat(defaultDurationH) * 60 * 60 * 1000), tz)
  );
  const [withMinDauer, setWithMinDauer] = useState(false);
  // Min-Sperre nach dem Verschliessen: relative Dauer (dauerH) ODER absolutes Ende (sperrEndetAt).
  const [sperrMode, setSperrMode] = useState<"duration" | "datetime">("duration");
  const [minDauerH, setMinDauerH] = useState("24");
  const [sperrEndetAt, setSperrEndetAt] = useState(() =>
    toDatetimeLocal(new Date(nowBaseMs + 24 * 60 * 60 * 1000), tz)
  );
  const [deviceId, setDeviceId] = useState("");
  const [reinigungErlaubt, setReinigungErlaubt] = useState(false);
  // Terminierung: sofort (default), relative Verzögerung, oder absoluter Zeitpunkt.
  const [scheduleMode, setScheduleMode] = useState<"immediate" | "delay" | "datetime">("immediate");
  const [delayValue, setDelayValue] = useState("30");
  const [delayUnit, setDelayUnit] = useState<"minutes" | "hours">("minutes");
  const [scheduledAt, setScheduledAt] = useState(() =>
    toDatetimeLocal(new Date(nowBaseMs + 60 * 60 * 1000), tz)
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (mode === "datetime" && endetAt && fromDatetimeLocal(endetAt, tz) <= new Date()) {
      setError(t("futureDateRequired"));
      return;
    }
    if (scheduleMode === "datetime" && scheduledAt && fromDatetimeLocal(scheduledAt, tz) <= new Date()) {
      setError(t("scheduleFutureRequired"));
      return;
    }
    if (!isSperrzeit && withMinDauer && sperrMode === "datetime" && sperrEndetAt && fromDatetimeLocal(sperrEndetAt, tz) <= new Date()) {
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
        payload.endetAt = fromDatetimeLocal(endetAt, tz).toISOString();
      } else {
        payload.fristH = parseFloat(deadlineH) || (isSperrzeit ? 24 : 4);
      }
      if (scheduleMode === "datetime" && scheduledAt) {
        payload.wirksamAbAt = fromDatetimeLocal(scheduledAt, tz).toISOString();
      } else if (scheduleMode === "delay") {
        const v = parseFloat(delayValue) || 0;
        payload.delayMinutes = delayUnit === "hours" ? v * 60 : v;
      }
      if (!isSperrzeit && withMinDauer) {
        if (sperrMode === "datetime" && sperrEndetAt) {
          payload.sperrEndetAt = fromDatetimeLocal(sperrEndetAt, tz).toISOString();
        } else {
          payload.dauerH = parseFloat(minDauerH) || 24;
        }
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
      if (res.ok) onSuccess();
      else setError(apiError(await parseApiErrorCode(res)));
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

      <FieldTabs
        label={t("frist")}
        value={mode}
        onChange={setMode}
        options={[
          { value: "duration", label: t("durationHours") },
          { value: "datetime", label: t("untilDate") },
        ]}
      />

      {mode === "duration" ? (
        <HoursInput value={deadlineH} onChange={setDeadlineH} min={0.5} step={0.5} unit={tc("hoursUnit")} />
      ) : (
        <DateTimePicker
          value={endetAt}
          onChange={(e) => setEndetAt(e.target.value)}
          min={minNow}
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
            <div className="flex flex-col gap-2 pl-6">
              <FieldTabs
                label={t("sperrEndeLabel")}
                value={sperrMode}
                onChange={setSperrMode}
                options={[
                  { value: "duration", label: t("durationHours") },
                  { value: "datetime", label: t("sperrUntilDate") },
                ]}
              />
              {sperrMode === "duration" ? (
                <>
                  <HoursInput value={minDauerH} onChange={setMinDauerH} min={1} step={1} unit={tc("hoursUnit")} />
                  <span className="text-xs text-foreground-faint">{t("minDurationHint")}</span>
                </>
              ) : (
                <DateTimePicker
                  value={sperrEndetAt}
                  onChange={(e) => setSperrEndetAt(e.target.value)}
                  min={minNow}
                  hint={t("sperrUntilHint")}
                />
              )}
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

      <FieldTabs
        label={t("schedulingLabel")}
        value={scheduleMode}
        onChange={setScheduleMode}
        options={[
          { value: "immediate", label: t("scheduleImmediate") },
          { value: "delay", label: t("scheduleDelay") },
          { value: "datetime", label: t("scheduleAt") },
        ]}
      />

      {scheduleMode === "delay" && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <div className="w-24">
              <Input type="number" value={delayValue} onChange={(e) => setDelayValue(e.target.value)} min={1} step={1} />
            </div>
            <Select
              options={[
                { value: "minutes", label: t("scheduleDelayMinutes") },
                { value: "hours", label: t("scheduleDelayHours") },
              ]}
              value={delayUnit}
              onChange={(e) => setDelayUnit(e.target.value as "minutes" | "hours")}
            />
          </div>
          <span className="text-xs text-foreground-faint">{t("scheduleDelayHint")}</span>
        </div>
      )}

      {scheduleMode === "datetime" && (
        <DateTimePicker
          value={scheduledAt}
          onChange={(e) => setScheduledAt(e.target.value)}
          min={minNow}
          hint={t("scheduleAtHint")}
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
