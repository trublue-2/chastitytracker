import type { ReactNode } from "react";
import DetailField from "@/app/components/DetailField";

/**
 * FREMDER Text, zitiert — die Zeile mit der Kante links.
 *
 * Die Figur stand dreimal Klasse für Klasse abgeschrieben: an der Referenz einer Posteingangs-Zeile,
 * an der Stellungnahme des Trägers und im Urteils-Formular des Strafbuchs, wo dieselbe Stellungnahme
 * ein zweites Mal erscheint. Sie alle zeigen dasselbe: Worte, die jemand anders geschrieben hat und
 * die hier weder übersetzt noch umformuliert werden. Die Kante sagt genau das — sie ist die
 * neutrale Schwester von `warnEdgeCls`, die eine gerissene Frist markiert.
 */
export function Quote({ children }: { children: ReactNode }) {
  return <p className="text-sm text-foreground-muted whitespace-pre-wrap border-l-2 border-border pl-3">{children}</p>;
}

/**
 * Ein beschriftetes Feld, dessen Wert ein Zitat ist — mit einer leisen Ersatzzeile, wo nichts steht.
 *
 * Der leere Fall gehört dazu und ist nicht dasselbe wie „kein Feld": „nichts gesagt" ist eine
 * Aussage, das Fehlen des Feldes wäre keine.
 */
export default function QuotedField({
  label,
  text,
  empty,
}: {
  label: string;
  text: string | null;
  /** Was anstelle des Zitats steht, solange es keines gibt. */
  empty: string;
}) {
  return (
    <DetailField label={label}>
      {text ? <Quote>{text}</Quote> : <p className="text-sm text-foreground-faint italic">{empty}</p>}
    </DetailField>
  );
}
