"use client";

import { useTranslations } from "next-intl";
import { toDatetimeLocal, fromDatetimeLocal } from "@/lib/utils";
import DateTimePicker from "@/app/components/DateTimePicker";
import FieldTabs from "@/app/components/FieldTabs";
import Input from "@/app/components/Input";
import Select from "@/app/components/Select";

/**
 * Die TERMINIERUNG einer Direktive — sofort, verzögert oder auf einen Zeitpunkt.
 *
 * Ein Bauteil, weil es dieselbe Frage an mehreren Formularen ist: Verschluss-Anforderung, Sperrzeit
 * und Aufgabe schicken alle dasselbe Feldpaar (`delayMinutes` / `wirksamAbAt`) an dieselbe
 * Zeit-Politik (`computeDelayedTrigger`). Als Kopie im zweiten Formular wären es drei Zustände, eine
 * Umrechnung und eine Zukunfts-Prüfung, die von da an zweimal gepflegt werden müssten — genau die
 * Sorte Doppelung, bei der die eine Stelle irgendwann Minuten schickt, wo die andere Stunden meint.
 *
 * Die HINWEIS-Texte kommen von aussen: sie benennen die Direktive („Anforderung wird versendet" vs.
 * „Aufgabe wird gestellt"), und ein gemeinsamer Text müsste dafür so allgemein werden, dass er
 * nichts mehr sagt. Alles andere — Beschriftung, Reiter, Einheiten — steht im `admin`-Namensraum,
 * in dem ohnehin jeder Verwender lebt.
 */
type ScheduleMode = "immediate" | "delay" | "datetime";

export interface ScheduleValue {
  mode: ScheduleMode;
  /** Rohwert des Zahlenfeldes — bewusst als String, wie jede andere Eingabe dieses Formulars. */
  delayValue: string;
  delayUnit: "minutes" | "hours";
  /** `datetime-local`-Wert in der Zeitzone des Subs. */
  scheduledAt: string;
}

/**
 * Der Startzustand: sofort, mit vorbelegter Verzögerung und einem Zeitpunkt eine Stunde voraus.
 *
 * Gerechnet wird ab `minNow` — der SERVER-Uhr in der Zone des Subs, nicht `Date.now()`: sonst
 * unterscheidet sich der Wert zwischen Server-Render und Hydrierung. Das Bauteil leitet die
 * Millisekunden selbst ab, damit kein Aufrufer dieselbe Umrechnung noch einmal hinschreibt.
 */
export function initialSchedule(minNow: string, tz: string): ScheduleValue {
  return {
    mode: "immediate",
    delayValue: "30",
    delayUnit: "minutes",
    scheduledAt: toDatetimeLocal(new Date(fromDatetimeLocal(minNow, tz).getTime() + 60 * 60 * 1000), tz),
  };
}

/** Liegt ein gewählter Zeitpunkt in der Vergangenheit? Nur dann ist die Eingabe abzulehnen — eine
 *  Verzögerung kann per Konstruktion nicht rückwärts zeigen. */
export function scheduleIsPast(v: ScheduleValue, tz: string): boolean {
  return v.mode === "datetime" && !!v.scheduledAt && fromDatetimeLocal(v.scheduledAt, tz) <= new Date();
}

/**
 * Der NULLPUNKT, ab dem die Fristen dieser Direktive laufen — der geplante Auslöse-Zeitpunkt, sonst
 * „jetzt".
 *
 * Gebraucht von jedem Formular, das eine SPANNE eingibt („endet in 2 Stunden"): terminiert bedeutet
 * das zwei Stunden ab dem Auslösen, nicht ab dem Ausfüllen. Ab „jetzt" gerechnet schrumpfte die
 * Spanne um die Verzögerung — bei einer Verzögerung grösser als der Frist bliebe gar nichts übrig.
 */
export function scheduleAnchorMs(v: ScheduleValue, tz: string, nowMs: number): number {
  const { wirksamAbAt, delayMinutes } = schedulePayload(v, tz);
  if (wirksamAbAt) return new Date(wirksamAbAt).getTime();
  if (delayMinutes) return nowMs + delayMinutes * 60_000;
  return nowMs;
}

/**
 * Die Felder, die der Server erwartet — leer bei „sofort".
 *
 * Als Objekt und nicht als Mutation des Payloads: so bleibt am Aufrufer sichtbar, WAS die
 * Terminierung beisteuert, und beide Formulare schicken garantiert dieselben zwei Namen.
 */
export function schedulePayload(v: ScheduleValue, tz: string): { wirksamAbAt?: string; delayMinutes?: number } {
  if (v.mode === "datetime" && v.scheduledAt) {
    return { wirksamAbAt: fromDatetimeLocal(v.scheduledAt, tz).toISOString() };
  }
  if (v.mode === "delay") {
    const n = parseFloat(v.delayValue) || 0;
    return { delayMinutes: v.delayUnit === "hours" ? n * 60 : n };
  }
  return {};
}

export default function ScheduleFields({
  value,
  onChange,
  minNow,
  delayHint,
  atHint,
}: {
  value: ScheduleValue;
  onChange: (next: ScheduleValue) => void;
  /** Server-gerechnetes „jetzt" in der Zeitzone des Subs — die untere Schranke des Wählers. */
  minNow: string;
  /** „… wird nach dieser Verzögerung ausgelöst; bis dahin unsichtbar." */
  delayHint: string;
  /** „… wird zu diesem Zeitpunkt ausgelöst; bis dahin unsichtbar." */
  atHint: string;
}) {
  const t = useTranslations("admin");
  const set = (patch: Partial<ScheduleValue>) => onChange({ ...value, ...patch });

  return (
    <>
      <FieldTabs
        label={t("schedulingLabel")}
        value={value.mode}
        onChange={(mode) => set({ mode })}
        options={[
          { value: "immediate", label: t("scheduleImmediate") },
          { value: "delay", label: t("scheduleDelay") },
          { value: "datetime", label: t("scheduleAt") },
        ]}
      />

      {value.mode === "delay" && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <div className="w-24">
              <Input
                type="number"
                value={value.delayValue}
                onChange={(e) => set({ delayValue: e.target.value })}
                min={1}
                step={1}
              />
            </div>
            <Select
              options={[
                { value: "minutes", label: t("scheduleDelayMinutes") },
                { value: "hours", label: t("scheduleDelayHours") },
              ]}
              value={value.delayUnit}
              onChange={(e) => set({ delayUnit: e.target.value as ScheduleValue["delayUnit"] })}
            />
          </div>
          <span className="text-xs text-foreground-faint">{delayHint}</span>
        </div>
      )}

      {value.mode === "datetime" && (
        <DateTimePicker
          value={value.scheduledAt}
          onChange={(e) => set({ scheduledAt: e.target.value })}
          min={minNow}
          hint={atHint}
        />
      )}
    </>
  );
}
