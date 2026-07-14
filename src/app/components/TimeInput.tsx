"use client";

import { useState } from "react";
import { inlineInputCls } from "@/app/components/inputStyles";

/** Rohe, kontrollierte „HH:MM"-Eingabe im Inline-Stil der Admin-Settings. Für Formulare mit eigenem
 *  Speichern-Knopf; wer je Feld sofort committen will, nimmt {@link TimeInput}. */
export function TimeField({ value, disabled, onChange, onBlur, ariaLabel }: {
  value: string;
  disabled: boolean;
  onChange: (next: string) => void;
  onBlur?: () => void;
  ariaLabel: string;
}) {
  return (
    <input
      type="time"
      value={value}
      disabled={disabled}
      aria-label={ariaLabel}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      className={inlineInputCls}
    />
  );
}

/**
 * „HH:MM"-Eingabe, die erst beim Verlassen des Feldes committet — nicht bei jedem `onChange`.
 * `<input type="time">` liefert während des Tippens Zwischenstände (auch ""), die sonst je
 * Tastendruck einen Request auslösen und serverseitig als ungültige Zeit abprallen.
 *
 * `onCommit` meldet mit `false`, dass der Server den Wert abgelehnt hat — dann springt das Feld
 * auf `value` (den gespeicherten Stand) zurück.
 *
 * `value` ist die Server-Wahrheit: ändert sie sich (nach `router.refresh()`, durch eine parallele
 * Änderung oder weil eine Liste umsortiert wurde), wird der lokale Stand nachgezogen. Ohne diesen
 * Abgleich zeigte das Feld weiter den alten Wert und schriebe ihn beim nächsten Blur zurück.
 */
export default function TimeInput({ value, disabled, onCommit, ariaLabel }: {
  value: string;
  disabled: boolean;
  onCommit: (next: string) => Promise<boolean>;
  ariaLabel: string;
}) {
  const [local, setLocal] = useState(value);
  const [synced, setSynced] = useState(value);

  if (value !== synced) {
    setSynced(value);
    setLocal(value);
  }

  async function commit() {
    if (local === value) return;
    if (!(await onCommit(local))) setLocal(value);
  }

  return (
    <TimeField value={local} disabled={disabled} ariaLabel={ariaLabel} onChange={setLocal} onBlur={commit} />
  );
}
