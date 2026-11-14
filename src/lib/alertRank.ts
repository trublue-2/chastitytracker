/**
 * Welche Pflicht auf dem Dashboard GROSS steht.
 *
 * Kontrolle, Einschliess-Anforderung und Orgasmus-Anweisung kamen je als eigener grosser Block
 * untereinander — drei Aufforderungen gleichen Gewichts, jede mit eigenem Knopf, und der Träger
 * musste selbst entscheiden, womit er anfängt. Jetzt führt EINE; die anderen stehen darunter
 * kompakt, aber vollständig.
 *
 * Rangfolge: überfällig vor allem anderen, dann die knappere Frist, ohne Frist zuletzt; bei
 * Gleichstand Kontrolle vor Einschliessen (die Kontrolle hat die härteren Folgen). Das Orgasmus-
 * Fenster führt nie vor einer Kontrolle oder Einschliess-Anforderung, nur allein: es hat keinen
 * Knopf, und die zwei anderen sind die, die den einen gefüllten Knopf des Bildschirms tragen.
 * Rein und importfrei, damit genau diese Auswahl prüfbar bleibt.
 */
export type AlertKind = "inspection" | "lockRequest" | "orgasm";

export interface AlertCandidate {
  kind: AlertKind;
  /** Frist in ms seit Epoch; `null` = keine. */
  dueAtMs: number | null;
  overdue: boolean;
}

export function leadAlertKind(candidates: readonly (AlertCandidate | null)[]): AlertKind | null {
  const open = candidates.filter((c): c is AlertCandidate => c !== null);
  const actionable = open.filter((c) => c.kind !== "orgasm");
  const pool = actionable.length > 0 ? actionable : open;
  if (pool.length === 0) return null;
  const sorted = [...pool].sort((a, b) =>
    Number(b.overdue) - Number(a.overdue)
    || (a.dueAtMs ?? Infinity) - (b.dueAtMs ?? Infinity)
    // Gleichstand: die Kontrolle zuerst.
    || Number(b.kind === "inspection") - Number(a.kind === "inspection"));
  return sorted[0].kind;
}
