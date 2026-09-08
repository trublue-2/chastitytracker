"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Repeat } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import Input from "@/app/components/Input";
import Textarea from "@/app/components/Textarea";
import FieldTabs from "@/app/components/FieldTabs";
import DurationInput from "@/app/components/DurationInput";
import Button from "@/app/components/Button";
import FormError from "@/app/components/FormError";
import TaskRequirementPicker, { type PickerCategory } from "./TaskRequirementPicker";
import RecurrenceFields, { initialRecurrence, recurrencePayload, occurrenceFormatter, type RecurrenceValue } from "./RecurrenceFields";
import { parseApiErrorCode } from "@/lib/apiClient";
import { useEntrySubmit } from "@/app/hooks/useEntrySubmit";
import { useApiError } from "@/app/hooks/useApiError";
import {
  TASK_TITLE_MAX_LENGTH, TASK_DESCRIPTION_MAX_LENGTH,
  durationToHours, clampHoldDuration, type DurationUnit,
} from "@/lib/constants";
import type { TaskRequirementInput } from "@/lib/taskService";

/** Der Halte-Modus einer Serie — beide RELATIV: `duration` misst ab dem tatsächlichen Beginn (wie die
 *  „Tragezeit" der Einzelaufgabe, verlangt eine Bedingung), `window` ist die Frist ab Zustellung. */
type HoldMode = "window" | "duration";

/**
 * Formular „Wiederkehrende Aufgabe stellen" (#26).
 *
 * Bewusst schlanker als {@link import("./TaskFields").default}: Nachweise bleiben dem MCP/der
 * Einzelaufgabe vorbehalten, und die Frist ist immer relativ (ein fester Endzeitpunkt ergäbe je
 * Termin keinen Sinn). Bedingungen teilt es sich über {@link TaskRequirementPicker}.
 */
export default function TaskSeriesFields({ userId, categories, tz, today, redirectTo }: {
  userId: string;
  categories: PickerCategory[];
  tz: string;
  /** Heutiges Datum in der Sub-Zone ("YYYY-MM-DD"), server-gerechnet. */
  today: string;
  redirectTo: string;
}) {
  const t = useTranslations("taskSeries");
  const tt = useTranslations("tasks");
  const locale = useLocale();
  const apiError = useApiError();
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [requirements, setRequirements] = useState<TaskRequirementInput[]>([]);
  const [mode, setMode] = useState<HoldMode>("window");
  const [hours, setHours] = useState("");
  const [holdUnit, setHoldUnit] = useState<DurationUnit>("h");
  const [recurrence, setRecurrence] = useState<RecurrenceValue>(() => initialRecurrence(today));
  const [agenda, setAgenda] = useState<string[]>([]);

  const hasRequirements = requirements.length > 0;
  // „Tragezeit" (Dauer ab Beginn) braucht eine Bedingung; ohne sie fällt der Modus auf „Frist" zurück.
  const effectiveMode: HoldMode = mode === "duration" && !hasRequirements ? "window" : mode;
  const holdMinutes = clampHoldDuration(durationToHours(parseFloat(hours), holdUnit) * 60);

  const payload = useMemo(() => recurrencePayload(recurrence, tz), [recurrence, tz]);

  // Agenda-Vorschau: die nächsten Termine, sobald die Regel plausibel ist. Entprellt, damit das
  // Tippen im Zeit-/Datumsfeld nicht bei jedem Anschlag eine Anfrage auslöst.
  useEffect(() => {
    if (!payload.timeOfDay || !payload.startsOn) { setAgenda([]); return; }
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch("/api/admin/task-series/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId, recurrence: payload }),
          signal: ctrl.signal,
        });
        if (res.ok) setAgenda((await res.json()).occurrences ?? []);
      } catch { /* Abbruch beim schnellen Weitertippen — kein Fehler für den Nutzer. */ }
    }, 400);
    return () => { clearTimeout(timer); ctrl.abort(); };
  }, [userId, payload]);

  const agendaFmt = useMemo(() => occurrenceFormatter(locale, tz), [locale, tz]);

  const { saving, error, setError, submit } = useEntrySubmit<Record<string, unknown>>(
    async (body) => {
      const res = await fetch("/api/admin/task-series", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return res.ok ? { ok: true } : { ok: false, error: apiError(await parseApiErrorCode(res)) };
    },
    () => router.push(redirectTo),
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (holdMinutes == null) { setError(t("holdRequired")); return; }
    void submit({
      userId,
      title: title.trim(),
      description: description.trim() || undefined,
      requirements,
      holdDurationMin: effectiveMode === "duration" ? holdMinutes : undefined,
      holdWindowMin: effectiveMode === "window" ? holdMinutes : undefined,
      recurrence: payload,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <Input
        label={tt("titleLabel")}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={tt("titlePlaceholder")}
        maxLength={TASK_TITLE_MAX_LENGTH}
        required
      />
      <Textarea
        label={tt("descriptionLabel")}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder={tt("descriptionPlaceholder")}
        maxLength={TASK_DESCRIPTION_MAX_LENGTH}
        rows={3}
      />

      <TaskRequirementPicker
        label={tt("requirementsLabel")}
        hint={tt("requirementsHint")}
        kgLabel={tt("requirementKgLocked")}
        anyDeviceLabel={tt("anyDevice")}
        deviceLabel={tt("deviceLabel")}
        categories={categories}
        value={requirements}
        onChange={setRequirements}
      />

      <div className="flex flex-col gap-3">
        <FieldTabs
          label={t("holdModeLabel")}
          value={effectiveMode}
          options={[
            { value: "window" as const, label: t("holdModeWindow") },
            ...(hasRequirements ? [{ value: "duration" as const, label: t("holdModeDuration") }] : []),
          ]}
          onChange={setMode}
        />
        <DurationInput
          label={t(effectiveMode === "duration" ? "holdDurationField" : "holdWindowField")}
          ariaLabel={t(effectiveMode === "duration" ? "holdDurationField" : "holdWindowField")}
          value={hours}
          unit={holdUnit}
          onChange={(value, unit) => { setHours(value); setHoldUnit(unit); }}
          required
        />
        <p className="text-xs text-foreground-faint">
          {t(effectiveMode === "duration" ? "holdDurationHint" : "holdWindowHint")}
        </p>
      </div>

      <RecurrenceFields value={recurrence} onChange={setRecurrence} tz={tz} />

      {/* Termin-Vorschau: was die Regel als Nächstes ergäbe. */}
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold uppercase tracking-wider text-foreground-muted">{t("agendaLabel")}</span>
        {agenda.length === 0 ? (
          <p className="text-xs text-foreground-faint">{t("agendaEmpty")}</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {agenda.map((iso) => (
              <li key={iso} className="text-sm text-foreground-muted">{agendaFmt.format(new Date(iso))}</li>
            ))}
          </ul>
        )}
      </div>

      <FormError message={error} variant="compact" />

      <Button type="submit" variant="primary" fullWidth loading={saving} icon={<Repeat size={16} />}>
        {saving ? tt("submitting") : t("submit")}
      </Button>
    </form>
  );
}
