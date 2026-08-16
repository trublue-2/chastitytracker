"use client";

import { useTranslations } from "next-intl";
import { toDatetimeLocal, fromDatetimeLocal } from "@/lib/utils";
import DateTimePicker from "@/app/components/DateTimePicker";
import DurationInput from "@/app/components/DurationInput";
import FieldTabs from "@/app/components/FieldTabs";
import { durationToHours, type DurationUnit } from "@/lib/constants";

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
 * nichts mehr sagt. Alles andere — Beschriftung und Reiter — steht im `admin`-Namensraum, in dem
 * ohnehin jeder Verwender lebt.
 *
 * Die VERZÖGERUNG ist eine Dauer wie jede andere und nimmt deshalb {@link DurationInput}: vorher
 * stand die Einheiten-Frage zweimal im selben Formular, oben als Reiter (Frist) und hier als
 * Dropdown, auf einem Scroll-Weg. Mit dem Bauteil kommt sein 5-Minuten-Raster mit — „in 3 Minuten"
 * entfällt und ist für eine Terminierung keine Grenze, an der etwas hängt.
 */
type ScheduleMode = "immediate" | "delay" | "datetime";

export interface ScheduleValue {
  mode: ScheduleMode;
  /** Rohwert des Zahlenfeldes — bewusst als String, wie jede andere Eingabe dieses Formulars. */
  delayValue: string;
  delayUnit: DurationUnit;
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
    delayUnit: "min",
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
 * Wandert der Nullpunkt mit der Uhr? — die Frage, die jede Zeitvorschau über ihm stellen muss.
 *
 * Nur ein ABSOLUTER Zeitpunkt steht still; „sofort" und „in 20 Minuten" rücken beide mit jeder
 * Minute Formularausfüllen weiter. Hier und nicht am Aufrufer, weil es dieselbe Fallunterscheidung
 * ist wie in {@link scheduleAnchorMs} — zweimal geschrieben liefe die eine irgendwann der anderen
 * hinterher, und eine Vorschau bliebe stehen oder tickte grundlos.
 */
export function scheduleAnchorLive(v: ScheduleValue, tz: string): boolean {
  return !schedulePayload(v, tz).wirksamAbAt;
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
    // Gerundet, weil der Server ganze Minuten erwartet.
    return { delayMinutes: Math.round(durationToHours(n, v.delayUnit) * 60) };
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
  // „Dauer" und „Zeitpunkt" sind das Vokabular JEDER Zeit-Eingabe und stehen deshalb in `common` —
  // nicht dreimal je Formular-Namensraum.
  const tc = useTranslations("common");
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
          { value: "datetime", label: tc("pointInTime") },
        ]}
      />

      {value.mode === "delay" && (
        <div className="flex flex-col gap-1.5">
          <DurationInput
            // Ohne sichtbare Beschriftung: der Reiter darüber heisst schon „Verzögert", und
            // „Verzögerung" darunter sagte dasselbe Wort ein zweites Mal. Einen NAMEN braucht die
            // Gruppe trotzdem — sonst steht dort ein Umschalter ohne Zugehörigkeit.
            ariaLabel={t("scheduleDelayLabel")}
            value={value.delayValue}
            unit={value.delayUnit}
            onChange={(delayValue, delayUnit) => set({ delayValue, delayUnit })}
          />
          <span className="text-xs text-foreground-faint">{delayHint}</span>
        </div>
      )}

      {/* `required`: ein LEERES Feld im Zeitpunkt-Reiter schickte bisher „sofort" ab —
          `schedulePayload` fällt ohne Wert auf `{}` zurück, und `scheduleIsPast` sieht bei leerem
          Feld nichts Vergangenes. Wer terminieren wollte und das Feld leerte, stellte damit
          unbemerkt sofort zu; bei einer Direktive, deren ganzer Zweck das Verbergen ist, ist das die
          teuerste Fehlbedienung des Formulars. */}
      {value.mode === "datetime" && (
        <DateTimePicker
          value={value.scheduledAt}
          onChange={(e) => set({ scheduledAt: e.target.value })}
          min={minNow}
          hint={atHint}
          required
        />
      )}
    </>
  );
}
