import OffenseCard from "@/app/components/OffenseCard";
import type { SubOffense } from "@/lib/subOffenses";

/** Eine Liste von Vergehens-Karten. Steht wörtlich gleich im Dashboard-Block und auf der
 *  Strafbuch-Seite — die Projektregel kennt für gleichen JSX in zwei Dateien keine Grösse, ab der
 *  er bleiben darf. */
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
