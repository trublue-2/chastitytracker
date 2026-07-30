"use client";

import { useState } from "react";

/**
 * Lokaler Tippstand einer Eingabe, die erst beim Verlassen des Feldes committet: solange getippt
 * wird, gehört der Text dem Feld — nicht dem Aufrufer, der sonst jeden Zwischenstand (auch "")
 * sofort normalisieren würde.
 *
 * `value` bleibt die Wahrheit von aussen: ändert sie sich (gespeicherter Stand, Normalisierung
 * durch den Server, umsortierte Liste), wird der Entwurf nachgezogen. Ohne diesen Abgleich zeigte
 * das Feld weiter den alten Text und schriebe ihn beim nächsten Commit zurück.
 *
 * Genutzt von {@link TimeInput} und {@link NumberInput} — eine Fassung des Abgleichs statt einer je
 * Eingabetyp.
 */
export function useSyncedDraft(value: string | number): [string, (next: string) => void] {
  const [draft, setDraft] = useState(String(value));
  const [synced, setSynced] = useState(value);

  if (value !== synced) {
    setSynced(value);
    setDraft(String(value));
  }

  return [draft, setDraft];
}
