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
 * Gilt für `KontrollAnforderung`, `VerschlussAnforderung` und `Task` — die drei Modelle, die das
 * Feldpaar tragen. (`OrgasmusAnforderung` kennt es nicht und kann deshalb gar nicht terminiert
 * werden.)
 *
 * SQL-ZWILLING: Wo die Zeilen nicht einzeln geprüft, sondern gefiltert geladen werden, steht
 * dieselbe Regel als `where`-Fragment — für Aufgaben `SUB_VISIBLE_WHERE` (`taskIntervals.ts`). Die
 * beiden gehören zusammen: wer hier die Bedingung ändert, ändert sie dort mit, sonst filtert die
 * Abfrage anders, als die Zeile beurteilt wird.
 */
export function isHiddenFromSub(directive: { wirksamAb: Date | null; benachrichtigtAt: Date | null }): boolean {
  return directive.wirksamAb !== null && directive.benachrichtigtAt === null;
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
 * Ebenfalls bewusst NICHT enthalten: das PLANEN der Frist (`deadline`, `endetAt`). Das unterscheidet
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
 * kein Versehen: die trägt dasselbe Feldpaar und dieselbe Verspätung, aber ihr `endetAt` kann
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
