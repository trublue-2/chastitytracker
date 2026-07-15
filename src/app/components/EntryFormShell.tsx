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
 */
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
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {body}
    </form>
  ) : (
    <div className="flex flex-col gap-4">{body}</div>
  );
}
