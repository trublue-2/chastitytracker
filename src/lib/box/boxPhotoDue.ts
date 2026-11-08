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
