import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { CLIENT_CLOCK_SKEW_MS, isValidImageUrl, parseRotation } from "@/lib/constants";
import { boxReportsFreshlyLocked } from "@/lib/boxStatus";
import { getLatestKgEntry } from "@/lib/queries";
import { detectKeyInBox } from "@/lib/verifyCode";
import { announceBoxPhotoDue } from "@/lib/boxCommandNotify";
import { boxPhotoDueAtOf, boxPhotoTakenBeforeBolt, isBoxPhotoDue, needsBoxPhoto } from "@/lib/boxPhotoDue";
import { serviceFail, type ServiceResult } from "@/lib/serviceResult";

/**
 * Das Box-Foto kommt NACH dem Riegel (Regel und Begründung: `boxPhotoDue.ts`). Dieser Dienst setzt
 * den Zeitpunkt, an dem es fällig wird, nimmt das Foto entgegen und lässt es die Keyholderin erlassen.
 */

type Db = Prisma.TransactionClient | typeof prisma;

/**
 * Die Box hat „Riegel zu" gemeldet: stellt das Box-Foto des LAUFENDEN Verschlusses fällig und sagt es
 * dem Träger an. `true` = jetzt fällig geworden.
 *
 * Läuft bei JEDER „Riegel zu"-Meldung, und die ist der Dauerzustand der Box — der übliche Ausgang ist
 * deshalb ein Lesen ohne Schreiben: das Foto ist schon da, schon fällig, oder der Schlüssel liegt
 * gar nicht in der Box (Reise). Fällig wird es genau EINMAL je Verschluss (`boxPhotoDueAt` bleibt).
 * Verschlüsse, die älter sind als diese Regel, hat die Migration auf „erlassen" gestellt.
 *
 * Wirft nie: die Aufrufer sind die Box-Eingänge, die ihre Antwort in JEDEM Fall bekommen müssen, und
 * der Verschluss-Pfad, der wegen eines fehlenden Fälligkeits-Stempels nicht scheitern darf.
 */
export async function markBoxPhotoDue(userId: string): Promise<boolean> {
  try {
    const lock = await getLatestKgEntry(userId);
    if (!lock || !needsBoxPhoto(lock) || lock.boxPhotoDueAt) return false;
    // `boxPhotoDueAt: null` im Where: zwei gleichzeitige Meldungen stellen es nur einmal fällig.
    const { count } = await prisma.entry.updateMany({ where: { id: lock.id, boxPhotoDueAt: null }, data: { boxPhotoDueAt: new Date() } });
    if (count === 0) return false;
    announceBoxPhotoDue(userId);
    return true;
  } catch (e) {
    console.error("[boxPhotoDue] markBoxPhotoDue failed", (e as Error).message);
    return false;
  }
}

/** Wie {@link markBoxPhotoDue}, aber nur, wenn die Box den Riegel JETZT SCHON frisch zu meldet — der
 *  Weg für einen Verschluss, der beim Anlegen nichts mehr abwartet (`lockAwaitsBolt` Fall 4): es
 *  käme sonst keine neue Meldung, und das Foto würde nie fällig. */
export async function markBoxPhotoDueIfBoxLocked(userId: string): Promise<boolean> {
  try {
    const boxes = await prisma.boxStatus.findMany({ where: { userId }, select: { reportedLocked: true, lastSyncAt: true } });
    return boxReportsFreshlyLocked(boxes, Date.now()) && (await markBoxPhotoDue(userId));
  } catch (e) {
    console.error("[boxPhotoDue] markBoxPhotoDueIfBoxLocked failed", (e as Error).message);
    return false;
  }
}

/** Der LAUFENDE Verschluss dieses Trägers, wenn er ein fälliges Box-Foto trägt (`entryId`: und zwar
 *  genau dieser). Auch die Vorschau des MCP-Werkzeugs liest hier, damit sie dieselbe Frage stellt wie
 *  der Commit. */
export async function dueBoxPhotoLock(userId: string, entryId?: string, db: Db = prisma) {
  const lock = await getLatestKgEntry(userId, db);
  return lock && (!entryId || lock.id === entryId) && isBoxPhotoDue(lock) ? lock : null;
}

/** Seit wann das Box-Foto des laufenden Verschlusses aussteht — `null`, wenn keines aussteht. Für die
 *  MCP-Sichten, die der Keyholderin zeigen, dass der Träger noch etwas schuldet. */
export async function boxPhotoDueSince(userId: string): Promise<Date | null> {
  const lock = await getLatestKgEntry(userId);
  return lock ? boxPhotoDueAtOf(lock) : null;
}

/**
 * Replay-Schutz fürs Box-Foto: dieselbe Aufnahme darf nicht ein zweites Mal als Nachweis dienen. Ohne
 * ihn könnte der Sub die URL seines ersten Fotos abschreiben und bei jeder Kontrolle erneut schicken —
 * der Nachweis „der Schlüssel liegt NOCH drin" wäre eine Momentaufnahme von vor Wochen. Das Haupt-Foto
 * ist über die EXIF-Zeit gedeckt, das Box-Foto hat keine; hier ist die Eindeutigkeit der Datei die
 * Deckung. Geteilt vom Anlegen (Kontrolle) und vom Nachreichen.
 */
export async function boxPhotoReused(url: string): Promise<boolean> {
  return !!(await prisma.entry.findFirst({ where: { boxImageUrl: url }, select: { id: true } }));
}

/**
 * Schlüssel-Erkennung auf dem Box-Foto — server-seitig und fire-and-forget. Der Client schickt NUR das
 * Foto, nie das Urteil: ein Nachweis, den der Nachzuweisende selbst formuliert, ist keiner. Ohne
 * Urteil (`null`: keine Vision) bleibt die Spalte, wie sie ist — `null` heisst „nicht geprüft".
 */
export function detectKeyInBoxInBackground(entryId: string, photoUrl: string, rotation: unknown): void {
  const safeRotation = parseRotation(rotation);
  (async () => {
    const detected = await detectKeyInBox(photoUrl, safeRotation);
    if (detected === null) return;
    try {
      await prisma.entry.update({ where: { id: entryId }, data: { keyDetected: detected } });
    } catch (err) {
      console.error("[boxPhotoDue] keyDetected write failed for entry", entryId, err);
    }
  })();
}

/** Die gelieferte Aufnahmezeit als Datum — `null`, wenn sie fehlt, unlesbar ist oder in der Zukunft liegt
 *  (Geräteuhr falsch gestellt: eine solche Zeit sagte nichts über die Frische). */
function parseTakenAt(v: unknown): Date | null {
  if (typeof v !== "string" || !v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) || d.getTime() > Date.now() + CLIENT_CLOCK_SKEW_MS ? null : d;
}

/** Der Träger reicht das fällige Foto nach. Es hängt am Verschluss, wo es bisher auch hing. */
export async function submitBoxPhoto(userId: string, entryId: string, input: { boxImageUrl: unknown; boxImageRotation?: unknown; boxImageExifTime?: unknown }): Promise<ServiceResult<{ entryId: string }>> {
  const url = typeof input.boxImageUrl === "string" ? input.boxImageUrl : "";
  // Derselbe Pfad-Guard wie überall: das Bild geht an die Vision, eine fremde URL wäre ein SSRF-Hebel.
  if (!url || !isValidImageUrl(url)) return serviceFail(400, "INVALID_IMAGE_URL");
  if (!(await prisma.entry.findFirst({ where: { id: entryId, userId }, select: { id: true } }))) return serviceFail(404, "NOT_FOUND");
  const lock = await dueBoxPhotoLock(userId, entryId);
  if (!lock) return serviceFail(409, "BOX_PHOTO_NOT_DUE");
  if (await boxPhotoReused(url)) return serviceFail(400, "BOX_PHOTO_REUSED");
  // Aufnahmezeit: vom Client (EXIF, sonst Dateizeit — `/api/upload`). Angenommen wird auch ein Foto von
  // VOR dem Riegel, aber markiert; eine Zeit in der Zukunft oder ein Unsinnswert zählt als unbekannt.
  const takenAt = parseTakenAt(input.boxImageExifTime);
  // `boxImageUrl: null` im Where: ein zweiter, gleichzeitiger Aufruf überschreibt das erste Foto nicht.
  const { count } = await prisma.entry.updateMany({
    where: { id: entryId, userId, boxImageUrl: null },
    // `dueBoxPhotoLock` liefert nur Verschlüsse mit gesetztem `boxPhotoDueAt` (isBoxPhotoDue).
    data: { boxImageUrl: url, boxImageBeforeBolt: boxPhotoTakenBeforeBolt(takenAt, lock.boxPhotoDueAt!) },
  });
  if (count === 0) return serviceFail(409, "BOX_PHOTO_NOT_DUE");
  detectKeyInBoxInBackground(entryId, url, input.boxImageRotation);
  return { ok: true, data: { entryId } };
}

/** Die Keyholderin erlässt das Foto — der Notausgang, wenn es nicht zu beschaffen ist (Kamera defekt,
 *  Schlüssel im Fenster nicht zu erkennen). Der Verschluss selbst bleibt unberührt. */
export async function waiveBoxPhoto(userId: string, db: Db = prisma): Promise<ServiceResult<{ entryId: string }>> {
  const lock = await dueBoxPhotoLock(userId, undefined, db);
  if (!lock) return serviceFail(409, "BOX_PHOTO_NOT_DUE");
  await db.entry.update({ where: { id: lock.id }, data: { boxPhotoWaivedAt: new Date() } });
  return { ok: true, data: { entryId: lock.id } };
}
