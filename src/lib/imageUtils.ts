import { readFile, unlink } from "fs/promises";
import { join, basename, sep } from "path";
import { randomBytes } from "crypto";
import sharp from "sharp";
import { structuredLog } from "@/lib/serverLog";

export const IMAGE_MEDIA_TYPES: Record<string, "image/jpeg" | "image/png" | "image/gif" | "image/webp"> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
};

export interface ImageData {
  base64: string;
  mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp";
}

/** Absoluter Pfad des Upload-Verzeichnisses (data/uploads). Single source für alle Upload-Pfade. */
export function uploadsDirPath(): string {
  return join(process.cwd(), "data", "uploads");
}

/** Erzeugt einen eindeutigen, nicht erratbaren Upload-Dateinamen (optionaler Prefix, z.B. "ref-").
 *  M8: kryptographisch zufällig (randomBytes) statt Date.now()+Math.random() — Dateiname ist eine
 *  (sekundäre) Verteidigungslinie für intime Fotopfade und darf nicht vorhersagbar sein. */
export function generateUploadFilename(prefix = ""): string {
  return `${prefix}${randomBytes(16).toString("hex")}.jpg`;
}

/**
 * H5 (Recht auf Vergessenwerden): Löscht hochgeladene Foto-Dateien sicher von der Platte.
 * Gleicher Pfad-Guard wie beim Laden (nur innerhalb data/uploads). Dedupliziert, ignoriert
 * null/leer und bereits fehlende Dateien (ENOENT). Wirft NIE — ein fehlgeschlagenes Löschen darf
 * den auslösenden Request (Entry/Device/User-Löschung) nicht scheitern lassen.
 */
export async function deleteUploadedFiles(imageUrls: Array<string | null | undefined>): Promise<void> {
  const uploadsDir = uploadsDirPath();
  const seen = new Set<string>();
  await Promise.all(
    imageUrls.map(async (url) => {
      if (!url) return;
      const filename = basename(url);
      if (!filename || seen.has(filename)) return;
      seen.add(filename);
      const fullPath = join(uploadsDir, filename);
      if (!fullPath.startsWith(uploadsDir + sep)) {
        structuredLog("imageUtils", "deleteUploadedFiles:path_traversal", { fullPath, uploadsDir });
        return;
      }
      try {
        await unlink(fullPath);
      } catch (e) {
        const err = e as NodeJS.ErrnoException;
        if (err.code !== "ENOENT") {
          structuredLog("imageUtils", "deleteUploadedFiles:failed", { fullPath, error: err.message });
        }
      }
    })
  );
}

/**
 * Loads a local upload file and returns base64 + mediaType.
 * Only allows files from the `data/uploads/` directory — rejects any path traversal.
 * Returns null if the file cannot be read or the filename is invalid.
 *
 * @param opts.maxPx  Wenn gesetzt, wird das Bild vor base64 auf diese Kantenlänge runterskaliert
 *   (JPEG) — für Vision-Anfragen, um Tokens/Latenz zu sparen.
 */
export async function loadUploadedImage(imageUrl: string, opts?: { maxPx?: number }): Promise<ImageData | null> {
  const filename = basename(imageUrl);
  if (!filename) {
    structuredLog("imageUtils", "loadUploadedImage:reject_filename", { filename, imageUrl });
    return null;
  }
  const uploadsDir = uploadsDirPath();
  const fullPath = join(uploadsDir, filename);
  // Path-prefix guard: ensure the resolved path stays inside the uploads directory.
  if (!fullPath.startsWith(uploadsDir + sep)) {
    structuredLog("imageUtils", "loadUploadedImage:path_traversal", { fullPath, uploadsDir });
    return null;
  }
  try {
    const raw = await readFile(fullPath);
    if (opts?.maxPx) {
      try {
        const buf = await sharp(raw)
          .rotate()
          .resize(opts.maxPx, opts.maxPx, { fit: "inside", withoutEnlargement: true })
          .jpeg({ quality: 85 })
          .toBuffer();
        return { base64: buf.toString("base64"), mediaType: "image/jpeg" };
      } catch (e) {
        structuredLog("imageUtils", "loadUploadedImage:resize_failed", { fullPath, error: (e as Error).message });
        // Fallback unten: Original ohne Resize
      }
    }
    const base64 = raw.toString("base64");
    const ext = filename.split(".").pop()?.toLowerCase() ?? "";
    const mediaType = IMAGE_MEDIA_TYPES[ext] ?? "image/jpeg";
    return { base64, mediaType };
  } catch (e) {
    structuredLog("imageUtils", "loadUploadedImage:read_failed", { fullPath, error: (e as Error).message });
    return null;
  }
}
