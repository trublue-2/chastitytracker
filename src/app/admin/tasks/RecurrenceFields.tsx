"use client";

import { useId } from "react";
import { useTranslations } from "next-intl";
import { fromDatetimeLocal, toDateLocale } from "@/lib/utils";
import FieldTabs from "@/app/components/FieldTabs";
import FieldLabel from "@/app/components/FieldLabel";
import HoursInput from "@/app/components/HoursInput";
import Input from "@/app/components/Input";
import Select from "@/app/components/Select";
import WeekdayPicker from "@/app/components/WeekdayPicker";
import { TimeField } from "@/app/components/TimeInput";
import { ALL_WEEKDAYS } from "@/lib/weekdays";
import { type RecurrenceFreq } from "@/lib/taskRecurrence";
import type { RecurrenceInput } from "@/lib/taskService";

/** Der Bearbeitungs-Zustand der Wiederhol-Regel — Rohwerte, wie sie in den Feldern stehen. */
export interface RecurrenceValue {
  freq: RecurrenceFreq;
  interval: string;
  weekdayMask: number;
  ordinal: number;
  timeOfDay: string;
  startsOn: string; // "YYYY-MM-DD"
  until: string;    // "YYYY-MM-DD" oder ""
}

/** Vorbelegung: wöchentlich, alle Tage, 09:00, ab heute. `today` kommt server-gerechnet in der
 *  Sub-Zone herein (hydrations-sicher). */
export function initialRecurrence(today: string): RecurrenceValue {
  return { freq: "WEEKLY", interval: "1", weekdayMask: ALL_WEEKDAYS, ordinal: 2, timeOfDay: "09:00", startsOn: today, until: "" };
}

/** Frequenz → i18n-Schlüssel (Label bzw. Intervall-Einheit) — EINE Quelle, geteilt von diesem
 *  Formular und der Serien-Liste, statt in jeder Sicht ein Ternär oder einen zusammengesetzten
 *  Schlüssel. */
export const FREQ_LABEL_KEY: Record<RecurrenceFreq, string> = { DAILY: "freqDaily", WEEKLY: "freqWeekly", MONTHLY: "freqMonthly" };
export const FREQ_UNIT_KEY: Record<RecurrenceFreq, string> = { DAILY: "unitDays", WEEKLY: "unitWeeks", MONTHLY: "unitMonths" };
const FREQ_ORDER = ["DAILY", "WEEKLY", "MONTHLY"] as const;

/** Der Formatierer für einen Serien-Termin — Wochentag + Datum + Uhrzeit in der Sub-Zone. Geteilt
 *  von der Agenda-Vorschau und der Serien-Liste, damit beide dieselbe Schreibweise nennen. */
export function occurrenceFormatter(locale: string, tz: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat(toDateLocale(locale), { timeZone: tz, weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

const ORDINALS = [1, 2, 3, 4, 5, -1] as const;

/** Ein Tages-Datum als Instant in der Zone des Trägers — Mittag bzw. Tagesende, damit der Kalendertag
 *  über alle Zeitzonen erhalten bleibt (der Dienst zieht `startsOn` auf die lokale Mitternacht). */
function dateToInstant(date: string, endOfDay: boolean, tz: string): string | null {
  if (!date) return null;
  return fromDatetimeLocal(`${date}T${endOfDay ? "23:59" : "12:00"}`, tz).toISOString();
}

/** Der Zustand als Regel-Nutzlast für Dienst/Vorschau. Wochentage/Ordinal nur, wo sie zählen. */
export function recurrencePayload(v: RecurrenceValue, tz: string): RecurrenceInput {
  return {
    freq: v.freq,
    interval: Math.max(1, Math.round(Number(v.interval) || 1)),
    weekdayMask: v.freq === "DAILY" ? null : v.weekdayMask,
    ordinal: v.freq === "MONTHLY" ? v.ordinal : null,
    timeOfDay: v.timeOfDay,
    // Leeres Startdatum → leerer String (nicht „heute"): so überspringt die Agenda-Vorschau es und
    // der Dienst weist es ab, statt still auf heute auszuweichen.
    startsOn: dateToInstant(v.startsOn, false, tz) ?? "",
    until: dateToInstant(v.until, true, tz),
    exclusionDates: null,
  };
}

export default function RecurrenceFields({ value, onChange, tz }: {
  value: RecurrenceValue;
  onChange: (next: RecurrenceValue) => void;
  tz: string;
}) {
  const t = useTranslations("taskSeries");
  const startsOnId = useId();
  const untilId = useId();
  const set = (patch: Partial<RecurrenceValue>) => onChange({ ...value, ...patch });

  const intervalUnit = t(FREQ_UNIT_KEY[value.freq]);

  return (
    <div className="flex flex-col gap-3">
      <FieldTabs
        label={t("freqLabel")}
        value={value.freq}
        options={FREQ_ORDER.map((f) => ({ value: f, label: t(FREQ_LABEL_KEY[f]) }))}
        onChange={(freq) => set({ freq })}
      />

      <HoursInput
        label={t("intervalLabel")}
        ariaLabel={t("intervalLabel")}
        value={value.interval}
        onChange={(interval) => set({ interval })}
        min={1}
        step={1}
        unit={intervalUnit}
        required
      />

      {value.freq !== "DAILY" && (
        <div className="flex flex-col gap-1.5">
          <FieldLabel required>{t("weekdaysLabel")}</FieldLabel>
          <WeekdayPicker mask={value.weekdayMask} onChange={(weekdayMask) => set({ weekdayMask })} ariaLabel={t("weekdaysLabel")} />
        </div>
      )}

      {value.freq === "MONTHLY" && (
        <Select
          label={t("ordinalLabel")}
          value={String(value.ordinal)}
          onChange={(e) => set({ ordinal: Number(e.target.value) })}
          options={ORDINALS.map((o) => ({ value: String(o), label: t(o === -1 ? "ordinalLast" : "ordinalNth", { n: o }) }))}
        />
      )}

      <div className="flex flex-col gap-1.5">
        <FieldLabel required>{t("timeOfDayLabel")}</FieldLabel>
        <TimeField value={value.timeOfDay} disabled={false} onChange={(timeOfDay) => set({ timeOfDay })} ariaLabel={t("timeOfDayLabel")} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <FieldLabel htmlFor={startsOnId} required>{t("startsOnLabel")}</FieldLabel>
          <Input id={startsOnId} type="date" value={value.startsOn} onChange={(e) => set({ startsOn: e.target.value })} required />
        </div>
        <div className="flex flex-col gap-1.5">
          <FieldLabel htmlFor={untilId}>{t("untilLabel")}</FieldLabel>
          <Input id={untilId} type="date" value={value.until} onChange={(e) => set({ until: e.target.value })} min={value.startsOn || undefined} />
        </div>
      </div>
      <p className="text-xs text-foreground-faint">{t("recurrenceHint", { tz })}</p>
    </div>
  );
}
