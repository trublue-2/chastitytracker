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
 * eine sofort AKTIVE Sperrzeit ohne diesen Stempel: die, die `entries/route.ts` automatisch anlegt,
 * wenn der Sub eine Verschluss-Anforderung erfüllt. Sie trägt kein `benachrichtigtAt`, weil niemand
 * eine Mail schicken musste — der Sub hat sich ja selbst gerade eingeschlossen und weiss davon.
 * Nur an `benachrichtigtAt` zu hängen, hätte für genau diese, häufigste Sperrzeit jede Meldung
 * verschluckt: der Sub bliebe verschlossen im Glauben, eine längst zurückgezogene Sperre laufe noch.
 *
 * Deshalb entscheidet `wirksamAb`: null heisst „sofort", und dann kennt der Sub die Direktive
 * per Konstruktion. Verborgen ist nur, was TERMINIERT ist und noch nicht ausgelöst hat.
 *
 * Gilt für `KontrollAnforderung` und `VerschlussAnforderung` — die beiden Modelle, die das Feldpaar
 * tragen. (`OrgasmusAnforderung` kennt es nicht und kann deshalb gar nicht terminiert werden.)
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
 * Ebenfalls bewusst NICHT enthalten: die Frist-/Ende-Berechnung (`deadline`, `endetAt`). Die
 * unterscheidet sich je Service (Stunden ab Auslösung vs. absolut-oder-fristH) und bleibt dort.
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
