/**
 * **Das Box-Foto wird erst NACH „Riegel zu" fällig.**
 *
 * Ein Foto durchs Sichtfenster belegt „der Schlüssel liegt in der Box" nur, wenn der Riegel schon zu
 * ist — bei offener Box lässt sich der Schlüssel danach wieder herausnehmen. Der Verschluss-Dialog
 * fragt deshalb nicht mehr danach; in dem Moment, in dem die Box den Riegel als zu meldet, setzt
 * `boxPhotoDueService.ts` `Entry.boxPhotoDueAt`, und das Dashboard fordert das Foto an. Das Bild
 * landet wie bisher in `Entry.boxImageUrl` des Verschlusses.
 *
 * **Importfrei** (wie `lockPending.ts`): Client-Komponenten und server-only Code teilen sich die Regel.
 */

/** Was eine Zeile mitbringen muss, damit die Frage beantwortbar ist. */
export type BoxPhotoDueRow = {
  type: string;
  keyInBox: boolean | null;
  boxImageUrl: string | null;
  boxPhotoDueAt: Date | null;
  boxPhotoWaivedAt: Date | null;
};

/**
 * Schuldet dieser Verschluss überhaupt ein Box-Foto? Ein Verschluss mit Schlüssel in der Box, der noch
 * keines trägt — die gemeinsame Hälfte von „wird jetzt fällig" und {@link isBoxPhotoDue}.
 */
export function needsBoxPhoto(e: Pick<BoxPhotoDueRow, "type" | "keyInBox" | "boxImageUrl">): boolean {
  return e.type === "VERSCHLUSS" && e.keyInBox === true && !e.boxImageUrl;
}

/**
 * Steht für diesen Verschluss ein Box-Foto aus? Gilt nur für den LAUFENDEN Verschluss — wer geöffnet
 * hat, bevor das Foto kam, wird nicht mehr gefragt; die Aufrufer reichen deshalb den jüngsten
 * KG-Eintrag herein. Erlassen (`boxPhotoWaivedAt`) beendet die Aufforderung ebenso wie ein Foto.
 */
export function isBoxPhotoDue(e: BoxPhotoDueRow): boolean {
  return needsBoxPhoto(e) && !!e.boxPhotoDueAt && !e.boxPhotoWaivedAt;
}

/** Wie weit die Aufnahmezeit VOR „Riegel zu" liegen darf, ohne verdächtig zu sein: Geräteuhr und Box-Uhr
 *  gehen nie gleich, und der Sub fotografiert womöglich schon, während die Meldung noch unterwegs ist. */
export const BOX_PHOTO_TAKEN_TOLERANCE_MS = 5 * 60 * 1000;

/**
 * Wurde das Foto vor dem Schliessen des Riegels aufgenommen? Ein Foto von vorher zeigt womöglich die noch
 * offene Box und belegt nichts. `takenAt` ist die vom Gerät gelieferte Aufnahmezeit; fehlt sie
 * (`null`), lässt sich nichts sagen — dann ist es NICHT „davor".
 */
export function boxPhotoTakenBeforeBolt(takenAt: Date | null, dueAt: Date): boolean {
  return takenAt !== null && takenAt.getTime() < dueAt.getTime() - BOX_PHOTO_TAKEN_TOLERANCE_MS;
}

/** Seit wann das Foto aussteht — `null`, wenn keines aussteht. */
export function boxPhotoDueAtOf(e: BoxPhotoDueRow): Date | null {
  return isBoxPhotoDue(e) ? e.boxPhotoDueAt : null;
}

/** Was {@link boxPhotoMissedAt} von einem Verschluss braucht. */
export type BoxPhotoMissedRow = Pick<BoxPhotoDueRow, "keyInBox" | "boxImageUrl" | "boxPhotoDueAt" | "boxPhotoWaivedAt"> & {
  boxPhotoSubmittedAt: Date | null;
};

/**
 * Wann wurde das Box-Foto dieses Verschlusses VERSÄUMT — `null`, wenn nicht (Vergehen `box_photo_missing`).
 *
 * Versäumt ist es, wenn die Frist (`deadlineHours` ab „Riegel zu" = `boxPhotoDueAt`) abgelaufen ist und bis
 * dahin weder ein Foto kam noch die Keyholderin es erlassen hat. Der Zeitpunkt des Vergehens ist das
 * Fristende. Kein Vergehen:
 * - **vor dem Stichtag** (`enforcedFrom`, je Instanz aus der Migration): die Frist gab es damals nicht;
 * - **wenn vor Fristende geöffnet wurde** (`endedAt`): das Foto hätte nichts mehr belegt;
 * - für ein Foto ohne Ankunftszeit (`boxPhotoSubmittedAt` fehlt bei Fotos aus der Zeit vor dieser Regel):
 *   es kam, wann genau, weiss niemand — im Zweifel rechtzeitig.
 *
 * Ein Erlass oder ein Foto NACH Fristende hebt das Vergehen nicht auf; die Keyholderin verwirft es dann im
 * Strafbuch wie jedes andere.
 */
export function boxPhotoMissedAt(
  e: BoxPhotoMissedRow,
  opts: { deadlineHours: number; enforcedFrom: Date; endedAt: Date | null; now: Date },
): Date | null {
  if (e.keyInBox !== true || !e.boxPhotoDueAt) return null;
  if (e.boxPhotoDueAt.getTime() < opts.enforcedFrom.getTime()) return null;
  const deadline = new Date(e.boxPhotoDueAt.getTime() + opts.deadlineHours * 3_600_000);
  if (opts.now.getTime() < deadline.getTime()) return null;
  if (opts.endedAt && opts.endedAt.getTime() <= deadline.getTime()) return null;
  if (e.boxPhotoWaivedAt && e.boxPhotoWaivedAt.getTime() <= deadline.getTime()) return null;
  if (e.boxImageUrl && (!e.boxPhotoSubmittedAt || e.boxPhotoSubmittedAt.getTime() <= deadline.getTime())) return null;
  return deadline;
}

/** refId des Vergehens: eigener Namensraum, weil die Verschluss-id schon `wrong_device` gehört und
 *  `StrafeRecord.refId` global eindeutig ist (wie `relock:` bei `cleaning_not_relocked`). */
export function boxPhotoMissingRef(entryId: string): string {
  return `boxphoto:${entryId}`;
}
