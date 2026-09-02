// NUR als Typ: das Modul teilen Client-Komponenten und server-only Code, ein Laufzeit-Import des
// Prisma-Clients hätte hier nichts zu suchen.
import type { Prisma } from "@prisma/client";

export interface DelayedTriggerParams {
  /** Verzögerte Auslösung in Minuten (>0). Fehlt/≤0 = sofort (sofern kein `wirksamAbAt`). */
  delayMinutes?: number | null;
  /** Absoluter Auslöse-Zeitpunkt, BEREITS GEPARST. Hat Vorrang vor `delayMinutes`. */
  wirksamAbAt?: Date | null;
}

export interface DelayedTrigger {
  /** null = sofort auslösen; sonst der geplante Zeitpunkt (immer in der Zukunft). */
  wirksamAb: Date | null;
  /** Spiegelbild: sofort = jetzt benachrichtigt; geplant = der Poller übernimmt. */
  benachrichtigtAt: Date | null;
}

/**
 * Ist diese Direktive für den Sub noch UNSICHTBAR? Die Lese-Seite der Konvention, die
 * {@link computeDelayedTrigger} schreibt.
 *
 * **Jede Meldung an den Sub muss daran hängen.** Eine Änderung oder einen Rückzug zu melden, bevor
 * die Direktive ausgelöst hat, verrät sie — und genau das soll die Terminierung verhindern
 * (Tool-Doku: „never disclose the scheduled trigger time … Revealing it defeats the point of
 * scheduling"). Bei Auto-Kontrollen wäre es der Zufallsplan, dessen Überraschung der Sinn ist.
 *
 * **`benachrichtigtAt === null` allein genügt NICHT** — daran wäre der Fix fast gescheitert. Es gibt
 * eine sofort AKTIVE Sperrzeit ohne diesen Stempel: die, die `entryFulfilment.ts` automatisch anlegt,
 * wenn der Sub eine Verschluss-Anforderung erfüllt. Sie trägt kein `benachrichtigtAt`, weil niemand
 * eine Mail schicken musste — der Sub hat sich ja selbst gerade eingeschlossen und weiss davon.
 * Nur an `benachrichtigtAt` zu hängen, hätte für genau diese, häufigste Sperrzeit jede Meldung
 * verschluckt: der Sub bliebe verschlossen im Glauben, eine längst zurückgezogene Sperre laufe noch.
 *
 * Deshalb entscheidet `wirksamAb`: null heisst „sofort", und dann kennt der Sub die Direktive
 * per Konstruktion. Verborgen ist nur, was TERMINIERT ist und noch nicht ausgelöst hat.
 *
 * Gilt für `KontrollAnforderung`, `VerschlussAnforderung`, `Task` und `OrgasmusAnforderung` — die
 * vier Modelle, die das Feldpaar tragen.
 *
 * SQL-ZWILLING: Wo die Zeilen nicht einzeln geprüft, sondern gefiltert geladen werden, steht
 * dieselbe Regel als `where`-Fragment — für Aufgaben `SUB_VISIBLE_WHERE` (`taskIntervals.ts`), die
 * POSITIVE Form („was der Sub sehen darf"), verpackt in ein `AND`. Wer die Verborgenheit als
 * `where` braucht, negiert sie (`NOT: SUB_VISIBLE_WHERE`). Die beiden gehören zusammen: wer hier
 * die Bedingung ändert, ändert sie dort mit, sonst filtert die Abfrage anders, als die Zeile
 * beurteilt wird.
 *
 * NICHT zu verwechseln mit {@link pendingDispatchWhere} weiter unten — das ist die Auswahl des
 * POLLERS und trägt zusätzlich `withdrawnAt: null`. Solange es „hiddenFromSubWhere" hiess, las es
 * sich wie das SQL zu dieser Funktion und war es nicht: eine terminierte, VOR dem Auslösen
 * zurückgezogene Zeile ist für den Sub verborgen, fällt dort aber heraus. Genau daran zeigte das
 * Dashboard den Titel einer zurückgezogenen Strafaufgabe (Befund 16.08.2026).
 */
export function isHiddenFromSub(directive: { wirksamAb: Date | null; benachrichtigtAt: Date | null }): boolean {
  return directive.wirksamAb !== null && directive.benachrichtigtAt === null;
}

/**
 * Der vom Client gelieferte Auslöse-Zeitpunkt, geparst — `"invalid"` statt eines Wurfs.
 *
 * {@link computeDelayedTrigger} nimmt bewusst nur ein fertiges `Date`: das Parsen gehört an den Rand,
 * in den Service, der die Anfrage besitzt. Genau diese drei Zeilen („parsen, `Number.isNaN`, eigener
 * Fehlercode") standen deshalb in jedem Service noch einmal — beim vierten Mal hier. Der CODE bleibt
 * beim Aufrufer, weil er zu seiner Direktive gehört (`LOCK_INVALID_SEND_TIME` gegen
 * `TASK_INVALID_SEND_TIME`); geteilt wird nur das Parsen.
 */
export function parseTriggerAt(value: string | Date | null | undefined): Date | null | "invalid" {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "invalid" : parsed;
}

/**
 * Gemeinsame Auslöse-Politik der zeitversetzten Direktiven (Kontroll- und Verschluss-Anforderung):
 * absoluter Zeitpunkt schlägt relative Verzögerung, und ein nicht in der Zukunft liegender
 * Zeitpunkt bedeutet „sofort" (null).
 *
 * Bewusst TOTAL (kann nicht fehlschlagen) und frei von HTTP-/i18n-Belangen: das Parsen und
 * Validieren eines vom Client gelieferten Datums gehört an den Rand, in den Service, der die
 * Anfrage besitzt — nicht in eine reine Zeit-Policy.
 *
 * Ebenfalls bewusst NICHT enthalten: das PLANEN der Frist (`deadline`, `endsAt`). Das unterscheidet
 * sich je Service (Stunden ab Auslösung vs. absolut-oder-fristH) und bleibt dort. Wohl aber enthalten
 * ist ihre Verschiebung auf den Zustell-Zeitpunkt — siehe {@link deadlineFromDispatch}: die Regel ist
 * für alle terminierten Direktiven dieselbe und gehört deshalb neben die Konvention, die sie erzeugt.
 */
export function computeDelayedTrigger(now: Date, params: DelayedTriggerParams): DelayedTrigger {
  const { delayMinutes, wirksamAbAt } = params;

  let wirksamAb: Date | null = wirksamAbAt ?? null;
  if (!wirksamAb && typeof delayMinutes === "number" && delayMinutes > 0) {
    wirksamAb = new Date(now.getTime() + delayMinutes * 60 * 1000);
  }
  if (wirksamAb && wirksamAb.getTime() <= now.getTime()) wirksamAb = null;

  return { wirksamAb, benachrichtigtAt: wirksamAb ? null : now };
}

/**
 * Where-Fragment: Direktiven, deren ZEITPUNKT da ist — sofortige (`wirksamAb` null) und terminierte
 * mit `wirksamAb <= jetzt`. Für alle Sichten, die fragen „gilt das JETZT?": eine geplante Sperrzeit
 * darf vor ihrem Versand nicht durchsetzen, ein geplantes Orgasmus-Fenster nicht das Öffnen
 * erlauben, eine geplante Anforderung nicht vorzeitig als erfüllt gelten. Das SQL zu
 * {@link isScheduledDirective} (`queries.ts`), negiert.
 *
 * **Nicht zu verwechseln mit {@link isHiddenFromSub}**, auch wenn beide „ist das schon da?" fragen:
 * das hier misst die UHR, jenes die ZUSTELLUNG (`benachrichtigtAt`). Zwischen beiden liegt im
 * Normalfall ein Poller-Tick, nach einem Container-Stillstand auch Stunden — und für diese Spanne
 * ist die Antwort verschieden. Welche richtig ist, hängt an der Frage:
 *
 * - „Wirkt die Regel?" → die UHR. Eine Sperrzeit, deren Zeitpunkt erreicht ist, gilt; ob die Mail
 *   schon raus ist, ändert daran nichts (so hält es `activeVerschlussAnforderungWhere` seit je).
 * - „Darf ich ihm etwas dazu SAGEN / etwas anlasten?" → die ZUSTELLUNG. Was er nicht bekommen hat,
 *   kann er nicht versäumt haben (`strafbuch.ts`) und darf ihm ein Rückzug nicht verraten.
 *
 * Getypt gegen `TaskWhereInput`, wie {@link pendingDispatchWhere} — alle vier Modelle mit dem
 * Feldpaar tragen es identisch.
 */
export function triggeredWhere(now: Date = new Date()) {
  return { OR: [{ wirksamAb: null }, { wirksamAb: { lte: now } }] } satisfies Prisma.TaskWhereInput;
}

/**
 * Was noch AUSZULIEFERN ist: terminiert, noch nicht ausgelöst, nicht zurückgezogen — was die
 * Keyholderin für später geplant hat und was auf den Poller wartet.
 *
 * **Keine Sichtbarkeits-Regel**, auch wenn die ersten beiden Bedingungen wie {@link isHiddenFromSub}
 * aussehen. `withdrawnAt: null` macht den Unterschied: eine zurückgezogene Zeile ist nichts mehr,
 * was zugestellt werden müsste — für den Sub aber sehr wohl weiter VERBORGEN, denn ausgelöst hat
 * sie nie. Wer „darf der Sub das sehen?" fragt, nimmt `NOT: SUB_VISIBLE_WHERE` (`taskIntervals.ts`),
 * nicht dies hier. Der frühere Name „hiddenFromSubWhere" legte genau die falsche Wahl nahe und
 * führte auf dem Dashboard zum Titel einer zurückgezogenen Strafaufgabe (Befund 16.08.2026).
 *
 * Zwei Abnehmer: {@link dueForDispatchWhere} (der Poller) und die Liste der noch geplanten
 * Direktiven in der Keyholder-Sicht (`mcp/dashboard.ts`) — beide fragen „was steht noch aus?".
 * Alles Weitere ergänzt der Aufrufer, weil es sein Modell betrifft.
 *
 * Getypt gegen `TaskWhereInput`, weil alle drei Modelle mit diesem Feldpaar (`Task`,
 * `KontrollAnforderung`, `VerschlussAnforderung`) es identisch tragen: was hier durchgeht, passt
 * strukturell auch in die beiden anderen `where`-Klauseln.
 */
export const pendingDispatchWhere = {
  wirksamAb: { not: null }, benachrichtigtAt: null, withdrawnAt: null,
} satisfies Prisma.TaskWhereInput;

/**
 * Was der Poller ZUSTELLEN muss: {@link pendingDispatchWhere} plus „der Zeitpunkt ist da".
 *
 * Die Auswahl-Seite der Konvention, die {@link computeDelayedTrigger} schreibt — exakt die Zeilen,
 * die für den Sub noch verborgen sind, deren Verborgenheit aber jetzt endet. Sie stand wörtlich
 * dreimal da (Aufgabe, Kontroll- und Verschluss-Anforderung), und das ist die Sorte Bedingung, die
 * an einer Stelle nachgezogen wird und an den anderen nicht.
 *
 * `wirksamAb: { not: null }` ist NICHT redundant neben `lte`: `null` bedeutet „war nie terminiert",
 * und eine solche Zeile ist längst zugestellt — sie hier aufzusammeln hiesse, sie ein zweites Mal zu
 * melden.
 *
 * Was jeder Aufrufer SELBST ergänzt, weil es sein Modell betrifft: `entryId: null` (eine schon
 * erfüllte Kontrolle), `fulfilledAt: null` (eine erfüllte Verschluss-Anforderung). Sie gehören nicht
 * hierher — die Auslöse-Konvention weiss nichts von Erfüllung.
 */
export function dueForDispatchWhere(now: Date) {
  return {
    ...pendingDispatchWhere,
    wirksamAb: { not: null, lte: now },
    // Gesundheits-Halt, an der EINEN Stelle statt in vier Poller-Schleifen: solange einer läuft,
    // wird dem Träger nichts zugestellt. Alle vier Modelle mit dem Feldpaar tragen die
    // `user`-Relation, also erbt eine künftige fünfte Direktiven-Familie das Gate von hier, statt es
    // vergessen zu können.
    //
    // Hier und NICHT in `pendingDispatchWhere`: das speist auch die Keyholder-Sicht auf die noch
    // geplanten Direktiven (`mcp/dashboard.ts`), und dort muss sie sehen, was während der Pause
    // wartet — verschwiegen wäre es aus ihrer Sicht zurückgezogen.
    //
    // Als WHERE-Klausel und nicht als Filter danach: die wartenden Zeilen sind die ältesten und
    // sortieren nach vorn, würden den `take`-Deckel jedes Ticks besetzen und die Zustellung für alle
    // anderen Träger anhalten. Genau dieser Stau ist in `processDueTasks` schon einmal beschrieben.
    user: { healthHolds: { none: { active: true } } },
  } satisfies Prisma.TaskWhereInput;
}

/**
 * Die Gegenrichtung von {@link computeDelayedTrigger}: die Frist einer TERMINIERTEN Direktive, wie
 * sie ab dem tatsächlichen Zustell-Zeitpunkt gilt.
 *
 * Geplant wird `deadline` relativ zu `wirksamAb`. Zugestellt wird sie aber vom Minuten-Poller, und
 * der ist nicht zwingend pünktlich: er läuft im 60-Sekunden-Raster, ein Container-Neustart hält ihn
 * ganz an, und ein gescheiterter Versand wird erst im nächsten Tick erneut versucht. Bis dahin lief
 * die gespeicherte Frist weiter — im Extremfall war sie schon abgelaufen, wenn der Sub die Mail
 * bekam (belegter Fall 29.07.2026: Frist exakt auf der Auslösung, Erfüllung 35 s später als
 * Vergehen gebucht).
 *
 * Verschoben wird deshalb die geplante SPANNE, nicht der Endpunkt: der Sub bekommt genau das
 * Zeitfenster, das für ihn vorgesehen war, gerechnet ab dem Moment, in dem er davon erfährt.
 *
 * `wirksamAb: null` heisst „war nie terminiert" — dann gibt es keine Spanne zu erhalten und die
 * gespeicherte Frist gilt unverändert.
 *
 * Benutzt von `KontrollAnforderung` und von `Task` — NICHT von `VerschlussAnforderung`, und das ist
 * kein Versehen: die trägt dasselbe Feldpaar und dieselbe Verspätung, aber ihr `endsAt` kann
 * ENTWEDER relativ (`fristH` ab Auslösung) ODER ein von der Keyholderin gesetzter absoluter
 * Zeitpunkt sein — und die Zeile hält nicht fest, welches von beidem. Ein absolutes Ende zu
 * verschieben wäre schlicht falsch. Diese Funktion dort anzuwenden setzt also voraus, die
 * Unterscheidung erst zu speichern.
 *
 * Bei der Aufgabe stellt sich die Frage nicht: dort wandert die GANZE Geometrie mit (`wirksamAb`
 * UND `holdUntil` um dieselbe Verspätung), weil auch die Kulanzfrist am Nullpunkt hängt.
 */
export function deadlineFromDispatch(
  planned: { wirksamAb: Date | null; deadline: Date },
  sentAt: Date,
): Date {
  if (!planned.wirksamAb) return planned.deadline;
  return new Date(sentAt.getTime() + (planned.deadline.getTime() - planned.wirksamAb.getTime()));
}
