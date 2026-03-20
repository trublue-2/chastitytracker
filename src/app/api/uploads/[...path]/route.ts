import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { readFile } from "fs/promises";
import { join, extname } from "path";

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

  // Prevent path traversal
  if (filename.includes("..")) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const uploadsDir = join(process.cwd(), "data", "uploads");
  const filepath = join(uploadsDir, filename);

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
