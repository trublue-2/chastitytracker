"use client";

import useTick from "@/app/hooks/useTick";

/**
 * Verbleibende Millisekunden bis `endsAt`, live tickend — die Rechenseite jedes Countdowns.
 *
 * Ticker und Rechnung gehören zusammen: wer nur `useTick` nimmt, schreibt die Differenz daneben noch
 * einmal hin, und zwei Countdowns tickten schon in unterschiedlichem Takt. Die FORMULIERUNG bleibt
 * bewusst beim Aufrufer — mal ist die Restzeit ein Wert hinter einem Präfix (Sperrzeit), mal steckt
 * sie mitten in einem Satz (Aufgaben-Frist).
 *
 * Nie negativ: eine abgelaufene Frist ist 0, damit niemand aus Versehen „noch -3min" anzeigt. Wer
 * den Ablauf selbst behandeln will, vergleicht auf `=== 0`.
 */
export default function useRemainingMs(endsAt: string, intervalMs = 60_000): number {
  const remaining = Math.max(0, new Date(endsAt).getTime() - Date.now());
  // Abgelaufen heisst fertig: an einer 0, die 0 bleibt, gibt es nichts mehr zu aktualisieren.
  useTick(remaining > 0 ? intervalMs : 0);
  return remaining;
}
