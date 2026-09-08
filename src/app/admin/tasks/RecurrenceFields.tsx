"use client";

import { useId } from "react";
import { useTranslations } from "next-intl";
import FieldTabs from "@/app/components/FieldTabs";
import FieldLabel from "@/app/components/FieldLabel";
import HoursInput from "@/app/components/HoursInput";
import Input from "@/app/components/Input";
import Select from "@/app/components/Select";
import WeekdayPicker from "@/app/components/WeekdayPicker";
import { TimeField } from "@/app/components/TimeInput";
import { FREQ_LABEL_KEY, FREQ_UNIT_KEY, FREQ_ORDER, type RecurrenceValue } from "@/lib/recurrenceForm";

// Die reine Form-Logik (Zustand ⇄ Nutzlast, Formatierer, Vorbelegung) liegt in `@/lib/recurrenceForm`
// — sie wird auch vom SERVER gebraucht (Serien-Bearbeitung befüllt vor). Hier steht nur die Eingabe.

const ORDINALS = [1, 2, 3, 4, 5, -1] as const;

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
