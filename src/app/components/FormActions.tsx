import type { ReactNode } from "react";
import Button from "@/app/components/Button";

/**
 * Einheitliche Aktions-Zeile der Erfassungs-/Bearbeitungs-Formulare: primärer Speichern-Button oben,
 * Abbrechen als leichterer Ghost-Button darunter (Mobile) bzw. links daneben (Desktop). Vorher baute
 * jedes Formular seine Zeile selbst — teils gestapelt, teils nebeneinander, auf Mobile inkonsistent.
 *
 * Der Speichern-Button ist formularspezifisch (Farbe/Icon/Label/loading) und kommt als `children`;
 * das Abbrechen und das Layout gehören hierher. `onCancel` weglassen, wenn ein Formular keinen
 * Abbrechen-Button hat (z.B. Bildersafe) — dann entfällt `cancelLabel`.
 *
 * Auf Mobile klebt die Zeile am unteren Rand (`sticky bottom-0`), der Rest des Formulars scrollt
 * dahinter — so ist Speichern immer erreichbar, ohne dass ein fixes Element wie die Menüleiste den
 * Button verdeckt. Die Zeile steht am ENDE des Formular-Flusses (ausserhalb der Feld-Card), also ist
 * beim Erreichen des Endes kein Feld verdeckt. Hintergrund = Seitenhintergrund + Hairline oben: der
 * Inhalt verschwindet sauber an der Kante. Am Desktop kein Sticky nötig (Sidebar, kein
 * Überlappungsproblem) → normale Zeile.
 */
export default function FormActions({
  children,
  onCancel,
  cancelLabel,
}: {
  children: ReactNode;
  onCancel?: () => void;
  cancelLabel?: string;
}) {
  return (
    <div
      className={
        "sticky bottom-0 z-30 flex flex-col gap-2 border-t border-border bg-background pt-3 " +
        "pb-[calc(0.75rem+env(safe-area-inset-bottom))] " +
        "sm:static sm:flex-row-reverse sm:border-0 sm:bg-transparent sm:pt-1 sm:pb-0"
      }
    >
      {children}
      {onCancel && (
        <Button type="button" variant="ghost" fullWidth onClick={onCancel}>
          {cancelLabel}
        </Button>
      )}
    </div>
  );
}
