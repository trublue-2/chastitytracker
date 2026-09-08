"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardList, Repeat } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { toDatetimeLocal, fromDatetimeLocal, formatElapsedMs } from "@/lib/utils";
import useTick from "@/app/hooks/useTick";
import DateTimePicker from "@/app/components/DateTimePicker";
import DurationInput from "@/app/components/DurationInput";
import FieldLabel from "@/app/components/FieldLabel";
import FieldTabs from "@/app/components/FieldTabs";
import FormError from "@/app/components/FormError";
import Input from "@/app/components/Input";
import HoursInput from "@/app/components/HoursInput";
import ScheduleFields, { initialSchedule, scheduleAnchorLive, scheduleAnchorMs, scheduleIsPast, schedulePayload, type ScheduleValue } from "@/app/components/ScheduleFields";
import Textarea from "@/app/components/Textarea";
import Button from "@/app/components/Button";
import Checkbox from "@/app/components/Checkbox";
import TimePreview from "@/app/components/TimePreview";
import { busyDimCls } from "@/app/components/inputStyles";
import { parseApiErrorCode } from "@/lib/apiClient";
import { useEntrySubmit } from "@/app/hooks/useEntrySubmit";
import { useApiError } from "@/app/hooks/useApiError";
import {
  TASK_TITLE_MAX_LENGTH, TASK_DESCRIPTION_MAX_LENGTH,
  TASK_DEFAULT_START_GRACE_MIN, TASK_START_GRACE_RANGE, clampStartGrace, startGraceFromClock, clampHoldDuration,
  DURATION_UNITS, durationToHours, durationFromHours, type DurationUnit,
} from "@/lib/constants";
import { minHoldMs, startDeadline } from "@/lib/tasks";
import { TASK_FORM_QUERY } from "@/lib/entryFormRoute";
import type { TaskRequirementInput, TaskProofInput } from "@/lib/taskService";
import TaskRequirementPicker, { type PickerCategory } from "./TaskRequirementPicker";
import TaskProofPicker from "./TaskProofPicker";
import RecurrenceFields from "./RecurrenceFields";
import { initialRecurrence, recurrencePayload, occurrenceFormatter, type RecurrenceValue } from "@/lib/recurrenceForm";

/**
 * Woran die Frist hängt — die EINE Entscheidung des Frist-Blocks (Einzelaufgabe).
 *
 * `fromStart` und `duration` tragen dieselbe Zahl im selben Feld und unterscheiden sich nur im
 * Anker: ab dem ANLEGEN bzw. ab dem STELLEN. `datetime` ist der feste Termin.
 */
type HoldMode = "fromStart" | "duration" | "datetime";

const HOLD_MODES = [
  { value: "fromStart", labelKey: "holdModeFromStart" },
  { value: "duration", labelKey: "holdModeDuration" },
  { value: "datetime", labelKey: "holdModeDatetime" },
] as const satisfies readonly { value: HoldMode; labelKey: string }[];

/** Wie der SPÄTESTE BEGINN eingegeben wird — dieselbe Frage in zwei Sprachen. */
type GraceMode = "duration" | "clock";

const GRACE_STEP_MIN = DURATION_UNITS.min.step;

/** Der Halte-Modus einer SERIE — beide relativ: `duration` ab dem Beginn (verlangt eine Bedingung),
 *  `window` als Frist ab jedem Termin. */
type SeriesHoldMode = "window" | "duration";

/** Was das Formular beim Ändern vorbelegt — der Server rechnet den Zustand aus der Zeile aus und
 *  reicht ihn fertig durch, damit die Client-Komponente ihn nur noch in ihre Felder setzt. */
export interface TaskFormInitial {
  recurring: boolean;
  title: string;
  description: string;
  requirements: TaskRequirementInput[];
  proofs: TaskProofInput[];
  proofOrderMatters: boolean;
  isPunishment: boolean;
  penaltyReason: string;
  // Einzelaufgabe-Frist:
  mode: HoldMode;
  hours: string;
  holdUnit: DurationUnit;
  holdUntil: string;
  graceMin: string;
  // Serie:
  seriesHoldMode: SeriesHoldMode;
  recurrence: RecurrenceValue;
}

/**
 * Formular „Aufgabe stellen" — EINE Maske für alle vier Fälle: Aufgabe oder Serie anlegen, und beide
 * ändern. Der Schalter „Wiederkehrend" schaltet zwischen der Einzel-Frist (mit Terminierung) und der
 * Wiederhol-Regel (mit Termin-Vorschau) um; beim Ändern steht der Modus fest.
 *
 * Der Aufbau der Einzel-Frist folgt `VerschlussAnforderungFields` (Umschalter, Zeitwahl, Nachricht).
 */
export default function TaskFields({
  userId,
  categories,
  tz,
  minNow,
  today,
  redirectTo,
  offenseRef,
  offenseType,
  initialPenaltyReason,
  edit,
  initial,
}: {
  userId: string;
  categories: PickerCategory[];
  tz: string;
  minNow: string;
  /** Heutiges Datum in der Sub-Zone ("YYYY-MM-DD") — Vorgabe des Serien-Startdatums. */
  today: string;
  redirectTo: string;
  offenseRef?: string;
  offenseType?: string;
  initialPenaltyReason?: string;
  /** Beim ÄNDERN: was und welche Art. Fehlt = Anlegen. */
  edit?: { kind: "task" | "series"; id: string };
  /** Vorbelegung beim Ändern bzw. beim vorangehakten „Wiederkehrend" (Neue Serie). */
  initial?: Partial<TaskFormInitial>;
}) {
  const t = useTranslations("tasks");
  const ts = useTranslations("taskSeries");
  const ta = useTranslations("admin");
  const tc = useTranslations("common");
  const locale = useLocale();
  const apiError = useApiError();
  const router = useRouter();
  const holdUntilId = useId();

  const isEditTask = edit?.kind === "task";
  const isEditSeries = edit?.kind === "series";

  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [mode, setMode] = useState<HoldMode>(initial?.mode ?? "fromStart");
  const [hours, setHours] = useState(initial?.hours ?? "");
  const [holdUnit, setHoldUnit] = useState<DurationUnit>(initial?.holdUnit ?? "h");
  const [holdUntil, setHoldUntil] = useState(initial?.holdUntil ?? "");
  const [graceMode, setGraceMode] = useState<GraceMode>("duration");
  const [graceMin, setGraceMin] = useState(initial?.graceMin ?? String(TASK_DEFAULT_START_GRACE_MIN));
  const [graceAt, setGraceAt] = useState("");
  const [requirements, setRequirements] = useState<TaskRequirementInput[]>(initial?.requirements ?? []);
  const [proofs, setProofs] = useState<TaskProofInput[]>(initial?.proofs ?? []);
  const [proofOrderMatters, setProofOrderMatters] = useState(initial?.proofOrderMatters ?? true);
  const [isPunishment, setIsPunishment] = useState(initial?.isPunishment ?? !!offenseRef);
  const [penaltyReason, setPenaltyReason] = useState(initial?.penaltyReason ?? initialPenaltyReason ?? "");
  const [schedule, setSchedule] = useState<ScheduleValue>(() => initialSchedule(minNow, tz));

  // ── Serie ──
  // `recurring` ist beim Ändern fest (Serie an, Aufgabe aus); beim Anlegen der Schalter.
  const [recurring, setRecurring] = useState(isEditSeries || (initial?.recurring ?? false));
  const [seriesHoldMode, setSeriesHoldMode] = useState<SeriesHoldMode>(initial?.seriesHoldMode ?? "window");
  const [recurrence, setRecurrence] = useState<RecurrenceValue>(() => initial?.recurrence ?? initialRecurrence(today));
  const [agenda, setAgenda] = useState<string[]>([]);

  const { saving, error, setError, submit } = useEntrySubmit<{ url: string; method: string; body: Record<string, unknown> }>(
    async ({ url, method, body }) => {
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      return res.ok ? { ok: true } : { ok: false, error: apiError(await parseApiErrorCode(res)) };
    },
    () => router.push(redirectTo),
  );

  const hasRequirements = requirements.length > 0;
  const effectiveMode = mode === "fromStart" && !hasRequirements ? "duration" : mode;
  const fromStartActive = effectiveMode === "fromStart";
  // EINE Frist-Minutenzahl aus der Dauer-Eingabe — geteilt vom Einzel- und vom Serien-Zweig (beide
  // lesen dasselbe `hours`/`holdUnit`).
  const holdMinutes = clampHoldDuration(durationToHours(parseFloat(hours), holdUnit) * 60);

  // ── Serien-Agenda (nur im Wiederkehr-Modus) ──
  const recurrencePayloadValue = useMemo(() => recurrencePayload(recurrence, tz), [recurrence, tz]);
  useEffect(() => {
    if (!recurring || !recurrencePayloadValue.timeOfDay || !recurrencePayloadValue.startsOn) { setAgenda([]); return; }
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch("/api/admin/task-series/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId, recurrence: recurrencePayloadValue }),
          signal: ctrl.signal,
        });
        if (res.ok) setAgenda((await res.json()).occurrences ?? []);
      } catch { /* Abbruch beim Weitertippen */ }
    }, 400);
    return () => { clearTimeout(timer); ctrl.abort(); };
  }, [userId, recurring, recurrencePayloadValue]);
  const agendaFmt = useMemo(() => occurrenceFormatter(locale, tz), [locale, tz]);

  function endAt(nowMs: number): Date {
    return effectiveMode !== "datetime"
      ? new Date(anchorMs(nowMs) + durationToHours(parseFloat(hours), holdUnit) * 3600_000)
      : fromDatetimeLocal(holdUntil, tz);
  }

  const anchorLive = scheduleAnchorLive(schedule, tz);
  const previewLive = !recurring && (anchorLive || hasRequirements || effectiveMode !== "datetime");
  useTick(previewLive ? 60_000 : 0);
  const nowMs = Date.now();

  function anchorMs(nowMs: number): number {
    return scheduleAnchorMs(schedule, tz, nowMs);
  }

  function graceMinAt(anchor: number): number | null {
    if (graceMode === "duration") return clampStartGrace(parseFloat(graceMin));
    return startGraceFromClock(fromDatetimeLocal(graceAt, tz).getTime(), anchor);
  }

  function switchGraceMode(next: GraceMode) {
    if (next === graceMode) return;
    const anchor = anchorMs(Date.now());
    const minutes = graceMinAt(anchor);
    if (minutes != null) {
      if (next === "clock") setGraceAt(toDatetimeLocal(new Date(anchor + minutes * 60_000), tz));
      else setGraceMin(String(Math.ceil(minutes / GRACE_STEP_MIN) * GRACE_STEP_MIN));
    }
    setGraceMode(next);
  }

  function switchMode(next: HoldMode) {
    if (next === effectiveMode) return;
    const nowMs = Date.now();
    const end = endAt(nowMs);
    const known = !Number.isNaN(end.getTime());
    if (known && next === "datetime") setHoldUntil(toDatetimeLocal(end, tz));
    if (known && effectiveMode === "datetime") {
      setHours(String(durationFromHours((end.getTime() - anchorMs(nowMs)) / 3600_000, holdUnit)));
    }
    setMode(next);
  }

  const holdFieldLabel = t(fromStartActive ? "holdFieldFromStart" : "holdFieldDuration");
  const graceClockError = t("graceClockInvalid", { hours: TASK_START_GRACE_RANGE.max / 60 });

  // Serie: Frist-Minuten aus der Dauer-Eingabe; „Tragezeit" braucht eine Bedingung, sonst Fenster.
  const effectiveSeriesHoldMode: SeriesHoldMode = seriesHoldMode === "duration" && !hasRequirements ? "window" : seriesHoldMode;

  function submitSeries() {
    if (holdMinutes == null) { setError(ts("holdRequired")); return; }
    const body: Record<string, unknown> = {
      userId,
      title: title.trim(),
      description: description.trim() || undefined,
      requirements,
      proofs: proofs.filter((p) => p.description.trim()),
      proofOrderMatters,
      holdDurationMin: effectiveSeriesHoldMode === "duration" ? holdMinutes : undefined,
      holdWindowMin: effectiveSeriesHoldMode === "window" ? holdMinutes : undefined,
      recurrence: recurrencePayloadValue,
    };
    void submit(isEditSeries
      ? { url: `/api/admin/task-series/${edit!.id}`, method: "PUT", body }
      : { url: "/api/admin/task-series", method: "POST", body });
  }

  function submitTaskEdit() {
    const nowMs = Date.now();
    const until = endAt(nowMs);
    if (!fromStartActive && Number.isNaN(until.getTime())) { setError(ts("holdRequired")); return; }
    void submit({
      url: `/api/admin/tasks/${edit!.id}`,
      method: "PATCH",
      body: {
        action: "edit",
        title: title.trim(),
        description: description.trim() || null,
        holdUntil: fromStartActive ? undefined : until.toISOString(),
        holdDurationMin: fromStartActive ? holdMinutes : undefined,
        isPunishment,
        penaltyReason: isPunishment ? penaltyReason.trim() || null : null,
      },
    });
  }

  function submitTaskCreate() {
    if (scheduleIsPast(schedule, tz)) { setError(ta("scheduleFutureRequired")); return; }
    const nowMs = Date.now();
    const until = endAt(nowMs);
    const grace = hasRequirements ? graceMinAt(anchorMs(nowMs)) : undefined;
    if (grace === null) { setError(graceClockError); return; }
    const proofRows = proofs.filter((p) => p.description.trim());
    if (Number.isNaN(until.getTime())) return;
    void submit({
      url: "/api/admin/tasks",
      method: "POST",
      body: {
        userId,
        title: title.trim(),
        description: description.trim() || undefined,
        holdUntil: fromStartActive ? undefined : until.toISOString(),
        holdDurationMin: fromStartActive ? holdMinutes : undefined,
        startGraceMin: grace,
        requirements,
        proofs: proofRows,
        proofOrderMatters: proofRows.length > 0 ? proofOrderMatters : undefined,
        isPunishment,
        penaltyReason: isPunishment ? penaltyReason.trim() || undefined : undefined,
        [TASK_FORM_QUERY.offenseRef]: offenseRef,
        [TASK_FORM_QUERY.offenseType]: offenseType,
        ...schedulePayload(schedule, tz),
      },
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (recurring) submitSeries();
    else if (isEditTask) submitTaskEdit();
    else submitTaskCreate();
  }

  // Für die Nachweis-Vorschau im Wiederkehr-Modus: ein repräsentatives Ende (jetzt + Frist), weil die
  // Serie keinen einzelnen Termin hat.
  const seriesAnchorMs = (n: number) => n;
  const seriesEndAt = (n: number) => new Date(n + (holdMinutes ?? 0) * 60_000);

  const requirementPicker = (
    <TaskRequirementPicker
      label={t("requirementsLabel")}
      hint={t("requirementsHint")}
      kgLabel={t("requirementKgLocked")}
      anyDeviceLabel={t("anyDevice")}
      deviceLabel={t("deviceLabel")}
      categories={categories}
      value={requirements}
      onChange={setRequirements}
    />
  );

  const proofPicker = (
    <TaskProofPicker
      value={proofs}
      onChange={setProofs}
      orderMatters={proofOrderMatters}
      onOrderMattersChange={setProofOrderMatters}
      anchorMs={recurring ? seriesAnchorMs : anchorMs}
      nowMs={nowMs}
      endAt={recurring ? seriesEndAt : endAt}
      tz={tz}
    />
  );

  // Beim Einzelaufgaben-Ändern sind Bedingungen und Nachweise fest (siehe `mergeTaskPatch`): nicht
  // ausblenden, sondern gedämpft und nicht bedienbar zeigen — sonst liest sich ihr Fehlen als „gibt
  // es nicht" oder „beim Bearbeiten gelöscht". Leere Blöcke bleiben weg (dort ist nichts verborgen).
  const readOnly = (node: React.ReactNode) => (
    <div className="flex flex-col gap-1.5">
      <div className={busyDimCls} aria-disabled inert>{node}</div>
      <p className="text-xs text-foreground-faint">{t("editImmutableHint")}</p>
    </div>
  );

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <Input
        label={t("titleLabel")}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={t("titlePlaceholder")}
        maxLength={TASK_TITLE_MAX_LENGTH}
        required
      />

      <Textarea
        label={t("descriptionLabel")}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder={t("descriptionPlaceholder")}
        maxLength={TASK_DESCRIPTION_MAX_LENGTH}
        rows={3}
      />

      {/* Einmalig oder wiederkehrend — nur beim ANLEGEN wählbar (beim Ändern steht die Art fest). Ein
          Segmented-Control statt eines versteckten Schalters: er macht schon vor dem Umschalten
          sichtbar, dass es Serien überhaupt gibt, und benennt den Moduswechsel als das, was er ist. */}
      {!edit && (
        <div className="flex flex-col gap-1.5">
          <FieldTabs
            label={ts("modeLabel")}
            value={recurring ? "recurring" : "oneoff"}
            options={[
              { value: "oneoff", label: ts("modeOneOff") },
              { value: "recurring", label: ts("modeRecurring") },
            ]}
            onChange={(v) => setRecurring(v === "recurring")}
          />
          {recurring && <p className="text-xs text-foreground-faint">{ts("recurringToggleHint")}</p>}
        </div>
      )}

      {/* Bedingungen: beim Einzelaufgaben-Ändern fest — gedämpft gezeigt (nur wenn vorhanden). */}
      {isEditTask ? (hasRequirements && readOnly(requirementPicker)) : requirementPicker}

      {recurring ? (
        /* ── Wiederkehrend: relative Frist + Regel + Agenda ── */
        <div className="flex flex-col gap-3">
          {isEditSeries && <p className="text-xs text-foreground-faint">{ts("editSeriesReplaceHint")}</p>}
          <FieldTabs
            label={ts("holdModeLabel")}
            labelInfo={ts(effectiveSeriesHoldMode === "duration" ? "holdDurationHint" : "holdWindowHint")}
            value={effectiveSeriesHoldMode}
            options={[
              { value: "window" as const, label: ts("holdModeWindow") },
              ...(hasRequirements ? [{ value: "duration" as const, label: ts("holdModeDuration") }] : []),
            ]}
            onChange={setSeriesHoldMode}
          />
          <DurationInput
            label={ts(effectiveSeriesHoldMode === "duration" ? "holdDurationField" : "holdWindowField")}
            ariaLabel={ts(effectiveSeriesHoldMode === "duration" ? "holdDurationField" : "holdWindowField")}
            value={hours}
            unit={holdUnit}
            onChange={(value, unit) => { setHours(value); setHoldUnit(unit); }}
            required
          />

          <RecurrenceFields value={recurrence} onChange={setRecurrence} tz={tz} />

          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-foreground-muted">{ts("agendaLabel")}</span>
            {agenda.length === 0 ? (
              <p className="text-xs text-foreground-faint">{ts("agendaEmpty")}</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {agenda.map((iso) => <li key={iso} className="text-sm text-foreground-muted">{agendaFmt.format(new Date(iso))}</li>)}
              </ul>
            )}
          </div>
        </div>
      ) : (
        /* ── Einzelaufgabe: Frist-Block wie bisher. Beim Ändern ohne Umschalter/Kulanz (Modus fest). ── */
        <div className="flex flex-col gap-3">
          {!isEditTask && (
            <FieldTabs
              label={t("holdModeLabel")}
              labelInfo={hasRequirements ? t(fromStartActive ? "holdFromStartHint" : "holdUntilHintRequirements") : undefined}
              value={effectiveMode}
              options={HOLD_MODES.filter((m) => m.value !== "fromStart" || hasRequirements).map((m) => ({ value: m.value, label: t(m.labelKey) }))}
              onChange={switchMode}
            />
          )}

          {effectiveMode !== "datetime" ? (
            <DurationInput
              label={holdFieldLabel}
              ariaLabel={holdFieldLabel}
              value={hours}
              unit={holdUnit}
              onChange={(value, unit) => {
                setHours(value);
                setHoldUnit(unit);
                if (mode === "fromStart" && !hasRequirements) setMode("duration");
              }}
              required
            />
          ) : (
            <>
              <FieldLabel htmlFor={holdUntilId} required>{tc("pointInTime")}</FieldLabel>
              <DateTimePicker
                id={holdUntilId}
                value={holdUntil}
                onChange={(e) => setHoldUntil(e.target.value)}
                min={minNow}
                hint={t("holdUntilTzHint", { tz })}
                required
              />
            </>
          )}

          {hasRequirements && !isEditTask && (
            <>
              <FieldTabs
                label={t("graceLabel")}
                value={graceMode}
                options={[
                  { value: "duration", label: tc("duration") },
                  { value: "clock", label: t("graceModeClock") },
                ]}
                onChange={switchGraceMode}
              />
              {graceMode === "duration" ? (
                <HoursInput ariaLabel={t("graceLabel")} value={graceMin} onChange={setGraceMin} min={TASK_START_GRACE_RANGE.min} step={GRACE_STEP_MIN} unit={tc("minutesUnit")} />
              ) : (
                <DateTimePicker
                  aria-label={t("graceLabel")}
                  value={graceAt}
                  onChange={(e) => setGraceAt(e.target.value)}
                  min={minNow}
                  error={graceAt !== "" && graceMinAt(anchorMs(Date.now())) === null ? graceClockError : null}
                  hint={t("holdUntilTzHint", { tz })}
                  required
                />
              )}
            </>
          )}

          {hasRequirements && (
            <TimePreview
              at={(nowMs) => {
                const anchor = anchorMs(nowMs);
                const grace = graceMinAt(anchor);
                return grace === null ? new Date(NaN) : startDeadline({ createdAt: new Date(anchor), startGraceMin: grace });
              }}
              nowMs={nowMs}
              tz={tz}
              line={(date) => ({
                text: fromStartActive && holdMinutes != null
                  ? t("previewFromStart", { date, duration: formatElapsedMs(holdMinutes * 60_000, locale) })
                  : t("previewStart", { date }),
              })}
            />
          )}

          {!fromStartActive && (
            <TimePreview
              at={endAt}
              nowMs={nowMs}
              tz={tz}
              line={(date, nowMs) => {
                const anchor = anchorMs(nowMs);
                const grace = hasRequirements ? graceMinAt(anchor) : null;
                if (grace === null) return { text: t("previewEnd", { date }) };
                const holdMs = minHoldMs({ createdAt: new Date(anchor), startGraceMin: grace, holdUntil: endAt(nowMs) });
                return holdMs > 0
                  ? { text: t("previewEndHold", { date, duration: formatElapsedMs(holdMs, locale) }) }
                  : { text: t("previewEndTooSoon", { date }), warn: true };
              }}
            />
          )}
        </div>
      )}

      {/* „Als Strafe" nur bei Einzelaufgaben — eine Serie kennt keinen Strafanlass (submitSeries würde
          das Feld ohnehin nicht senden), der Haken wäre dort ein wirkungsloses Bedienelement. */}
      {!recurring && (
        <div className="flex flex-col gap-2">
          <Checkbox
            label={t("isPunishmentLabel")}
            checked={isPunishment}
            onChange={(e) => setIsPunishment(e.target.checked)}
            disabled={!!offenseRef}
          />
          {isPunishment && (
            <Input
              label={t("penaltyReasonFieldLabel")}
              value={penaltyReason}
              onChange={(e) => setPenaltyReason(e.target.value)}
              placeholder={t("penaltyReasonPlaceholder")}
              maxLength={TASK_TITLE_MAX_LENGTH}
            />
          )}
        </div>
      )}

      {/* Terminierung nur beim ANLEGEN einer Einzelaufgabe (Serie hat ihre Regel; Ändern lässt sie). */}
      {!recurring && !edit && (
        <ScheduleFields value={schedule} onChange={setSchedule} minNow={minNow} delayHint={t("scheduleDelayHint")} atHint={t("scheduleAtHint")} />
      )}

      {/* Nachweise: beim Einzelaufgaben-Ändern fest — gedämpft gezeigt (nur wenn vorhanden). */}
      {isEditTask ? (proofs.length > 0 && readOnly(proofPicker)) : proofPicker}

      <FormError message={error} variant="compact" />

      <Button type="submit" variant="primary" fullWidth loading={saving} icon={recurring ? <Repeat size={16} /> : <ClipboardList size={16} />}>
        {saving ? t("submitting") : (edit ? tc("save") : recurring ? ts("submit") : t("submit"))}
      </Button>
    </form>
  );
}
