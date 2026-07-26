"use client";

import { inlineInputCls } from "@/app/components/inputStyles";
import { useSyncedDraft } from "@/app/hooks/useSyncedDraft";
import { clampInputValue } from "@/lib/utils";

/**
 * Schmale Zahl-Eingabe im Inline-Stil der Admin-Settings, die den Tippstand roh stehen lässt und
 * erst beim Verlassen des Feldes klemmt und committet — das Gegenstück zu {@link TimeInput}.
 * Für die breiten Formular-Seiten gilt weiterhin `<Input type="number">` mit eigenem String-State.
 *
 * Wer je Tastendruck klemmt, macht das Feld unleerbar: `min` bzw. der Fallback hebt die gelöschte
 * Eingabe sofort wieder auf einen Wert. Auf dem Handy bleibt dadurch die erste Ziffer stehen und
 * aus einer getippten „20" wird „120".
 *
 * `onCommit` läuft nur bei echter Änderung — ein Blur ohne Eingabe löst keinen Speichervorgang aus.
 * Wie bei {@link TimeInput} darf es mit `false` melden, dass der Server den Wert abgelehnt hat; dann
 * springt das Feld auf `value` (den gespeicherten Stand) zurück. Wer nur lokalen State setzt (Formular
 * mit eigenem Speichern-Knopf), gibt nichts zurück.
 */
export default function NumberInput({ value, min, max, fallback = min, disabled, ariaLabel, onCommit }: {
  value: number;
  min: number;
  max: number;
  /** Wert, auf den eine leere Eingabe beim Commit fällt (Default: `min`). */
  fallback?: number;
  disabled: boolean;
  ariaLabel: string;
  onCommit: (next: number) => void | Promise<boolean>;
}) {
  const [draft, setDraft] = useSyncedDraft(value);

  async function commit() {
    const next = clampInputValue(draft, { min, max, fallback });
    setDraft(String(next));
    if (next === value) return;
    if ((await onCommit(next)) === false) setDraft(String(value));
  }

  return (
    <input
      type="number"
      inputMode="numeric"
      min={min}
      max={max}
      value={draft}
      disabled={disabled}
      aria-label={ariaLabel}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      className={inlineInputCls}
    />
  );
}
