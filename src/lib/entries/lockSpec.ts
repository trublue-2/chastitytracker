/**
 * Die Sperr-Vorgabe einer Einschliess-Anforderung: was nach dem Einschliessen gilt. Drei Alternativen
 * (Mindestdauer, absolutes Ende, unbefristet), höchstens eine davon gesetzt.
 *
 * Bewusst ohne Imports: das Formular (Client) braucht dieselbe Regel wie Dienst und MCP, und der
 * Dienst zieht Prisma nach sich.
 */

/** Die drei Sperr-Vorgaben einer Anforderung, wie sie Zeile, Patch und Werkzeug-Argumente tragen. */
export type LockSpec = { minDurationHours?: number | null; lockEndsAt?: unknown; lockIndefinite?: boolean | null };

/** Wie viele der drei Sperr-Vorgaben (Mindestdauer, absolutes Ende, unbefristet) gesetzt sind — die
 *  EINE Stelle, die sie aufzählt. Eine vierte Vorgabe kommt hier dazu und sonst nirgends. */
function lockSpecCount(spec: LockSpec): number {
  // Eine Mindestdauer von 0 h ist keine: `lockPeriodFromRequest` legt aus ihr keine Sperrzeit an, und
  // diese Zählung muss dieselbe Antwort geben (sonst behielte das Reinigungs-Flag ein leeres Versprechen).
  return [!!spec.minDurationHours, spec.lockEndsAt != null, spec.lockIndefinite === true].filter(Boolean).length;
}

/** Bringt die Angabe überhaupt eine Sperr-Vorgabe mit? */
export function hasLockSpec(spec: LockSpec): boolean {
  return lockSpecCount(spec) > 0;
}

/**
 * Mehr als EINE Sperr-Vorgabe in derselben Angabe? Die drei sind Alternativen — der Code dazu ist
 * `LOCK_DURATION_OR_END`. Geteilt von Anlegen, Ändern und den dryRun-Vorschauen der MCP-Werkzeuge,
 * damit die Vorschau dieselbe Absage liefert wie der Commit.
 */
export function conflictingLockSpecs(spec: LockSpec): boolean {
  return lockSpecCount(spec) > 1;
}
