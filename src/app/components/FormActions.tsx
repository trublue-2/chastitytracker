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
 * Auf Mobile ist die Zeile `fixed` am unteren Bildschirmrand verankert — NICHT `sticky`: Sticky heftet
 * nur bei Scroll-Überhang an den Viewport-Boden, ein kurzes Formular liesse die Zeile in der
 * Bildschirmmitte am Inhaltsende schweben (und beim Tastatur-Öffnen genau dort stehen). `fixed` hält
 * Speichern immer unten erreichbar. Der Rest des Formulars scrollt dahinter; {@link EntryFormShell}
 * reserviert unten den nötigen Platz, damit kein Feld verdeckt wird. Am Desktop kein Overlay nötig
 * (Sidebar, kein Überlappungsproblem) → normale Zeile am Ende des Formular-Flusses.
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
        "fixed inset-x-0 bottom-0 z-30 flex flex-col gap-2 border-t border-border bg-background px-4 pt-3 " +
        "pb-[calc(0.75rem+env(safe-area-inset-bottom))] " +
        "sm:static sm:z-auto sm:flex-row-reverse sm:border-0 sm:bg-transparent sm:px-0 sm:pt-1 sm:pb-0"
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
