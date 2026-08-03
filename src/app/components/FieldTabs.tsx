"use client";

import { useId } from "react";
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
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  const labelId = useId();
  return (
    <div className="flex flex-col gap-2">
      <FieldLabel id={labelId}>{label}</FieldLabel>
      <Tabs
        variant="segmented"
        tabs={options.map((o) => ({ key: o.value, label: o.label }))}
        activeTab={value}
        // Der Cast lebt hier an EINER Stelle: `Tabs` spricht `string`, die Aufrufer denken in ihrer
        // eigenen Union. Ohne den Wrapper stünde derselbe Cast bei jedem Aufrufer.
        onChange={(key) => onChange(key as T)}
        className="w-full"
        aria-labelledby={labelId}
      />
    </div>
  );
}
