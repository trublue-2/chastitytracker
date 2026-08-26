"use client";

import { useState } from "react";

import { useTranslations } from "next-intl";
import { toDatetimeLocal, fromDatetimeLocal } from "@/lib/utils";
import DateTimePicker from "@/app/components/DateTimePicker";
import FormError from "@/app/components/FormError";
import Select from "@/app/components/Select";
import Textarea from "@/app/components/Textarea";
import Button from "@/app/components/Button";
import FieldTabs from "@/app/components/FieldTabs";
import DurationOrDatetimeField from "@/app/components/DurationOrDatetimeField";
import HoursInput from "@/app/components/HoursInput";
import { DURATION_QUICK_HOURS, durationHoursOr, type DurationUnit } from "@/lib/constants";
import ScheduleFields, { initialSchedule, scheduleIsPast, schedulePayload, type ScheduleValue } from "@/app/components/ScheduleFields";
import type { DeviceOption } from "@/lib/queries";
import { parseApiErrorCode } from "@/lib/apiClient";
import { useApiError } from "@/app/hooks/useApiError";
import { LockClosedIcon } from "@/app/components/lockIcons";

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
  const defaultDurationH = isSperrzeit ? 24 : 4;
  const [deadlineH, setDeadlineH] = useState(String(defaultDurationH));
  // Die Frist ist eine Dauer wie die Kontroll-Frist und wird auch so eingegeben: Stunden ODER
  // Minuten, im 5-Minuten-Raster. Vorher stand hier ein nacktes Stundenfeld — ist eine Kontrolle
  // binnen 15 Minuten sinnvoll, ist ein Einschliessen binnen 45 Minuten es auch.
  const [deadlineUnit, setDeadlineUnit] = useState<DurationUnit>("h");
  // Base all datetime defaults on the SERVER-provided `minNow` (not client `Date.now()`) so the
  // initializers are deterministic across SSR + hydration.
  const nowBaseMs = fromDatetimeLocal(minNow, tz).getTime();
  // Datetime default = now + default duration, so switching between tabs preserves intent.
  const [endetAt, setEndetAt] = useState(() =>
    toDatetimeLocal(new Date(nowBaseMs + defaultDurationH * 60 * 60 * 1000), tz)
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
  // Terminierung: sofort (default), relative Verzögerung, oder absoluter Zeitpunkt — dasselbe
  // Bauteil, das auch die Aufgabe verwendet.
  const [schedule, setSchedule] = useState<ScheduleValue>(() => initialSchedule(minNow, tz));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (mode === "datetime" && endetAt && fromDatetimeLocal(endetAt, tz) <= new Date()) {
      setError(t("futureDateRequired"));
      return;
    }
    if (scheduleIsPast(schedule, tz)) {
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
        ...schedulePayload(schedule, tz),
      };
      if (mode === "datetime" && endetAt) {
        payload.endetAt = fromDatetimeLocal(endetAt, tz).toISOString();
      } else {
        payload.fristH = durationHoursOr(deadlineH, deadlineUnit, defaultDurationH);
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

      {/* Die Reiter benennen die ANTWORT-ART, nicht die Einheit: „Dauer (h)" stand an derselben
          Stelle wie der Stunden/Minuten-Umschalter der Kontroll-Frist, und wer ihn tippte, um auf
          Minuten zu stellen, landete im Datums-Wähler. Die Einheit steht jetzt im Umschalter des
          Feldes darunter. */}
      <DurationOrDatetimeField
        label={t("frist")}
        mode={mode}
        onModeChange={setMode}
        value={deadlineH}
        unit={deadlineUnit}
        onDurationChange={(value, unit) => { setDeadlineH(value); setDeadlineUnit(unit); }}
        // Eine Sperrzeit wird in Stunden bis Tagen beantwortet, eine Einschliess-Frist in Minuten
        // bis Stunden — die Skala folgt der Vorgabe daneben (24 h gegen 4 h).
        quick={isSperrzeit ? DURATION_QUICK_HOURS.long : DURATION_QUICK_HOURS.short}
        datetime={endetAt}
        onDatetimeChange={setEndetAt}
        datetimeMin={minNow}
        datetimeHint={isSperrzeit ? t("endetHintSperrzeit") : t("endetHintAnforderung")}
        // Die Frist zählt ab JETZT — anders als beim Orgasmus-Fenster gibt es keinen eigenen Start.
        anchorMs={() => Date.now()}
        tz={tz}
      />

      {!isSperrzeit && (
        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={withMinDauer} onChange={(e) => setWithMinDauer(e.target.checked)}
              className="accent-[var(--color-request)] w-4 h-4" />
            <span className="text-xs text-foreground-faint">{t("minDurationLabel")}</span>
          </label>
          {withMinDauer && (
            <div className="flex flex-col gap-2 pl-6">
              {/* Dieselben zwei Antwort-Arten wie oben — die Mindest-Tragedauer behält aber ihr
                  nacktes Stundenfeld: dass sie keinen Minuten-Weg hat, ist eine AUSSAGE (die Grösse
                  lebt in Vielfachen von 24), kein Versäumnis. Die Einheit steht als Suffix am Feld,
                  nicht in der Reiter-Beschriftung. */}
              <FieldTabs
                label={t("sperrEndeLabel")}
                value={sperrMode}
                onChange={setSperrMode}
                options={[
                  { value: "duration", label: tc("duration") },
                  { value: "datetime", label: tc("pointInTime") },
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

      <ScheduleFields
        value={schedule}
        onChange={setSchedule}
        minNow={minNow}
        delayHint={t("scheduleDelayHint")}
        atHint={t("scheduleAtHint")}
      />

      <FormError message={error} variant="compact" />

      <Button
        type="submit"
        variant="semantic"
        semantic={isSperrzeit ? "sperrzeit" : "request"}
        fullWidth
        loading={saving}
        icon={<LockClosedIcon size={16} />}
      >
        {saving ? t("sending") : t("submit")}
      </Button>
    </form>
  );
}
