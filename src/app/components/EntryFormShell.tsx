import type { ReactNode } from "react";
import Card from "@/app/components/Card";
import FormActions from "@/app/components/FormActions";

/**
 * Einheitliche Hülle aller Erfassungs-/Bearbeitungs-Formulare: die Felder stehen in einer Card,
 * darunter die (auf Mobile klebende) Aktions-Zeile via {@link FormActions}. Vorher baute jedes
 * Formular diese Hülle selbst — mit Drift (Card-Abstand, `<form>` vs `<div>`). Diese Komponente
 * hält Struktur und Abstände an EINER Stelle, damit alle (+)-Formulare identisch aussehen.
 *
 * Der Speichern-Button ist formularspezifisch (Farbe/Icon/Label/loading/disabled) → `actions`-Slot.
 * `onSubmit` weglassen für Formulare, die per Button-`onClick` statt nativem Submit speichern
 * (z.B. Bildersafe) → dann rendert die Hülle ein `<div>` statt `<form>`.
 *
 * Auf Mobile ist die Aktions-Zeile ({@link FormActions}) `fixed` am unteren Rand; darum reserviert die
 * Hülle unten ~8.5rem Platz (Höhe zweier gestapelter Buttons + Ränder), damit das letzte Feld beim
 * Scrollen frei über der Leiste steht. Am Desktop steht die Zeile in-flow → kein Reserve-Platz.
 */
// Muss die gerenderte Höhe der fixen FormActions-Leiste decken: zwei gestapelte Buttons (je min-h-12
// = 3rem) + gap-2 + pt-3 + Border ≈ 8rem; 8.5rem gibt etwas Luft. Ändert sich das Button-Layout in
// FormActions, hier mitziehen. Der 1-Button-Fall (Bildersafe) über-reserviert nur harmlos.
const RESERVE = "pb-[calc(8.5rem+env(safe-area-inset-bottom))] sm:pb-0";
export default function EntryFormShell({
  onSubmit,
  children,
  actions,
  onCancel,
  cancelLabel,
}: {
  onSubmit?: (e: React.FormEvent) => void;
  children: ReactNode;
  actions: ReactNode;
  onCancel?: () => void;
  cancelLabel?: string;
}) {
  const body = (
    <>
      <Card className="flex flex-col gap-5">{children}</Card>
      <FormActions onCancel={onCancel} cancelLabel={cancelLabel}>
        {actions}
      </FormActions>
    </>
  );

  return onSubmit ? (
    <form onSubmit={onSubmit} className={`flex flex-col gap-4 ${RESERVE}`}>
      {body}
    </form>
  ) : (
    <div className={`flex flex-col gap-4 ${RESERVE}`}>{body}</div>
  );
}
