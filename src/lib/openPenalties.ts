import { buildStrafbuch, type StrafbuchData } from "@/lib/strafbuch";
import { collectDetectedOffenses } from "@/lib/strafurteilService";
import { isSubVisibleJudgment, type OffenseCanonicalType } from "@/lib/offenseTypes";

/**
 * Die Strafen aus der Sicht des KG-TRÄGERS — die eine Stelle, an der sie entstehen (Issue #36).
 *
 * Das Strafbuch ist Keyholder-Werkzeug: es zeigt jedes erkannte Vergehen, auch das unbeurteilte, und
 * jede verworfene Anschuldigung. Der Träger sieht davon bewusst nur den Ausschnitt, über den
 * entschieden UND zu seinen Ungunsten entschieden wurde:
 *
 * - nur `status === "PUNISHED"` — ein erkanntes, aber noch unbeurteiltes Vergehen ist eine offene
 *   Frage der Keyholderin, keine Tatsache. Und `DISMISSED` bleibt draussen, damit sie abwinken kann,
 *   ohne dass der Träger die Anschuldigung je gesehen hat.
 * - reine LESE-Sicht: erledigt melden kann nur die Keyholderin (`judgeOffense({action:"complete"})`).
 *
 * Der Ausschnitt ist die ganze Zusage dieses Moduls. Wer ihn an einer zweiten Stelle nachbaut,
 * riskiert genau den Fehler, der hier am teuersten wäre — ein verworfenes Urteil, das der Träger
 * trotzdem zu lesen bekommt.
 */

export interface SubPenalty {
  /** Stabile Referenz auf das auslösende Vergehen (`StrafeRecord.refId`). */
  refId: string;
  /** Kanonische Vergehensart — Anzeigename über `OFFENSE_TYPE_I18N_KEYS`. Null, wenn das Vergehen
   *  aktuell nicht mehr abgeleitet wird (etwa weil sein Eintrag gelöscht wurde): das Urteil bleibt,
   *  sein Anlass ist dann aber nicht mehr auflösbar. */
  offenseType: OffenseCanonicalType | null;
  /** Tatzeitpunkt des Vergehens (nicht der Urteilszeitpunkt). Null wie bei `offenseType`. */
  offenseAt: Date | null;
  /** Der Straftext — bei einer Strafaufgabe ihr Titel (siehe `punishWithTask`). */
  penaltyText: string | null;
  judgedAt: Date;
  /** Erledigt-Zeitpunkt; `null` = die Strafe ist offen. Es gibt bewusst kein zweites `done`-Feld
   *  daneben — dieselbe Frage zweimal gespeichert driftet irgendwann auseinander. */
  doneAt: Date | null;
  /** Gesetzt, wenn die Strafe eine gestellte Aufgabe IST. */
  taskId: string | null;
}

export interface SubPenalties {
  /** Verhängt und noch nicht erledigt — neueste zuerst (nach Urteilszeitpunkt). */
  open: SubPenalty[];
  /** Abgeschlossen — neueste zuerst (nach Erledigungszeitpunkt: das ist hier das jüngste Ereignis). */
  done: SubPenalty[];
}

/** Neueste zuerst. */
function byNewest<T>(at: (v: T) => Date): (a: T, b: T) => number {
  return (a, b) => at(b).getTime() - at(a).getTime();
}

/**
 * Die reine Auflösung: Urteile → Träger-Sicht. Ohne DB, damit sie testbar bleibt.
 *
 * Die Vergehensart und der Tatzeitpunkt kommen aus {@link collectDetectedOffenses} und nicht aus
 * `StrafeRecord.offenseType`: der gespeicherte Wert ist nicht kanonisch („KONTROLLANFORDERUNG" steht
 * für `late_control` UND `rejected_control`), und einen Tatzeitpunkt trägt er überhaupt nicht.
 * Beurteilte Vergehen bleiben in den Listen stehen, auch wenn ihre Regel inzwischen abgeschaltet
 * wurde (siehe `applyOffenseRules`) — die Auflösung greift also im Normalfall immer.
 */
export function selectSubPenalties(sb: StrafbuchData): SubPenalties {
  const byRef = new Map(collectDetectedOffenses(sb).map((o) => [o.refId, o]));

  const all: SubPenalty[] = sb.strafeRecords
    // Die Zusage dieses Moduls als PRÄDIKAT, nicht als Filter-Ausdruck: derselbe Schnitt gilt im
    // Posteingang (`messageService.refDetails`).
    .filter(isSubVisibleJudgment)
    .map((r) => {
      const offense = byRef.get(r.refId);
      return {
        refId: r.refId,
        offenseType: offense?.canonicalType ?? null,
        offenseAt: offense?.at ?? null,
        penaltyText: r.reason,
        judgedAt: r.bestraftDatum,
        doneAt: r.erledigtAt,
        taskId: r.taskId,
      };
    });

  return {
    open: all.filter((p) => p.doneAt === null).sort(byNewest((p) => p.judgedAt)),
    done: all.filter((p) => p.doneAt !== null).sort(byNewest((p) => p.doneAt ?? p.judgedAt)),
  };
}

/**
 * Die Strafen eines Nutzers laden. Genutzt vom Dashboard-Block UND von `/dashboard/strafen`.
 *
 * Kostet ein volles Strafbuch — das ist der Preis dafür, dass Vergehensart und Tatzeitpunkt hier
 * dieselben sind wie beim Keyholder. Eine billigere Abfrage nur auf `StrafeRecord` könnte weder das
 * eine noch das andere beantworten.
 */
export async function loadSubPenalties(userId: string, now: Date = new Date()): Promise<SubPenalties> {
  return selectSubPenalties(await buildStrafbuch(userId, now));
}
