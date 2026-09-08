"use client";

import { useId, type ReactNode } from "react";
import FieldLabel from "./FieldLabel";
import Tabs from "./Tabs";

/**
 * Beschrifteter Umschalter über die volle Breite („Dauer / Zeitpunkt", „sofort / verzögert / …").
 *
 * Bewusst ein dünner Aufsatz auf {@link Tabs} statt einer eigenen Implementierung: die lokale Fassung
 * in `VerschlussAnforderungFields` hatte weder `role="tablist"` noch Pfeiltasten-Navigation, Fokusring
 * oder ausreichende Trefferfläche. Eine dritte Segmented-Control neben `Tabs` und jener Fassung zum
 * offiziellen Primitive zu machen, wäre genau die Duplikation, die die Repo-Regel verhindern soll.
 *
 * Das Label ist per `aria-labelledby` an die Gruppe gebunden — ein blosses `<label>` daneben ist für
 * Assistenztechnik nicht mit den Optionen verknüpft.
 */
export default function FieldTabs<T extends string>({
  label,
  ariaLabel,
  labelInfo,
  value,
  options,
  onChange,
  required,
}: {
  /** Sichtbare Beschriftung über der Gruppe. Weglassen, wo sie schon DARÜBER steht — ein
   *  Einheiten-Umschalter unter einem Umschalter der Antwort-Art wiederholte sonst dessen gerade
   *  gewählten Reiter („Dauer" über „Dauer"). Dann ist `ariaLabel` Pflicht: namenlos bleiben darf
   *  die Gruppe nie. */
  label?: string;
  /** Name der Gruppe für Assistenztechnik, wo `label` fehlt. */
  ariaLabel?: string;
  /** Eine seltene Erklärung zur Gruppe, hinter ein ⓘ neben der Beschriftung — statt einer grauen
   *  Dauerzeile darunter (siehe {@link InfoDot}). Nur mit sichtbarem `label`. */
  labelInfo?: ReactNode;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  /** Beschriftet die Gruppe ein PFLICHTfeld? Der Umschalter selbst ist immer gesetzt — gemeint ist
   *  das Feld darunter, dessen Beschriftung diese hier ist. */
  required?: boolean;
}) {
  const labelId = useId();
  return (
    <div className="flex flex-col gap-2">
      {label && <FieldLabel id={labelId} required={required} info={labelInfo}>{label}</FieldLabel>}
      <Tabs
        variant="segmented"
        tabs={options.map((o) => ({ key: o.value, label: o.label }))}
        activeTab={value}
        // Der Cast lebt hier an EINER Stelle: `Tabs` spricht `string`, die Aufrufer denken in ihrer
        // eigenen Union. Ohne den Wrapper stünde derselbe Cast bei jedem Aufrufer.
        onChange={(key) => onChange(key as T)}
        className="w-full"
        {...(label ? { "aria-labelledby": labelId } : { "aria-label": ariaLabel })}
      />
    </div>
  );
}
