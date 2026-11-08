import type { Prisma } from "@prisma/client";
import { isHiddenFromSub } from "@/lib/delayedTrigger";

/*
 * Das Verschieben einer offenen Kontrollfrist — geteilt von der Verlängerung durch die Keyholderin
 * (`extendInspectionDeadline`, kontrolleService.ts) und dem Fristen-Joker des Trägers
 * (`inspectionJoker.ts`). Eigenes Modul, damit beide es nutzen, ohne einander zu importieren.
 */

/** Ob sich die Frist dieser Kontrolle auf `newDeadline` verlängern lässt — der Code des Grundes,
 *  sonst `null`. Rein und schreibfrei: der Commit (`extendInspectionDeadline`) und die
 *  MCP-Vorschau rufen DIESELBE Funktion, damit die Vorschau nie Erfolg für einen Commit verspricht,
 *  der mit 400 endet. */
export function extendInspectionProblem(
  ka: { entryId: string | null; withdrawnAt: Date | null; autoMarkedRemovedAt: Date | null; wirksamAb: Date | null; benachrichtigtAt: Date | null; deadline: Date },
  newDeadline: Date,
  now: Date,
): "INSPECTION_NOT_EXTENDABLE" | "INSPECTION_DEADLINE_NOT_LATER" | null {
  // Erfüllt, zurückgezogen, von der Eskalation gebucht — oder noch gar nicht zugestellt: deren
  // Frist rechnet der Zusteller beim Auslösen aus (`deadlineFromDispatch`), sie hier zu setzen
  // würde überschrieben.
  if (ka.entryId || ka.withdrawnAt || ka.autoMarkedRemovedAt || isHiddenFromSub(ka)) return "INSPECTION_NOT_EXTENDABLE";
  if (newDeadline.getTime() <= Math.max(ka.deadline.getTime(), now.getTime())) return "INSPECTION_DEADLINE_NOT_LATER";
  return null;
}

/**
 * Das bedingte Schreiben einer neuen Frist: nur, solange die Kontrolle offen ist, und mit allem
 * zurückgesetzt, was ab der FRIST zählt. Heute ist das der Mahn-Stempel (`benachrichtigtReminderAt`):
 * beide Eskalationsstufen zählen ab der Frist, die Mahnung der alten wäre sonst für die neue
 * verbraucht und Stufe 2 liefe schon ab ihr. Ein künftiger Stempel derselben Art gehört HIER dazu —
 * sonst eskalierte eine verschobene Frist auf einem der beiden Wege zu früh.
 *
 * Bedingt statt `update`: zwischen Prüfung und Schreiben kann der Träger einreichen oder die
 * Eskalation die Kontrolle buchen. `extra` ergänzt Bedingung und Daten eines Aufrufers (der Joker).
 */
export function inspectionDeadlineWrite(
  id: string,
  newDeadline: Date,
  extra: { where?: Prisma.KontrollAnforderungWhereInput; data?: Prisma.KontrollAnforderungUncheckedUpdateManyInput } = {},
): Prisma.KontrollAnforderungUpdateManyArgs {
  return {
    where: { id, entryId: null, withdrawnAt: null, autoMarkedRemovedAt: null, ...extra.where },
    data: { deadline: newDeadline, benachrichtigtReminderAt: null, ...extra.data },
  };
}
