import type { ReactNode } from "react";
import { midnightAfterDays, tzDateParts, tzDayKey } from "@/lib/utils";
import BlockHeading from "@/app/components/BlockHeading";
import { blockInsetCls } from "@/app/components/inputStyles";

export interface DayGroupRow {
  /** Zeitpunkt der Zeile — bestimmt, in welchen Tag sie fällt. */
  at: Date;
  node: ReactNode;
}

/**
 * Ein `Intl.DateTimeFormat` je Beschriftungs-Form, nicht je Tagesgruppe.
 *
 * `toLocaleDateString` baut bei jedem Aufruf einen Wegwerf-Formatter — gemessen rund das
 * Vierzigfache dessen, was das Formatieren selbst kostet. Die Eintragsliste der Keyholderin lädt
 * bis zu hundert Zeilen und damit bis zu hundert Tagesköpfe; dieselbe Herleitung steht bei
 * `memoFormatter` in `lib/utils.ts`, dessen Cache aber nur nach Zeitzone schlägt und die Sprache
 * fest auf „en-US" legt — für eine sprachabhängige Beschriftung also nicht brauchbar.
 */
const dayFormatters = new Map<string, Intl.DateTimeFormat>();
function dayFormatter(locale: string, tz: string, withYear: boolean): Intl.DateTimeFormat {
  const key = `${locale}|${tz}|${withYear}`;
  let fmt = dayFormatters.get(key);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat(locale, {
      weekday: "short", day: "2-digit", month: "2-digit",
      ...(withYear ? { year: "numeric" } : {}),
      timeZone: tz,
    });
    dayFormatters.set(key, fmt);
  }
  return fmt;
}

/**
 * Eine Verlaufsliste, nach Kalendertagen gruppiert.
 *
 * Der Grund ist eine gestrichene Beschriftung, nicht eine hinzugefügte: bisher trug JEDE Zeile das
 * volle Datum, zwanzig Zeilen also zwanzigmal „25.08.2026, 14:12". Was sich über zwölf Zeilen nicht
 * ändert, ist keine Angabe der Zeile — es ist die Überschrift darüber. Übrig bleibt in der Zeile
 * die Uhrzeit, und die Liste bekommt einen Rhythmus, den zwanzig gleich schwere Zeilen nie haben.
 *
 * Kein Kasten: die Tage trennen sich durch Raum und eine Haarlinie. Ein Rahmen um die Liste
 * herum sagt nichts, was der Abstand nicht schon sagt — und ein Rahmen um jeden Tag DARIN
 * verdoppelt die Einzäunung.
 */
export default function DayGroups({
  rows,
  locale,
  tz,
  today,
  yesterday,
}: {
  rows: readonly DayGroupRow[];
  locale: string;
  tz: string;
  /** „Heute" und „Gestern" kommen vom Aufrufer: die Übersetzung liegt server- wie clientseitig
   *  vor, der Weg dorthin unterscheidet sich aber — und diese Komponente rendert in beiden. */
  today: string;
  yesterday: string;
}) {
  const now = new Date();
  const todayKey = tzDayKey(now, tz);
  // Über `midnightAfterDays`, NICHT über `now - 86_400_000`: an einem Zeitumstellungstag hat der
  // Tag 23 oder 25 Stunden, und der abgezogene Festbetrag landet dann im vorvorletzten bzw. noch
  // im heutigen Kalendertag. Der Tageskopf hiesse an genau zwei Tagen im Jahr „Gestern" über den
  // Zeilen von vorgestern.
  const yesterdayKey = tzDayKey(midnightAfterDays(now, tz, -1), tz);
  const thisYear = tzDateParts(now, tz).year;

  // Gruppiert wird über den WECHSEL des Tagesschlüssels, nicht über eine Karte — die Zeilen
  // kommen bereits sortiert (beide Aufrufer ordnen absteigend nach Zeit), und ein Lauf über die
  // Folge hält diese Ordnung bei, statt sie stillschweigend umzustellen.
  //
  // Käme derselbe Tag ein zweites Mal, entstünde eine zweite Gruppe mit demselben Schlüssel und
  // damit ein doppelter React-Key. Deshalb zählt der Schlüssel die Wiederholung mit: die Liste
  // sieht dann zwar zweimal denselben Tageskopf — das ist die richtige Anzeige für unsortierte
  // Eingabe —, aber sie rendert korrekt, statt eine Zeile beim nächsten Render zu verlieren.
  const groups: { id: string; key: string; label: string; rows: DayGroupRow[] }[] = [];
  for (const row of rows) {
    const key = tzDayKey(row.at, tz);
    if (groups.at(-1)?.key !== key) {
      groups.push({ id: `${key}#${groups.length}`, key, label: dayLabel(row.at, key), rows: [] });
    }
    groups.at(-1)!.rows.push(row);
  }

  function dayLabel(at: Date, key: string): string {
    if (key === todayKey) return today;
    if (key === yesterdayKey) return yesterday;
    // Das Jahr nur, wenn es nicht das laufende ist. „Mo, 25.08.2026" in einer Liste, die
    // ausschliesslich 2026 enthält, buchstabiert eine Konstante aus.
    const sameYear = tzDateParts(at, tz).year === thisYear;
    return dayFormatter(locale, tz, !sameYear).format(at);
  }

  return (
    <div className="flex flex-col">
      {groups.map((g) => (
        <section key={g.id} className="border-t border-border-subtle first:border-t-0">
          <BlockHeading as="h3" className={`${blockInsetCls} pt-5 pb-1`}>{g.label}</BlockHeading>
          <div className="flex flex-col">{g.rows.map((r) => r.node)}</div>
        </section>
      ))}
    </div>
  );
}
