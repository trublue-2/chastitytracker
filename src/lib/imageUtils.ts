import { readFile } from "fs/promises";
import { join, basename, sep } from "path";
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

/** Erzeugt einen eindeutigen Upload-Dateinamen (optionaler Prefix, z.B. "ref-"). */
export function generateUploadFilename(prefix = ""): string {
  return `${prefix}${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
}

/**
 * Loads a local upload file and returns base64 + mediaType.
 * Only allows files from the `data/uploads/` directory — rejects any path traversal.
 * Returns null if the file cannot be read or the filename is invalid.
 */
export async function loadUploadedImage(imageUrl: string): Promise<ImageData | null> {
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
    const base64 = raw.toString("base64");
    const ext = filename.split(".").pop()?.toLowerCase() ?? "";
    const mediaType = IMAGE_MEDIA_TYPES[ext] ?? "image/jpeg";
    return { base64, mediaType };
  } catch (e) {
    structuredLog("imageUtils", "loadUploadedImage:read_failed", { fullPath, error: (e as Error).message });
    return null;
  }
}
