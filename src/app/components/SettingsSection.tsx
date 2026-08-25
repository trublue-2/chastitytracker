import type { ReactNode } from "react";
import Section from "@/app/components/Section";

interface Props {
  title: string;
  /** Kurze Erklärung, wofür dieser Abschnitt / diese Einstellungen da sind. Optional. */
  description?: string;
  /** Umschliesst die children mit dem Standard-Innenabstand. Für einfache Abschnitte. Komplexe
   *  Inhalte (eigene Struktur/Padding, z.B. Listen) lassen das weg und liefern den Abstand selbst. */
  bodyPadded?: boolean;
  children: ReactNode;
}

/**
 * Ein Einstellungs-Abschnitt: Rubrik, optionale Erklärung, dann die Zeilen.
 *
 * Er sass bisher in einer `Card` mit eigener Kopf-Leiste und Trennlinie darunter — auf der
 * Einstellungs-Seite der Keyholderin also ein Dutzend Kästen untereinander, jeder mit demselben
 * Rahmen um dieselbe Art Inhalt. Ein Rahmen, der auf jedem Abschnitt sitzt, gliedert nicht mehr;
 * er ist nur noch Rauschen zwischen den Zeilen, auf die es ankommt.
 *
 * Jetzt trennen Abstand und Rubrik. Die Zeilen darin behalten ihre eigenen Haarlinien.
 */
export default function SettingsSection({ title, description, bodyPadded, children }: Props) {
  return (
    <Section
      title={title}
      className="border-t border-border-subtle pt-4 first:border-t-0 first:pt-0"
    >
      {description && <p className="text-neben text-foreground-muted -mt-1">{description}</p>}
      {bodyPadded ? <div className="px-1 py-1">{children}</div> : children}
    </Section>
  );
}
