import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isCodePhotoRevealed } from "@/lib/queries";
import { isKeyholderOf } from "@/lib/keyholder";
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
  _req: NextRequest,
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

  // Zugriff: Datei-Eigentümer, globaler Admin ODER Keyholder des Eigentümers. Den Eigentümer über alle
  // Quellen ermitteln (NICHT auf den Abrufer eingeschränkt) → sonst sieht ein Keyholder das Bild nicht.
  const imageUrlInDb = `/api/uploads/${filename}`;
  const actorId = session.user.id;
  const isAdmin = session.user.role === "admin";
  const [entryOwner, deviceOwner, codePhoto, refOwner] = await Promise.all([
    prisma.entry.findFirst({ where: { imageUrl: imageUrlInDb }, select: { userId: true } }),
    prisma.device.findFirst({ where: { imageUrl: imageUrlInDb }, select: { userId: true } }),
    prisma.entry.findFirst({ where: { codeImageUrl: imageUrlInDb }, select: { userId: true, startTime: true } }),
    // Kuratiertes Geräte-Referenzfoto (DeviceReferenceImage)
    prisma.deviceReferenceImage.findFirst({ where: { imageUrl: imageUrlInDb }, select: { device: { select: { userId: true } } } }),
  ]);
  const ownerId = entryOwner?.userId ?? deviceOwner?.userId ?? codePhoto?.userId ?? refOwner?.device?.userId ?? null;
  const isOwner = ownerId != null && ownerId === actorId;
  // Keyholder-Zugriff ist strikt auf die EIGENEN Subs gescopt (isKeyholderOf prüft die konkrete Beziehung).
  const isKeyholder = !isOwner && !isAdmin && ownerId != null && (await isKeyholderOf(actorId, ownerId));
  if (!isOwner && !isAdmin && !isKeyholder) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  // Bildersafe: ein versiegeltes Code-Foto bleibt für den Owner gesperrt, bis Öffnen erlaubt ist
  // (oder die Session vorbei ist). Admin/Keyholder sieht es immer.
  if (codePhoto && !isAdmin && !isKeyholder && !(await isCodePhotoRevealed(codePhoto))) {
    return new NextResponse("Sealed", { status: 403 });
  }

  try {
    const buffer = await readFile(filepath);
    const ext = extname(filename).toLowerCase();
    const contentType = MIME[ext] ?? "application/octet-stream";
    // M9: intime Fotos sind auth-gated → niemals in geteilte Caches (Proxies/CDNs). `private`
    // erlaubt nur den Browser-Cache. Versiegelte Code-Fotos gar nicht cachen (no-store), damit ein
    // einmal freigegebenes Foto nach erneutem Versiegeln nicht weiter aus dem Cache kommt.
    const cacheControl = codePhoto ? "private, no-store" : "private, max-age=31536000, immutable";
    return new NextResponse(buffer, {
      headers: { "Content-Type": contentType, "Cache-Control": cacheControl },
    });
  } catch {
    return new NextResponse("Not Found", { status: 404 });
  }
}
