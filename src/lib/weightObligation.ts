import { dayNumber } from "@/lib/weight";

/**
 * Die Meldepflicht: **mehr als drei Tage ohne Angabe sind ein Versäumnis.**
 *
 * Rein und ohne Datenbank, weil hier die einzige Regel des Features steht, die von sich aus ein
 * Vergehen erzeugt. Alles andere am Gewicht ist Anzeige; das hier landet im Strafbuch. Deshalb
 * getrennt vom Strafbuch selbst: so lässt sie sich Kante für Kante prüfen, ohne zwanzig Abfragen
 * aufzubauen.
 *
 * **Wie gezählt wird.** Ein Vergehen je angebrochenem Drei-Tage-Block; jede Meldung setzt den
 * Zähler zurück. Dreissig Tage Schweigen sind damit zehn Vergehen, nicht eines und nicht
 * achtundzwanzig: ein Monat wiegt schwerer als ein verlängertes Wochenende, ohne dass das Strafbuch
 * überläuft.
 */

export const MISSED_REPORT_BLOCK_DAYS = 3;

export interface MissedWeightBlock {
  /** Der Kalendertag, mit dem der Block voll wurde (`YYYY-MM-DD`) — zugleich die stabile Kennung. */
  dayKey: string;
  /** Der Zeitpunkt, zu dem er voll war: Mitternacht NACH diesem Tag, in der Zone des Trägers. */
  at: Date;
  /** Wie viele Tage ohne Meldung der Block umfasst — heute immer drei, als Beleg in der Anzeige. */
  days: number;
}

export interface MissedWeightParams {
  /** Tage MIT Meldung (`YYYY-MM-DD`, Zone des Trägers). Reihenfolge egal. */
  reportedDayKeys: Iterable<string>;
  /** Erster Tag, an dem die Pflicht galt — der spätere aus Regel-Beginn und erster Messung. */
  fromDayKey: string;
  /** Letzter zu prüfender Tag (in aller Regel „heute" beim Träger). */
  toDayKey: string;
  /**
   * Tage, an denen die Pflicht RUHT — ein aktiver Gesundheits-Halt.
   *
   * Sie zählen weder als Versäumnis noch setzen sie den Zähler zurück: der Block macht Pause und
   * läuft danach weiter. Ein Reset wäre zu grosszügig (zwei Krankheitstage löschten ein
   * begonnenes Versäumnis), ein Mitzählen zu hart — wer krank ist, soll nicht zusätzlich für eine
   * ausgelassene Waage bestraft werden.
   */
  pausedDayKeys?: Iterable<string>;
  /** Grenze, ab der ein Block noch nicht zählt: sein Ende muss vorbei sein. */
  now: Date;
  /** Mitternacht nach `dayKey` in der Zone des Trägers — von aussen, weil hier keine Zeitzonen wohnen. */
  endOfDay: (dayKey: string) => Date;
  /** Der Kalendertag `offset` Tage nach `dayKey`. */
  addDays: (dayKey: string, offset: number) => string;
}

/**
 * Die vollen Drei-Tage-Blöcke ohne Meldung zwischen `fromDayKey` und `toDayKey`.
 *
 * Der laufende, noch nicht volle Block bleibt aussen vor — und der gerade vollgewordene auch, solange
 * sein letzter Tag noch läuft: ein Versäumnis steht erst fest, wenn der Tag vorbei ist, an dem es
 * hätte behoben werden können.
 */
export function missedWeightBlocks(params: MissedWeightParams): MissedWeightBlock[] {
  const reported = new Set(params.reportedDayKeys);
  const paused = new Set(params.pausedDayKeys ?? []);
  const last = dayNumber(params.toDayKey);
  const blocks: MissedWeightBlock[] = [];

  let streak = 0;
  for (let offset = 0; ; offset++) {
    const dayKey = params.addDays(params.fromDayKey, offset);
    if (dayNumber(dayKey) > last) break;

    if (paused.has(dayKey)) continue;
    if (reported.has(dayKey)) { streak = 0; continue; }

    streak++;
    if (streak < MISSED_REPORT_BLOCK_DAYS) continue;

    const at = params.endOfDay(dayKey);
    // Ein Block, dessen letzter Tag noch läuft, ist noch keiner: der Träger kann heute noch melden.
    if (at.getTime() > params.now.getTime()) break;
    blocks.push({ dayKey, at, days: MISSED_REPORT_BLOCK_DAYS });
    streak = 0;
  }
  return blocks;
}

/** Die stabile `refId` eines Versäumnisses. Eigener Namensraum, damit sie mit keiner Entry- oder
 *  Anforderungs-Id kollidieren kann (Muster: `cleaningNotRelockedRef`). */
export function missedWeightRef(dayKey: string): string {
  return `weight-missed:${dayKey}`;
}
