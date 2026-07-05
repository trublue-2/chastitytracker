import type { ReactNode } from "react";
import Card from "@/app/components/Card";

interface Props {
  title: string;
  /** Kurze Erklärung, wofür dieser Abschnitt / diese Einstellungen da sind. Optional. */
  description?: string;
  /** Umschliesst die children mit dem Standard-Innenabstand (`px-5 py-4`). Für einfache Abschnitte.
   *  Komplexe Inhalte (eigene Struktur/Padding, z.B. Listen) lassen das weg und liefern den Abstand selbst. */
  bodyPadded?: boolean;
  children: ReactNode;
}

/** Standard-Einstellungs-Abschnitt im Admin-Bereich: Card mit Titel-Zeile und optionaler Beschreibung
 *  darunter, dann der Inhalt. Ersetzt das zuvor vielfach duplizierte Card-Header-Markup und sorgt dafür,
 *  dass jede Abschnitts-Beschreibung einheitlich an derselben Stelle (unter dem Titel) sitzt. */
export default function SettingsSection({ title, description, bodyPadded, children }: Props) {
  return (
    <Card padding="none" className="overflow-hidden">
      <div className="px-5 py-3 border-b border-border-subtle">
        <p className="text-xs font-semibold uppercase tracking-wider text-foreground-faint">{title}</p>
        {description && <p className="text-xs text-foreground-muted mt-1">{description}</p>}
      </div>
      {bodyPadded ? <div className="px-5 py-4">{children}</div> : children}
    </Card>
  );
}
