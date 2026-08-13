import OffenseCard from "@/app/components/OffenseCard";
import type { SubOffense } from "@/lib/subOffenses";

/** Eine Liste von Vergehens-Karten. Seit dem Wegfall der Strafbuch-Seite nur noch vom
 *  Dashboard-Block genutzt — bleibt eigenständig, weil die Trennung Liste/Karte den Block lesbar
 *  hält und ein zweiter Aufrufer (gefilterte Sicht) absehbar ist. */
export default function OffenseList({ offenses, tz }: { offenses: SubOffense[]; tz: string }) {
  return (
    <ul className="flex flex-col gap-2">
      {offenses.map((o) => (
        <li key={o.refId}>
          <OffenseCard offense={o} tz={tz} />
        </li>
      ))}
    </ul>
  );
}
