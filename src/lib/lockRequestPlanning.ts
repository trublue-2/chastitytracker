/**
 * Einschliess-Anforderungen im Voraus planen — welche Direktive das Formular stellt, als reine
 * Funktion (ohne Prisma, ohne React), damit sie sich Kante für Kante prüfen lässt.
 */

/** `?mode=plan` auf `…/aktionen/verschluss-anforderung`: öffnet bei VERSCHLOSSENEM Sub die
 *  Einschliess-Anforderung (nur terminiert) statt der Sperrzeit. */
export const LOCK_FORM_PLAN_MODE = "plan";

/**
 * Welche Direktive das Formular stellt.
 *
 * Unverschlossen gibt es nur die Anforderung. Verschlossen öffnet die Seite wie bisher die Sperrzeit —
 * ausser `?mode=plan`: dann eine Anforderung, die nur TERMINIERT gestellt werden kann. Sofort
 * einschliessen kann sich ein verschlossener Sub nicht (der Dienst lehnt das mit
 * `USER_ALREADY_LOCKED` ab), später sehr wohl — typisch „morgens und abends" bei stundenweisem Tragen.
 */
export function resolveLockFormArt(isLocked: boolean, mode: string | string[] | undefined): "ANFORDERUNG" | "SPERRZEIT" {
  return !isLocked || mode === LOCK_FORM_PLAN_MODE ? "ANFORDERUNG" : "SPERRZEIT";
}
