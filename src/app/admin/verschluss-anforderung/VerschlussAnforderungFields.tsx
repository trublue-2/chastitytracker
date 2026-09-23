"use client";

import { useRef, useState } from "react";

import { useLocale, useTranslations } from "next-intl";
import { toDatetimeLocal, fromDatetimeLocal, formatDateTime, toDateLocale } from "@/lib/utils";
import DateTimePicker from "@/app/components/DateTimePicker";
import FormError from "@/app/components/FormError";
import FormSuccess from "@/app/components/FormSuccess";
import Select from "@/app/components/Select";
import Textarea from "@/app/components/Textarea";
import Button from "@/app/components/Button";
import FieldTabs from "@/app/components/FieldTabs";
import DurationOrDatetimeField from "@/app/components/DurationOrDatetimeField";
import HoursInput from "@/app/components/HoursInput";
import { DURATION_QUICK_HOURS, durationHoursOr, type DurationUnit } from "@/lib/constants";
import ScheduleFields, { initialSchedule, scheduleFromWirksamAb, scheduleIsPast, schedulePayload, scheduleAnchorMs, scheduleTriggerIso, type ScheduleValue } from "@/app/components/ScheduleFields";
import type { DeviceOption } from "@/lib/queries";
import { parseApiErrorCode } from "@/lib/apiClient";
import { useApiError } from "@/app/hooks/useApiError";
import { LockClosedIcon } from "@/app/components/lockIcons";

/** Bestandswerte einer offenen ANFORDERUNG, mit denen das Formular als BEARBEITEN-Ansicht startet.
 *  Alle Zeiten ISO; `wirksamAb === null` = sofort/schon ausgelöst. Kommt aus `GET …/[id]`. */
export interface LockRequestEditData {
  id: string;
  message: string | null;
  endsAt: string;
  minDurationHours: number | null;
  lockEndsAt: string | null;
  deviceId: string | null;
  cleaningAllowed: boolean;
  wirksamAb: string | null;
}

/**
 * Shared form body for "Verschluss anfordern" (ANFORDERUNG) and "Sperrdauer setzen" (SPERRZEIT).
 * Caller wraps this in an ActionModal and provides onSuccess.
 *
 * Mit `existing` wird daraus die BEARBEITEN-Ansicht einer offenen ANFORDERUNG: Felder vorbelegt,
 * Submit per `PATCH …/[id]` (`action:"edit"`) statt `POST`. Nur für ANFORDERUNG — eine Sperrzeit
 * ändert man über `setEnd`.
 *
 * Eine NEUE, terminierte ANFORDERUNG lässt sich mit „Speichern und nächste planen" in Serie stellen:
 * das Formular bleibt offen und behält alle Werte, nur der Zeitpunkt wird neu gewählt.
 */
export default function VerschlussAnforderungFields({
  userId,
  art,
  devices,
  tz,
  minNow,
  existing,
  scheduleOnly = false,
  onSuccess,
  onPlanned,
}: {
  userId: string;
  art: "ANFORDERUNG" | "SPERRZEIT";
  /** Sub ist verschlossen: ohne den Reiter „Sofort", Start auf „Zeitpunkt". */
  scheduleOnly?: boolean;
  devices: DeviceOption[];
  /** Governing timezone of the sub (data owner) — formats datetime-local defaults + submit. */
  tz: string;
  /** Server-computed "now" wall-clock in the sub's tz — the datetime-local min (replaces the UTC-bug min). */
  minNow: string;
  /** Gesetzt = BEARBEITEN einer bestehenden ANFORDERUNG statt Neuanlage. */
  existing?: LockRequestEditData;
  onSuccess: () => void;
  /** Nach jeder mit „Speichern und nächste planen" gespeicherten Anforderung — das Formular bleibt
   *  offen, `onSuccess` kommt also nicht. Für Aufrufer, deren Anzeige darunter sonst veraltet. */
  onPlanned?: () => void;
}) {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const locale = useLocale();
  const apiError = useApiError();
  const isLockPeriod = art === "SPERRZEIT";
  const accentColor = isLockPeriod ? "var(--color-sperrzeit)" : "var(--color-request)";

  const [message, setMessage] = useState(existing?.message ?? "");
  // Bearbeiten startet bei der gespeicherten ABSOLUTEN Frist (Zeitpunkt-Reiter); Neuanlage bei der Dauer.
  const [mode, setMode] = useState<"duration" | "datetime">(existing ? "datetime" : "duration");
  const defaultDurationH = isLockPeriod ? 24 : 4;
  const [deadlineH, setDeadlineH] = useState(String(defaultDurationH));
  // Die Frist ist eine Dauer wie die Kontroll-Frist und wird auch so eingegeben: Stunden ODER
  // Minuten, im 5-Minuten-Raster. Vorher stand hier ein nacktes Stundenfeld — ist eine Kontrolle
  // binnen 15 Minuten sinnvoll, ist ein Einschliessen binnen 45 Minuten es auch.
  const [deadlineUnit, setDeadlineUnit] = useState<DurationUnit>("h");
  // Base all datetime defaults on the SERVER-provided `minNow` (not client `Date.now()`) so the
  // initializers are deterministic across SSR + hydration.
  const nowBaseMs = fromDatetimeLocal(minNow, tz).getTime();
  // Datetime default = now + default duration, so switching between tabs preserves intent.
  const [endsAt, setEndsAt] = useState(() =>
    existing
      ? toDatetimeLocal(existing.endsAt, tz)
      : toDatetimeLocal(new Date(nowBaseMs + defaultDurationH * 60 * 60 * 1000), tz)
  );
  const [withMinDauer, setWithMinDauer] = useState(
    existing ? existing.minDurationHours != null || existing.lockEndsAt != null : false
  );
  // Min-Sperre nach dem Verschliessen: relative Dauer (minDurationHours) ODER absolutes Ende (lockEndsAt).
  const [lockEndMode, setLockEndMode] = useState<"duration" | "datetime">(
    existing?.lockEndsAt != null ? "datetime" : "duration"
  );
  const [minDauerH, setMinDauerH] = useState(
    existing?.minDurationHours != null ? String(existing.minDurationHours) : "24"
  );
  const [lockEndsAt, setLockEndsAt] = useState(() =>
    existing?.lockEndsAt
      ? toDatetimeLocal(existing.lockEndsAt, tz)
      : toDatetimeLocal(new Date(nowBaseMs + 24 * 60 * 60 * 1000), tz)
  );
  const [deviceId, setDeviceId] = useState(existing?.deviceId ?? "");
  const [cleaningAllowed, setCleaningAllowed] = useState(existing?.cleaningAllowed ?? false);
  // Terminierung: sofort (default), relative Verzögerung, oder absoluter Zeitpunkt — dasselbe
  // Bauteil, das auch die Aufgabe verwendet. Beim Bearbeiten aus dem gespeicherten `wirksamAb`.
  const [schedule, setSchedule] = useState<ScheduleValue>(() =>
    existing ? scheduleFromWirksamAb(existing.wirksamAb, minNow, tz)
    : scheduleOnly ? { ...initialSchedule(minNow, tz), mode: "datetime" }
    : initialSchedule(minNow, tz)
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  // Serienplanung: die Auslöse-Zeitpunkte, die dieses Formular schon gespeichert hat. Zählt die
  // Serie, liefert den zuletzt geplanten für die Bestätigung, und derselbe Zeitpunkt noch einmal
  // wäre ein Doppelklick, keine zweite Anforderung.
  const [planned, setPlanned] = useState<string[]>([]);
  const lastPlanned = planned.at(-1);
  const scheduleInputRef = useRef<HTMLInputElement>(null);
  // Welcher der beiden Absende-Knöpfe gedrückt wurde — gesetzt im Klick, gelesen im Submit.
  const planNextRef = useRef(false);
  const canPlanNext = !existing && !isLockPeriod && schedule.mode !== "immediate";
  // Absolute Zeiten wandern beim Weiterplanen unverändert mit — die Dauer-Reiter rechnen dagegen ab
  // der jeweiligen Auslösung und passen von selbst. Der Hinweis steht am betroffenen Feld.
  const carriedHint = planned.length > 0 ? t("planNextAbsoluteHint") : undefined;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const planNext = canPlanNext && planNextRef.current;
    // Beim Bearbeiten darf die EINSCHLIESS-Frist in der Vergangenheit liegen (der Service prüft sie
    // bewusst nicht — sie ist eine Frist, kein Sperr-Ende). Bei der Neuanlage bleibt sie zukünftig.
    const deadlineMs = mode === "datetime" && endsAt ? fromDatetimeLocal(endsAt, tz).getTime() : null;
    if (!existing && deadlineMs !== null && deadlineMs <= Date.now()) {
      setError(t("futureDateRequired"));
      return;
    }
    if (scheduleIsPast(schedule, tz)) {
      setError(t("scheduleFutureRequired"));
      return;
    }
    const nowMs = Date.now();
    // Der Dienst prüft die Einschliess-Frist bewusst nicht gegen die Auslösung (sie ist eine Frist,
    // kein Sperr-Ende). Beim Weiterplanen wandert eine als Zeitpunkt gesetzte Frist aber mit und läge
    // bei der nächsten Anforderung vor deren Versand — dieselbe Prüfung wie im Orgasmus-Formular.
    if (!existing && deadlineMs !== null && deadlineMs <= scheduleAnchorMs(schedule, tz, nowMs)) {
      setError(t("deadlineBeforeTrigger"));
      return;
    }
    const triggerIso = scheduleTriggerIso(schedule, tz, nowMs);
    if (!existing && schedule.mode === "datetime" && triggerIso && planned.includes(triggerIso)) {
      setError(t("scheduleDuplicate"));
      return;
    }
    if (!isLockPeriod && withMinDauer && lockEndMode === "datetime" && lockEndsAt && fromDatetimeLocal(lockEndsAt, tz) <= new Date()) {
      setError(t("futureDateRequired"));
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = existing
        ? await fetch(`/api/admin/verschluss-anforderung/${existing.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(buildEditPayload()),
          })
        : await fetch("/api/admin/verschluss-anforderung", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(buildCreatePayload()),
          });
      if (!res.ok) setError(apiError(await parseApiErrorCode(res)));
      else if (!planNext) onSuccess();
      else {
        // Offen bleiben, alle Werte behalten — nur der Zeitpunkt ist neu zu wählen.
        if (triggerIso) setPlanned((p) => [...p, triggerIso]);
        onPlanned?.();
        scheduleInputRef.current?.focus();
      }
    } catch {
      setError(tc("networkError"));
    } finally {
      setSaving(false);
    }
  }

  function buildCreatePayload(): Record<string, unknown> {
    const payload: Record<string, unknown> = {
      userId, art,
      message: message.trim() || undefined,
      ...schedulePayload(schedule, tz),
    };
    if (mode === "datetime" && endsAt) {
      payload.endsAt = fromDatetimeLocal(endsAt, tz).toISOString();
    } else {
      payload.fristH = durationHoursOr(deadlineH, deadlineUnit, defaultDurationH);
    }
    if (!isLockPeriod && withMinDauer) {
      if (lockEndMode === "datetime" && lockEndsAt) {
        payload.lockEndsAt = fromDatetimeLocal(lockEndsAt, tz).toISOString();
      } else {
        payload.minDurationHours = parseFloat(minDauerH) || 24;
      }
    }
    if (!isLockPeriod && deviceId) {
      payload.deviceId = deviceId;
    }
    if (isLockPeriod || withMinDauer) {
      payload.cleaningAllowed = cleaningAllowed;
    }
    return payload;
  }

  // Bearbeiten sendet ABSOLUTE Werte — der Service-Patch ist absolut, die relative Frist/Verzögerung
  // wird deshalb hier gegen den (ggf. terminierten) Auslöse-Zeitpunkt aufgelöst. Alle editierbaren
  // Felder werden explizit gesetzt: das Formular hält den vollen Stand, es ist ein Ersetzen.
  function buildEditPayload(): Record<string, unknown> {
    const nowMs = Date.now();
    const wirksamAb = scheduleTriggerIso(schedule, tz, nowMs);
    const triggerMs = scheduleAnchorMs(schedule, tz, nowMs);
    const endsAtIso = mode === "datetime" && endsAt
      ? fromDatetimeLocal(endsAt, tz).toISOString()
      : new Date(triggerMs + durationHoursOr(deadlineH, deadlineUnit, defaultDurationH) * 60 * 60 * 1000).toISOString();
    let minDurationHours: number | null = null;
    let lockEndsAtIso: string | null = null;
    if (withMinDauer) {
      if (lockEndMode === "datetime" && lockEndsAt) lockEndsAtIso = fromDatetimeLocal(lockEndsAt, tz).toISOString();
      else minDurationHours = parseFloat(minDauerH) || 24;
    }
    return {
      action: "edit",
      message: message.trim() || null,
      endsAt: endsAtIso,
      minDurationHours,
      lockEndsAt: lockEndsAtIso,
      deviceId: deviceId || null,
      cleaningAllowed,
      wirksamAb,
    };
  }

  const cleaningCheckbox = (
    <div className="flex flex-col gap-1">
      <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" checked={cleaningAllowed} onChange={(e) => setCleaningAllowed(e.target.checked)}
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
        value={message}
        onChange={(e) => setMessage(e.target.value)}
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
        quick={isLockPeriod ? DURATION_QUICK_HOURS.long : DURATION_QUICK_HOURS.short}
        datetime={endsAt}
        onDatetimeChange={setEndsAt}
        datetimeMin={minNow}
        datetimeHint={carriedHint ?? (isLockPeriod ? t("endetHintSperrzeit") : t("endetHintAnforderung"))}
        // Die Frist zählt ab JETZT (Neuanlage) bzw. ab dem terminierten Auslöse-Zeitpunkt (Bearbeiten)
        // — anders als beim Orgasmus-Fenster gibt es keinen eigenen Start.
        anchorMs={existing ? () => scheduleAnchorMs(schedule, tz, Date.now()) : () => Date.now()}
        tz={tz}
      />

      {!isLockPeriod && (
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
                value={lockEndMode}
                onChange={setLockEndMode}
                options={[
                  { value: "duration", label: tc("duration") },
                  { value: "datetime", label: tc("pointInTime") },
                ]}
              />
              {lockEndMode === "duration" ? (
                <>
                  <HoursInput value={minDauerH} onChange={setMinDauerH} min={1} step={1} unit={tc("hoursUnit")} />
                  <span className="text-xs text-foreground-faint">{t("minDurationHint")}</span>
                </>
              ) : (
                <DateTimePicker
                  value={lockEndsAt}
                  onChange={(e) => setLockEndsAt(e.target.value)}
                  min={minNow}
                  hint={carriedHint ?? t("sperrUntilHint")}
                />
              )}
              <div className="mt-1">{cleaningCheckbox}</div>
            </div>
          )}
        </div>
      )}

      {isLockPeriod && cleaningCheckbox}

      {!isLockPeriod && devices.length > 0 && (
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
        allowImmediate={!scheduleOnly}
        atInputRef={scheduleInputRef}
      />

      <FormError message={error} variant="compact" />
      <FormSuccess
        variant="inline"
        message={lastPlanned
          ? t("plannedFor", { time: formatDateTime(lastPlanned, toDateLocale(locale), tz), count: planned.length })
          : null}
      />

      <Button
        type="submit"
        variant="semantic"
        semantic={isLockPeriod ? "sperrzeit" : "request"}
        fullWidth
        loading={saving}
        icon={<LockClosedIcon size={16} />}
        onClick={() => { planNextRef.current = false; }}
      >
        {saving ? t("sending") : existing ? tc("save") : t("submit")}
      </Button>
      {canPlanNext && (
        <Button type="submit" variant="secondary" fullWidth disabled={saving} onClick={() => { planNextRef.current = true; }}>
          {t("saveAndPlanNext")}
        </Button>
      )}
    </form>
  );
}
