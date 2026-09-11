import OffenseCard from "@/app/components/OffenseCard";
import type { SubOffense } from "@/lib/subOffenses";
import type { StatementView } from "@/lib/offenseStatementService";

/** Eine Liste von Vergehens-Karten — geteilt vom Strafen-Block des Sub-Dashboards und vom Block
 *  „Offene Vergehen und Strafen" der Keyholder-Sub-Übersicht (`keyholderOf`). */
export default function OffenseList({ offenses, tz, keyholderOf = null, statements }: {
  offenses: SubOffense[];
  tz: string;
  /** Siehe `OffenseCard` — gesetzt in der Keyholder-Sicht. */
  keyholderOf?: string | null;
  /** Die Stellungnahmen je `refId` (`loadStatementViews`). */
  statements: Map<string, StatementView>;
}) {
  return (
    <ul className="flex flex-col gap-2">
      {offenses.map((o) => (
        <li key={o.refId}>
          <OffenseCard offense={o} tz={tz} keyholderOf={keyholderOf} statement={statements.get(o.refId) ?? null} />
        </li>
      ))}
    </ul>
  );
}
