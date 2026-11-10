import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isCodePhotoRevealed } from "@/lib/queries";
import { uploadViewableBy } from "@/lib/uploadOwnership";
import { readFile } from "fs/promises";
import { join, extname, resolve, sep } from "path";

const MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".heic": "image/heic",
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const session = await auth();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  const { path } = await params;
  const filename = path.join("/");

  // Prevent path traversal via resolve + prefix check
  const uploadsDir = resolve(join(process.cwd(), "data", "uploads"));
  const filepath = resolve(join(uploadsDir, filename));
  if (!filepath.startsWith(uploadsDir + sep)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  // Zugriff: Besitzer der Datei, globaler Admin ODER Keyholder eines Besitzers. Wer Besitzer ist,
  // sagt `uploadOwnership.ts` — der Hochlader und jeder, dessen Zeile auf die Datei verweist.
  const actorId = session.user.id;
  const { allowed, codePhoto } = await uploadViewableBy(`/api/uploads/${filename}`, session.user);
  if (!allowed) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  // Bildersafe: ein versiegeltes Code-Foto bleibt für den Besitzer gesperrt, bis nach dem Verschluss
  // eine Öffnung erfasst ist. Das gilt auch, wenn der Besitzer Admin ist — auf einer selbst
  // betriebenen Instanz ist der Träger oft der Admin, und die Ausnahme hob das Siegel für ihn auf
  // (Issue #111). Keyholder und fremde Admins sehen es immer.
  if (codePhoto && codePhoto.userId === actorId && !(await isCodePhotoRevealed(codePhoto))) {
    return new NextResponse("Sealed", { status: 403 });
  }

  // M9: intime Fotos sind auth-gated → niemals in geteilte Caches (`private`). Der Browser darf sie
  // behalten, muss aber vor JEDER Verwendung nachfragen (`no-cache`): bis 6.6.0 galten sie ein Jahr
  // lang ohne Rückfrage, auch nach dem Abmelden und nach dem Ende einer Keyholder-Beziehung. Der
  // Dateiname ist zufällig und der Inhalt ändert sich nie — er IST das ETag; die Rückfrage kostet
  // dann nur diese Prüfung, nicht das Bild. Versiegelte Code-Fotos gar nicht cachen (`no-store`).
  const etag = `"${filename}"`;
  const cacheControl = codePhoto ? "private, no-store" : "private, no-cache";
  if (!codePhoto && req.headers.get("if-none-match") === etag) {
    return new NextResponse(null, { status: 304, headers: { ETag: etag, "Cache-Control": cacheControl } });
  }

  try {
    const buffer = await readFile(filepath);
    const ext = extname(filename).toLowerCase();
    const contentType = MIME[ext] ?? "application/octet-stream";
    return new NextResponse(buffer, {
      headers: { "Content-Type": contentType, "Cache-Control": cacheControl, ...(codePhoto ? {} : { ETag: etag }) },
    });
  } catch {
    return new NextResponse("Not Found", { status: 404 });
  }
}
