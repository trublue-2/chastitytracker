import { buildStrafbuch, type StrafbuchData } from "@/lib/strafbuch";
import { collectDetectedOffenses } from "@/lib/strafurteilService";
import { offenseState, type OffenseCanonicalType, type OffenseState } from "@/lib/offenseTypes";

/**
 * Das Strafbuch aus der Sicht des KG-TRÄGERS — die eine Stelle, an der es entsteht (Issue #36).
 *
 * VOLLSTÄNDIG, nicht als Ausschnitt: Er sieht jedes erkannte Vergehen, und zwar sofort, ohne dass
 * die Keyholderin etwas dafür tun muss. Bis v5.0.12 sah er nur die verhängten Strafen — die
 * Begründung dafür war, dass sie eine Anschuldigung fallenlassen können soll, ohne dass er sie je
 * gesehen hat.
 *
 * Diese Zusage ist mit dieser Fassung aufgegeben, und zwar bewusst und ganz: Sichtbarkeit ist nicht
 * teilbar. Zeigt man das Erkannte, muss man auch das VERWORFENE zeigen — sonst verschwindet eine
 * Zeile, die er gesehen hat, wortlos, und er kann „abgewunken" nicht von „Ableitung geändert" und
 * nicht von „kaputt" unterscheiden. Genau das beschädigt auch den Teil der Liste, der verlässlich
 * ist. Darum trägt jede Zeile ihren Zustand — welche davon die Seite zeigt, entscheidet sie selbst
 * (erledigte Strafen lässt sie weg, Begründung dort).
 *
 * Reine LESE-Sicht: urteilen und abschliessen kann nur die Keyholderin (`judgeOffense`).
 *
 * WAS ER DABEI ZU SEHEN BEKOMMT — und was die Seite ihm sagen muss: Erkennungen sind LIVE aus den
 * Einträgen abgeleitet. Sie können sich ändern, ohne dass jemand etwas tut — ein korrigierter
 * Eintrag lässt ein Vergehen verschwinden, und ein gesenktes Reinigungs-Kontingent lässt rückwirkend
 * welche entstehen (`reinigungLimitViolations` zählt gegen den HEUTIGEN Wert über die ganze
 * Historie). Beurteilte Zeilen sind davon ausgenommen: sie überleben jede Änderung (`judgedRefs` in
 * `applyOffenseRules`).
 */

/** Der Zustand kommt aus `offenseTypes.ts` — dieselbe Ableitung nutzen Admin-Strafbuch und
 *  MCP-Ledger. Hier re-exportiert, damit die Anzeige-Schicht ihn nicht quer importieren muss. */
export type SubOffenseState = OffenseState;

export interface SubOffense {
  /** Stabile Referenz (`StrafeRecord.refId` bzw. die ref aus `collectDetectedOffenses`). */
  refId: string;
  /** Kanonische Vergehensart — Anzeigename über `OFFENSE_TYPE_I18N_KEYS`. Null, wenn das Vergehen
   *  aktuell nicht mehr abgeleitet wird (etwa weil sein Eintrag gelöscht wurde): das Urteil bleibt,
   *  sein Anlass ist dann aber nicht mehr auflösbar. */
  offenseType: OffenseCanonicalType | null;
  /** Tatzeitpunkt (nicht der Urteilszeitpunkt). Null wie bei `offenseType`. */
  offenseAt: Date | null;
  state: SubOffenseState;
  /** Der ANLASS in Worten, wo das Vergehen einen eigenen trägt: der Titel des von Hand notierten
   *  Vergehens bzw. der Aufgabe. Bei den übrigen elf Arten sagt die Art selbst schon alles
   *  („Kontrolle zu spät"), und ein Anlass wäre eine Wiederholung. Ohne dieses Feld beantwortet die
   *  Karte „was wird mir angelastet" nur mit einer Kategorie. */
  detail: string | null;
  /** Der ausführliche Text dazu, wo einer erfasst wurde (Beschreibung des notierten Vergehens). */
  detailText: string | null;
  /** Bei `punished`/`done` der Straftext (bei einer Strafaufgabe ihr Titel, siehe `punishWithTask`),
   *  bei `dismissed` die Begründung des Fallenlassens, sofern eine gegeben wurde. Beides ist
   *  derselbe Freitext (`StrafeRecord.reason`) — was er bedeutet, sagt der Zustand. */
  text: string | null;
  /** Wann geurteilt wurde. Null bei `open`. */
  judgedAt: Date | null;
  doneAt: Date | null;
  /** Gesetzt, wenn die Strafe eine gestellte Aufgabe IST. */
  taskId: string | null;
}

/** Wann ist an dieser Zeile zuletzt etwas passiert? Danach wird sortiert — sonst stünde ein heute
 *  beurteiltes Vergehen von letzter Woche unter einem gestern erkannten. */
function lastEventAt(o: SubOffense): number {
  return (o.doneAt ?? o.judgedAt ?? o.offenseAt)?.getTime() ?? 0;
}

/**
 * Die reine Auflösung: Strafbuch → Träger-Sicht. Ohne DB, damit sie testbar bleibt.
 *
 * Ausgangspunkt sind die ERKANNTEN Vergehen, nicht die Urteile: die Vergehensart und der
 * Tatzeitpunkt kommen aus {@link collectDetectedOffenses} und nicht aus `StrafeRecord.offenseType`
 * — der gespeicherte Wert ist nicht kanonisch („KONTROLLANFORDERUNG" steht für `late_control` UND
 * `rejected_control`), und einen Tatzeitpunkt trägt er überhaupt nicht.
 *
 * Ein Urteil ohne zugehörige Erkennung (Eintrag später gelöscht) fällt dabei nicht weg: es wird
 * hinten angehängt, mit `offenseType: null`. Verschwiegen würde sonst ausgerechnet eine Strafe, die
 * noch offen ist.
 */
export function selectSubOffenses(sb: StrafbuchData): SubOffense[] {
  const judgments = new Map(sb.strafeRecords.map((r) => [r.refId, r]));
  // Nur die zwei Arten, die einen eigenen Anlass-Text tragen. Über die refId nachgeschlagen, damit
  // die Zuordnung dieselbe bleibt wie in `OFFENSE_LISTS` — keine zweite Namenslogik.
  const manualById = new Map(sb.manualOffenses.map((m) => [m.id, m]));
  const taskById = new Map(sb.unfulfilledTasks.map((t) => [t.id, t]));

  const detected = collectDetectedOffenses(sb).map((o): SubOffense => {
    const r = judgments.get(o.refId);
    const manual = manualById.get(o.refId);
    const task = taskById.get(o.refId);
    return {
      refId: o.refId,
      offenseType: o.canonicalType,
      offenseAt: o.at,
      state: offenseState(r),
      detail: manual?.title ?? task?.title ?? null,
      detailText: manual?.description ?? null,
      text: r?.reason ?? null,
      judgedAt: r?.bestraftDatum ?? null,
      doneAt: r?.erledigtAt ?? null,
      taskId: r?.taskId ?? null,
    };
  });

  const detectedRefs = new Set(detected.map((o) => o.refId));
  const orphaned = sb.strafeRecords
    .filter((r) => !detectedRefs.has(r.refId))
    .map((r): SubOffense => ({
      refId: r.refId,
      offenseType: null,
      offenseAt: null,
      state: offenseState(r),
      detail: null,
      detailText: null,
      text: r.reason,
      judgedAt: r.bestraftDatum,
      doneAt: r.erledigtAt,
      taskId: r.taskId,
    }));

  return [...detected, ...orphaned].sort((a, b) => lastEventAt(b) - lastEventAt(a));
}

/** Die noch offenen Strafen — was den Träger tatsächlich FORDERT. Der Dashboard-Block zeigt nur
 *  diese; das ganze Buch steht auf seiner eigenen Seite. */
export function openPenaltiesOf(offenses: SubOffense[]): SubOffense[] {
  return offenses.filter((o) => o.state === "punished");
}

/**
 * Das Strafbuch eines Nutzers laden. Genutzt vom Dashboard-Block UND von `/dashboard/strafen`.
 *
 * Kostet ein volles Strafbuch — das ist der Preis dafür, dass Vergehensart und Tatzeitpunkt hier
 * dieselben sind wie beim Keyholder. Eine billigere Abfrage nur auf `StrafeRecord` könnte weder das
 * eine noch das andere beantworten, und die unbeurteilten Vergehen stünden dort ohnehin nicht.
 */
export async function loadSubOffenses(userId: string, now: Date = new Date()): Promise<SubOffense[]> {
  return selectSubOffenses(await buildStrafbuch(userId, now));
}
