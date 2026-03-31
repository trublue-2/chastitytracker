import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
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

  // Ownership: only the entry owner or an admin may access the file
  const imageUrlInDb = `/api/uploads/${filename}`;
  const ownedEntry = await prisma.entry.findFirst({
    where: { imageUrl: imageUrlInDb, userId: session.user.id },
    select: { id: true },
  });
  if (!ownedEntry && session.user.role !== "admin") {
    return new NextResponse("Forbidden", { status: 403 });
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
