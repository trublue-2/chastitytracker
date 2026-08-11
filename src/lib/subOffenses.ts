import { buildStrafbuch, offenseListViews, type OffenseDetail, type StrafbuchData } from "@/lib/strafbuch";
import { collectDetectedOffenses } from "@/lib/strafurteilService";
import { offenseState, type OffenseCanonicalType, type OffenseState } from "@/lib/offenseTypes";

/**
 * Das Strafbuch aus der Sicht des KG-TRÄGERS — die eine Stelle, an der es entsteht (Issue #36).
 *
 * ZWEI ABNEHMER, zwei Fragen. Der Dashboard-Block (`OpenPenalties`) zeigt nur die OFFENEN Strafen —
 * „was fordert mich gerade". Der Melder (`offenseAnnounce.ts`) nimmt die unbeurteilten und schreibt
 * sie als Nachricht in den Posteingang — „was ist vorgefallen". Eine eigene Strafbuch-SEITE gibt es
 * seit v5.1 nicht mehr; sie beantwortete beide Fragen halb.
 *
 * WARUM DIE MELDUNG DEN AUSSCHLAG GAB: Bis v5.0.12 sah der Träger nur die verhängten Strafen — die
 * Begründung war, dass die Keyholderin eine Anschuldigung fallenlassen können soll, ohne dass er sie
 * je gesehen hat. Diese Zusage ist aufgegeben, und zwar bewusst: Sichtbarkeit ist nicht teilbar.
 * Zeigt man das Erkannte, muss man auch das VERWORFENE zeigen — sonst verschwindet eine Zeile, die
 * er gesehen hat, wortlos, und er kann „abgewunken" nicht von „Ableitung geändert" und nicht von
 * „kaputt" unterscheiden. Als reine ANZEIGE auf einer Live-Ableitung liess sich das nicht halten;
 * als geschriebene Nachricht schon, denn die kann nicht mehr verschwinden.
 *
 * Reine LESE-Sicht: urteilen und abschliessen kann nur die Keyholderin (`judgeOffense`).
 *
 * WAS SICH DABEI ÄNDERN KANN: Erkennungen sind LIVE aus den Einträgen abgeleitet. Sie ändern sich,
 * ohne dass jemand etwas tut — ein korrigierter Eintrag lässt ein Vergehen verschwinden, ein
 * gesenktes Reinigungs-Kontingent lässt rückwirkend welche entstehen (`reinigungLimitViolations`
 * zählt gegen den HEUTIGEN Wert über die ganze Historie). Beurteilte Zeilen sind ausgenommen: sie
 * überleben jede Änderung (`judgedRefs` in `applyOffenseRules`).
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
  /** Der ANLASS in Worten, wo das Vergehen einen eigenen trägt — welche Arten das sind, sagt der
   *  `detail`-Zugriff in `OFFENSE_LISTS`. Wo die Art selbst schon alles sagt („Kontrolle zu spät"),
   *  bleibt es leer; ein Anlass wäre dort eine Wiederholung. Ohne dieses Feld beantwortet die Karte
   *  „was wird mir angelastet" nur mit einer Kategorie. */
  title: string | null;
  /** Der ausführliche Text dazu, wo einer erfasst wurde (Beschreibung des notierten Vergehens). */
  description: string | null;
  /** Bei `punished`/`done` der Straftext (bei einer Strafaufgabe ihr Titel, siehe `punishWithTask`),
   *  bei `dismissed` die Begründung des Fallenlassens, sofern eine gegeben wurde. Beides ist
   *  derselbe Freitext (`StrafeRecord.reason`) — was er bedeutet, sagt der Zustand. */
  judgmentText: string | null;
  /** Wann geurteilt wurde. Null bei `open`. */
  judgedAt: Date | null;
  doneAt: Date | null;
  /** Gesetzt, wenn die Strafe eine gestellte Aufgabe IST. */
  taskId: string | null;
}

/**
 * Was eine Zeile aus ihrem URTEIL erbt — die eine Stelle, an der `StrafeRecord` auf `SubOffense`
 * abgebildet wird.
 *
 * Beide Zweige unten brauchen dieselbe Abbildung (das erkannte Vergehen mit Urteil, und das Urteil
 * ohne Erkennung), und eine zweite Kopie davon würde bei einem neuen Feld genau einmal vergessen.
 * `undefined` heisst „noch kein Urteil" — dann bleibt alles leer und der Zustand ist `open`.
 */
function fromJudgment(
  r: StrafbuchData["strafeRecords"][number] | undefined,
): Pick<SubOffense, "state" | "judgmentText" | "judgedAt" | "doneAt" | "taskId"> {
  return {
    state: offenseState(r),
    judgmentText: r?.reason ?? null,
    judgedAt: r?.bestraftDatum ?? null,
    doneAt: r?.erledigtAt ?? null,
    taskId: r?.taskId ?? null,
  };
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
  // WELCHE Arten einen eigenen Anlass-Text tragen, steht in `OFFENSE_LISTS` und nicht hier — sonst
  // wäre das eine Aufzählung, die eine dritte solche Art still übergeht. Die Schleife läuft nur über
  // die Listen, die einen `detail`-Zugriff mitbringen; alle anderen überspringt sie.
  const details = new Map<string, OffenseDetail>();
  for (const { rows, ref, detail } of offenseListViews(sb)) {
    if (!detail) continue;
    for (const row of rows) details.set(ref(row), detail(row));
  }

  const detected = collectDetectedOffenses(sb).map((o): SubOffense => {
    const detail = details.get(o.refId);
    return {
      refId: o.refId,
      offenseType: o.canonicalType,
      offenseAt: o.at,
      title: detail?.title ?? null,
      description: detail?.description ?? null,
      ...fromJudgment(judgments.get(o.refId)),
    };
  });

  const detectedRefs = new Set(detected.map((o) => o.refId));
  const orphaned = sb.strafeRecords
    .filter((r) => !detectedRefs.has(r.refId))
    .map((r): SubOffense => ({
      refId: r.refId,
      offenseType: null,
      offenseAt: null,
      title: null,
      description: null,
      ...fromJudgment(r),
    }));

  return [...detected, ...orphaned].sort((a, b) => lastEventAt(b) - lastEventAt(a));
}

/** Die noch offenen Strafen — was den Träger tatsächlich FORDERT. Der Dashboard-Block zeigt nur
 *  diese; der ganze Verlauf steht als Nachrichten im Posteingang. */
export function openPenaltiesOf(offenses: SubOffense[]): SubOffense[] {
  return offenses.filter((o) => o.state === "punished");
}

/**
 * Das Strafbuch eines Nutzers laden. Genutzt vom Dashboard-Block (offene Strafen) und vom
 * Melder, der festgestellte Vergehen in den Posteingang schreibt (`offenseAnnounce.ts`).
 *
 * Kostet ein volles Strafbuch — das ist der Preis dafür, dass Vergehensart und Tatzeitpunkt hier
 * dieselben sind wie beim Keyholder. Eine billigere Abfrage nur auf `StrafeRecord` könnte weder das
 * eine noch das andere beantworten, und die unbeurteilten Vergehen stünden dort ohnehin nicht.
 */
export async function loadSubOffenses(userId: string, now: Date = new Date()): Promise<SubOffense[]> {
  return selectSubOffenses(await buildStrafbuch(userId, now));
}
