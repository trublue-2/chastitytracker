import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isCodePhotoRevealed } from "@/lib/queries";
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

  // Ownership: file owner (Entry, Device, or sealed code photo) or admin may access.
  const imageUrlInDb = `/api/uploads/${filename}`;
  const isAdmin = session.user.role === "admin";
  const [ownedEntry, ownedDevice, codeEntry, ownedReference] = await Promise.all([
    prisma.entry.findFirst({
      where: { imageUrl: imageUrlInDb, userId: session.user.id },
      select: { id: true },
    }),
    prisma.device.findFirst({
      where: { imageUrl: imageUrlInDb, userId: session.user.id },
      select: { id: true },
    }),
    prisma.entry.findFirst({
      where: { codeImageUrl: imageUrlInDb, userId: session.user.id },
      select: { userId: true, startTime: true },
    }),
    // Kuratiertes Geräte-Referenzfoto (DeviceReferenceImage) des eigenen Geräts
    prisma.deviceReferenceImage.findFirst({
      where: { imageUrl: imageUrlInDb, device: { userId: session.user.id } },
      select: { id: true },
    }),
  ]);
  if (!ownedEntry && !ownedDevice && !codeEntry && !ownedReference && !isAdmin) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  // Bildersafe: ein versiegeltes Code-Foto bleibt für den Owner gesperrt, bis Öffnen erlaubt ist
  // (oder die Session vorbei ist). Admin/Keyholder sieht es immer.
  if (codeEntry && !isAdmin && !(await isCodePhotoRevealed(codeEntry))) {
    return new NextResponse("Sealed", { status: 403 });
  }

  try {
    const buffer = await readFile(filepath);
    const ext = extname(filename).toLowerCase();
    const contentType = MIME[ext] ?? "application/octet-stream";
    return new NextResponse(buffer, {
      headers: { "Content-Type": contentType, "Cache-Control": "public, max-age=31536000, immutable" },
    });
  } catch {
    return new NextResponse("Not Found", { status: 404 });
  }
}
