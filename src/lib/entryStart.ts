/**
 * **Der Zeitpunkt von Verschluss und Öffnung zählt Sekunden.**
 *
 * Das Formular kennt nur Minuten (`datetime-local`), und `fromDatetimeLocal` setzt die Sekunden auf 0.
 * Der Riegel meldet dagegen auf die Sekunde (`boltConfirmedAt`, `startTime` beim Vollzug). Wer kurz nach
 * einer Öffnung verschloss — oder umgekehrt —, schickte 12:06:00 gegen einen Eintrag von 12:06:10 und
 * bekam „Zeitpunkt muss nach dem vorherigen Eintrag liegen", obwohl er nur „jetzt" meinte.
 *
 * Deshalb sagt das Formular, wenn der Träger die Zeit NICHT angefasst hat, `startIsNow: true`, und der
 * Server nimmt seine eigene Uhr: dieselbe, nach der der Riegel datiert. Eine von Hand gewählte Zeit
 * bleibt minutengenau und wird wie bisher gegen den vorherigen Eintrag geprüft.
 *
 * **Importfrei** (wie `lockPending.ts`): das Formular und die Route teilen sich die Regel.
 */

/** Die Eintrags-Arten, deren Zeit „jetzt" heissen kann — die beiden, die am Riegel hängen. */
export const NOW_START_TYPES: ReadonlySet<string> = new Set(["VERSCHLUSS", "OEFFNEN"]);

/**
 * Meint dieser Aufruf „jetzt"? Nur bei VERSCHLUSS/OEFFNEN und nur online: ein offline erfasster Eintrag
 * trägt die Erfassungszeit des Clients (`offlineCapture.ts`), die nie durch die Server-Uhr ersetzt wird.
 */
export function startIsNow(body: { startIsNow?: unknown }, type: string, capturedOffline: boolean): boolean {
  return body.startIsNow === true && NOW_START_TYPES.has(type) && !capturedOffline;
}

/**
 * Der wirksame Eintrags-Zeitpunkt: offline die Erfassungszeit, bei „jetzt" die Server-Uhr, sonst die
 * Formular-Zeit.
 */
export function resolveEntryStart(p: { capturedAt: Date | null; startTime: string; isNow: boolean; now: Date }): Date {
  return p.capturedAt ?? (p.isNow ? p.now : new Date(p.startTime));
}

/**
 * „Jetzt" liegt nach jedem Eintrag, der schon steht. Fällt es trotzdem auf oder vor den vorherigen
 * (gleiche Millisekunde, oder ein Riegel-Zeitstempel knapp in der Zukunft), rückt es eine Millisekunde
 * dahinter — statt den Träger wegen einer Uhr-Feinheit abzuweisen. Eine von Hand gewählte Zeit wird nie
 * verschoben: sie bleibt `start`, und die Reihenfolge-Prüfung entscheidet.
 */
export function startAfter(start: Date, previous: Date, isNow: boolean): Date {
  return isNow && start <= previous ? new Date(previous.getTime() + 1) : start;
}
