import { prisma } from "@/lib/prisma";
import { round1 } from "@/lib/utils";

/**
 * Die Wiege-Einträge als LISTE — eine Zeile je Messung, mit allem, was an ihr hängt.
 *
 * Das Diagramm der Statistik-Karte kannte bisher nur `{dayKey, weightKg, inWindow}`; Foto, Notiz,
 * Uhrzeit und vor allem der GELESENE Wert der Waagen-Erkennung standen in der Datenbank, ohne dass
 * eine Oberfläche sie zeigte. Genau die Spalte, die eine Korrektur sichtbar macht (`detectedKg`
 * neben `weightKg`), war die unsichtbarste.
 *
 * Hier und nicht je Seite: die Liste erscheint an zwei Orten — in der Statistik-Karte (der Träger
 * schaut auf seine Kurve) und eingemischt in die Eintragsliste der Keyholderin (sie schaut auf den
 * Tagesverlauf). Zwei Ableitungen derselben Zeile liefen auseinander, und die Veränderung zum
 * Vorwert wäre an einem der beiden Orte irgendwann eine andere Zahl.
 */

export const WEIGHT_ROW_SELECT = {
  id: true,
  dayKey: true,
  measuredAt: true,
  weightKg: true,
  inWindow: true,
  imageUrl: true,
  imageExifTime: true,
  imagePrunedAt: true,
  detectedKg: true,
  note: true,
  source: true,
} as const;

/** Eine Messung, wie eine Zeile sie braucht. `deltaKg` kommt aus {@link withDeltas}. */
export interface WeightRowData {
  id: string;
  dayKey: string;
  measuredAt: Date;
  weightKg: number;
  inWindow: boolean;
  imageUrl: string | null;
  imageExifTime: Date | null;
  imagePrunedAt: Date | null;
  detectedKg: number | null;
  note: string | null;
  source: string;
  /** Veränderung zur VORHERIGEN Messung — `null` bei der ersten. */
  deltaKg: number | null;
}

type WeightRowInput = Omit<WeightRowData, "deltaKg">;

/**
 * Die Veränderung zum jeweils vorherigen Wert, aufsteigend gerechnet.
 *
 * Erwartet die Zeilen **aufsteigend** und gibt sie so zurück — wer absteigend anzeigt, dreht danach
 * um. Die Rechnung selbst muss vorwärts laufen: „−0,3" heisst, dass er gegenüber dem Wert DAVOR
 * abgenommen hat, und diese Aussage kippt beim Umdrehen der Reihenfolge ins Gegenteil.
 *
 * `round1`, weil die Differenz zweier Fliesskommazahlen sonst als `-0.29999999999999716` erscheint —
 * die Werte selbst bleiben in voller Genauigkeit gespeichert (docs/gewicht-konzept.md, 3.1).
 */
export function withDeltas(ascending: readonly WeightRowInput[]): WeightRowData[] {
  return ascending.map((row, i) => ({
    ...row,
    deltaKg: i === 0 ? null : noNegativeZero(round1(row.weightKg - ascending[i - 1].weightKg)),
  }));
}

/** `-0` ist in JavaScript eine eigene Zahl, und jede Formatierung schreibt sie als „−0" aus: bei
 *  gleichem Gewicht an zwei Tagen stünde dort ein Minuszeichen ohne Veränderung dahinter. */
function noNegativeZero(v: number): number {
  return v === 0 ? 0 : v;
}

/**
 * Die Zeilen eines Trägers, **absteigend** (jüngste zuerst) — die Reihenfolge beider Listen.
 *
 * `from` (einschliessend) und `before` (ausschliessend) grenzen den ANGEZEIGTEN Ausschnitt ein,
 * nicht die Rechnung: geladen wird zusätzlich die letzte Messung VOR dem Fenster, damit die oberste
 * Zeile ihre Veränderung kennt. Ohne sie begänne jede Seite der Eintragsliste mit einem leeren
 * Delta — und beim Blättern sähe dieselbe Messung mal eine Veränderung und mal keine.
 *
 * Die obere Grenze ist ausschliessend, damit aneinandergrenzende Fenster lückenlos UND
 * überschneidungsfrei aufeinanderfolgen: was `before` ausschliesst, zeigt genau das Nachbarfenster,
 * dessen `from` derselbe Zeitpunkt ist.
 */
export async function loadWeightRows(
  userId: string,
  window: { from?: Date; before?: Date } = {},
): Promise<WeightRowData[]> {
  const { from, before } = window;
  const [inWindowRows, previous] = await Promise.all([
    prisma.weightEntry.findMany({
      where: { userId, measuredAt: { ...(from ? { gte: from } : {}), ...(before ? { lt: before } : {}) } },
      orderBy: { measuredAt: "asc" },
      select: WEIGHT_ROW_SELECT,
    }),
    from
      ? prisma.weightEntry.findFirst({
          where: { userId, measuredAt: { lt: from } },
          orderBy: { measuredAt: "desc" },
          select: WEIGHT_ROW_SELECT,
        })
      : Promise.resolve(null),
  ]);

  const withPrevious = previous ? [previous, ...inWindowRows] : inWindowRows;
  const rows = withDeltas(withPrevious);
  // Der Vorgänger war nur Rechenhilfe — angezeigt wird das Fenster, um das gebeten wurde.
  return (previous ? rows.slice(1) : rows).reverse();
}
