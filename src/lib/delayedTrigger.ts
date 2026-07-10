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
