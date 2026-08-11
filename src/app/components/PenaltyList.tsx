import PenaltyCard from "@/app/components/PenaltyCard";
import type { SubPenalty } from "@/lib/openPenalties";

/** Eine Liste von Strafen-Karten. Steht wörtlich gleich im Dashboard-Block und auf der
 *  Strafen-Seite — die Projektregel kennt für gleichen JSX in zwei Dateien keine Grösse, ab der er
 *  bleiben darf. */
export default function PenaltyList({ penalties, tz }: { penalties: SubPenalty[]; tz: string }) {
  return (
    <ul className="flex flex-col gap-2">
      {penalties.map((p) => (
        <li key={p.refId}>
          <PenaltyCard penalty={p} tz={tz} />
        </li>
      ))}
    </ul>
  );
}
