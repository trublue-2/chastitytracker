/**
 * **Steht der Träger gut da?** — die Frage, die eine Zielzeile heute nicht beantwortet.
 *
 * Bisher stand dort „8h 41min / 20h · 43 %". Um 09 Uhr sind 43 % hervorragend, um 22 Uhr ist der
 * Tag verloren — dieselbe Zahl, zwei völlig verschiedene Lagen. Die App kennt die Uhrzeit und das
 * Ende des Zeitraums; der Benutzer musste die Bewertung trotzdem jedes Mal selbst machen.
 *
 * Die Herleitung ist eine Subtraktion, und genau deshalb gehört sie hierher statt in die Anzeige:
 * sie ist prüfbar, und die Anzeige soll sie nicht ein zweites Mal anders treffen.
 *
 *     Puffer = verbleibende Zeit im Zeitraum − noch fehlende Stunden
 *
 * Der Puffer sagt, wie viel man sich noch leisten kann. Ist er negativ, ist das Ziel rechnerisch
 * nicht mehr erreichbar — auch dann nicht, wenn man ab sofort durchgehend trägt.
 */

/** Was von einem Ziel zu halten ist. `missingH` ist bei allen ausser `reached` grösser als 0. */
export type GoalOutlook =
  | { kind: "reached" }
  /** Erreichbar mit Luft. */
  | { kind: "ahead"; missingH: number }
  /** Erreichbar, aber nur bei nahezu durchgehendem Tragen ab jetzt. */
  | { kind: "tight"; missingH: number }
  /** Rechnerisch nicht mehr erreichbar. */
  | { kind: "missed"; missingH: number };

const H = 3_600_000;

/**
 * Ab wann „knapp"? Absolut UND anteilig, und es braucht beides:
 *
 * - Eine Stunde Puffer ist bei einem Tagesziel knapp und bei einem Jahresziel bedeutungslos —
 *   deshalb der Anteil.
 * - Zehn Prozent von 200 fehlenden Stunden sind 20 Stunden Puffer; das ist nicht knapp, aber die
 *   reine Anteilsregel nennte es so. Deshalb die Obergrenze.
 *
 * Genommen wird der GRÖSSERE der beiden Schwellwerte, gedeckelt auf einen halben Tag.
 */
function tightThresholdH(missingH: number): number {
  return Math.min(Math.max(1, missingH * 0.1), 12);
}

/**
 * @param actualH   bereits erreichte Stunden im Zeitraum
 * @param targetH   verlangte Stunden; `<= 0` heisst „kein Ziel" → `null`
 * @param remainingMs  verbleibende Zeit bis zum Ende des Zeitraums; negativ wird als 0 gelesen
 *                     (ein abgelaufener Zeitraum hat keine Zukunft mehr)
 */
export function goalOutlook(actualH: number, targetH: number, remainingMs: number): GoalOutlook | null {
  if (!Number.isFinite(targetH) || targetH <= 0) return null;

  const missingH = targetH - actualH;
  if (missingH <= 0) return { kind: "reached" };

  const remainingH = Math.max(0, remainingMs) / H;
  const puffer = remainingH - missingH;

  if (puffer < 0) return { kind: "missed", missingH };
  if (puffer < tightThresholdH(missingH)) return { kind: "tight", missingH };
  return { kind: "ahead", missingH };
}
