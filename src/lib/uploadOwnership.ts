import { basename } from "path";
import { prisma } from "@/lib/prisma";
import { isValidImageUrl } from "@/lib/constants";
import { isKeyholderOf } from "@/lib/keyholder";
import { isCodePhotoRevealed } from "@/lib/queries";

/**
 * **Wem gehört eine hochgeladene Datei?**
 *
 * Bis 6.6.0 war ein Bild nur durch seinen zufälligen Namen geschützt. Wer auf derselben Instanz ein
 * Konto hatte und einen Namen kannte (ehemalige Keyholder, Logzeilen), konnte ihn in eine EIGENE Zeile
 * hängen: die Auslieferung hielt ihn dann für den Besitzer (auch eines versiegelten Code-Fotos), und
 * das Löschen seiner Zeile entfernte die fremde Datei.
 *
 * Besitzer einer Datei sind seither:
 * - wer sie hochgeladen hat (`Upload.uploaderId`, geschrieben von `/api/upload`), und
 * - jeder Nutzer, dessen Zeile auf sie verweist (Eintrag, Gerät, Nachweis, Wiegung, Referenzbild).
 *
 * Der zweite Teil trägt den Bestand (Dateien von vor 6.6.0 haben keine `Upload`-Zeile) und den Fall,
 * dass die Keyholderin für ihren Sub fotografiert. Vertrauenswürdig ist er, weil eine Verknüpfung nur
 * noch über {@link uploadsLinkable} entsteht — niemand kann sich mehr selbst zum Besitzer machen.
 *
 * Jede Stelle, die einen Bildnamen ANNIMMT, fragt {@link uploadsLinkable}; die Auslieferung fragt
 * {@link uploadViewableBy}, jede Auswertung {@link uploadAnalyzableBy}. Alle drei prüfen das FORMAT
 * selbst mit (`isValidImageUrl`) — niemand kann die eine Hälfte ohne die andere einbauen. Eine neue Tabelle mit Bildspalte gehört in
 * {@link referenceOwners}, sonst ist ihr Bild für niemanden abrufbar.
 */

const urlOf = (filename: string) => `/api/uploads/${filename}`;

/** Trägt den Hochlader ein. Scheitert das Schreiben, scheitert der Upload — eine Datei ohne Besitzer
 *  liesse sich danach von niemandem verwenden. */
export async function recordUpload(filename: string, uploaderId: string): Promise<void> {
  await prisma.upload.create({ data: { filename, uploaderId } });
}

/** Die Besitz-Zeile einer Datei entfernen, die von der Platte verschwindet. */
export async function forgetUpload(filename: string): Promise<void> {
  await prisma.upload.deleteMany({ where: { filename } });
}

/** Die Nutzer, deren Zeilen auf die Datei verweisen, samt dem versiegelten Code-Foto, falls sie eines ist. */
async function referenceOwners(imageUrl: string) {
  const [entries, devices, refs, proofs, weights] = await Promise.all([
    prisma.entry.findMany({
      where: { OR: [{ imageUrl }, { codeImageUrl: imageUrl }, { boxImageUrl: imageUrl }] },
      select: { userId: true, codeImageUrl: true, startTime: true },
    }),
    prisma.device.findMany({ where: { imageUrl }, select: { userId: true } }),
    prisma.deviceReferenceImage.findMany({ where: { imageUrl }, select: { device: { select: { userId: true } } } }),
    prisma.taskProof.findMany({ where: { imageUrl }, select: { task: { select: { userId: true } } } }),
    prisma.weightEntry.findMany({ where: { imageUrl }, select: { userId: true } }),
  ]);
  const codePhoto = entries.find((e) => e.codeImageUrl === imageUrl) ?? null;
  return {
    ids: [
      ...entries.map((e) => e.userId), ...devices.map((d) => d.userId), ...refs.map((r) => r.device.userId),
      ...proofs.map((p) => p.task.userId), ...weights.map((w) => w.userId),
    ],
    codePhoto: codePhoto && { userId: codePhoto.userId, startTime: codePhoto.startTime },
  };
}

/** Besitzer einer Datei (Hochlader + Verweisende) und ob sie ein Code-Foto ist. */
async function uploadOwners(imageUrl: string) {
  const [upload, refs] = await Promise.all([
    prisma.upload.findUnique({ where: { filename: basename(imageUrl) }, select: { uploaderId: true } }),
    referenceOwners(imageUrl),
  ]);
  return { owners: new Set([...(upload ? [upload.uploaderId] : []), ...refs.ids]), codePhoto: refs.codePhoto };
}

/** Verweist noch irgendeine Zeile auf die Datei? Vor dem Löschen von der Platte zu fragen. */
export async function uploadReferenced(imageUrl: string): Promise<boolean> {
  return (await referenceOwners(imageUrl)).ids.length > 0;
}

/**
 * Darf jede dieser Dateien in eine Zeile von `forUserIds` gehängt werden? Erlaubt ist, was einem der
 * Genannten schon gehört — dem Handelnden selbst und, wo er für jemanden erfasst, diesem Träger.
 * Leere Werte zählen als erlaubt (kein Bild).
 */
export async function uploadsLinkable(imageUrls: readonly (string | null | undefined)[], forUserIds: readonly string[]): Promise<boolean> {
  const urls = [...new Set(imageUrls.filter((u): u is string => !!u))];
  const results = await Promise.all(urls.map(async (u) => {
    if (!isValidImageUrl(u)) return false;
    const { owners } = await uploadOwners(u);
    return forUserIds.some((id) => owners.has(id));
  }));
  return results.every(Boolean);
}

/**
 * Darf dieser Nutzer die Datei sehen oder auswerten lassen? Besitzer, globaler Admin oder Keyholder
 * eines Besitzers. Das Siegel des Bildersafes prüft die Auslieferung zusätzlich selbst.
 */
export async function uploadViewableBy(imageUrl: string, actor: { id: string; role?: string | null }) {
  if (!isValidImageUrl(imageUrl)) return { allowed: false, codePhoto: null };
  const { owners, codePhoto } = await uploadOwners(imageUrl);
  if (owners.has(actor.id) || actor.role === "admin") return { allowed: true, codePhoto };
  // Strikt auf die EIGENEN Subs: `isKeyholderOf` prüft die konkrete Beziehung.
  const related = await Promise.all([...owners].map((ownerId) => isKeyholderOf(actor.id, ownerId)));
  return { allowed: related.some(Boolean), codePhoto };
}

/**
 * Darf dieser Nutzer das Bild AUSWERTEN lassen (Siegel-, Code-, Gewichts-, Geräte-Erkennung)? Wie
 * {@link uploadViewableBy}, und zusätzlich nie das eigene, noch versiegelte Code-Foto: die Erkennung
 * gäbe sonst die Ziffern zurück, die die Auslieferung dem Träger gerade vorenthält.
 */
export async function uploadAnalyzableBy(imageUrl: string, actor: { id: string; role?: string | null }): Promise<boolean> {
  const { allowed, codePhoto } = await uploadViewableBy(imageUrl, actor);
  if (!allowed) return false;
  return !(codePhoto && codePhoto.userId === actor.id && !(await isCodePhotoRevealed(codePhoto)));
}
