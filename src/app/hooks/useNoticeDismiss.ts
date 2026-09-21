"use client";

import { useState } from "react";

/**
 * Das Wegklicken eines Hinweises, dessen Quittung am `User` liegt — geteilt vom Umstellungs-Hinweis
 * (`ChangeoverNotice`) und dem Hinweis zur Foto-Prüfung (`PhotoAnalysisNotice`).
 *
 * **Optimistisch geschlossen, ohne Erfolgsprüfung.** Schlägt der PATCH fehl, erscheint der Hinweis
 * beim nächsten Aufruf noch einmal — ein hinnehmbarer Ausgang und allemal besser, als den Nutzer vor
 * einem Fehlerdialog stehen zu lassen, den er nicht auflösen kann. Ein Hinweis ist kein Formular.
 *
 * **`keepalive`**, weil neben dem Knopf ein Link steht, der ebenfalls quittiert: ein Klick darauf
 * navigiert weg und schnitte die laufende Anfrage sonst ab — der Hinweis käme wieder. Dieselbe Form
 * nutzt `useLocaleSwitcher` aus demselben Grund.
 *
 * Die Route nimmt nur den AKTUELLEN Wert an (siehe die beiden `…-seen`-Routen). Liegt zwischen Anzeige
 * und Klick eine Änderung, wird die alte Quittung abgelehnt, und der neue Hinweis erscheint.
 */
export function useNoticeDismiss(url: string, body: Record<string, string>) {
  const [dismissed, setDismissed] = useState(false);

  function dismiss() {
    setDismissed(true);
    void fetch(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      keepalive: true,
    }).catch(() => { /* siehe oben: dann steht er beim nächsten Mal wieder da */ });
  }

  return { dismissed, dismiss };
}
