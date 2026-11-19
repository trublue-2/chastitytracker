/**
 * Das Merkmal einer Formular-Seite ohne die Leiste selbst — für den Lade-Zustand der Erfassungs-
 * Routen. Ohne es stand während des Ladens die Navigation da und verschwand erst, wenn das Formular
 * mit seiner Speichern-Leiste (`FormActions`, `data-form-actions`) eingehängt war.
 */
export default function FormMarker() {
  return <div data-form-actions hidden />;
}
