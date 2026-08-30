/**
 * Die Überschrift einer Seite, die es zweimal gibt — einmal für den Träger, einmal als Reiter der
 * Keyholderin.
 *
 * **Die Ebene ist keine Gestaltungsfrage, sondern eine Regel:** im Keyholder-Reiter trägt
 * `admin/users/[id]/layout.tsx` mit dem Namen des Trägers schon die Ebene 1, eine zweite gäbe der
 * Seite zwei Wurzeln. `subjectId` ist genau dieses Signal — gesetzt heisst „hier werden fremde
 * Daten verwaltet", und dieselbe Angabe steuert auf diesen Seiten bereits die Ziel-Adressen.
 *
 * Die Regel gilt repoweit und stand wörtlich in zwei Dateien, samt ihrem erklärenden Kommentar. Ein
 * doppelter Kommentar ist das deutlichste Zeichen, dass die Entscheidung an EINEN Ort gehört: die
 * dritte Seite, die einen Keyholder-Reiter bekommt, hätte sie ein drittes Mal abgeschrieben oder
 * falsch gemacht.
 */
export default function PageTitle({
  title,
  subjectId,
}: {
  title: string;
  /** Der fremde Träger, dessen Daten die Seite zeigt — `undefined` in der eigenen Sicht. */
  subjectId?: string;
}) {
  const cls = "text-xl font-bold text-foreground";
  return subjectId ? <h2 className={cls}>{title}</h2> : <h1 className={cls}>{title}</h1>;
}
