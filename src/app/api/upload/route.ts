import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import exifr from "exifr";
import sharp from "sharp";
import { trackEvent } from "@/lib/telemetry";

function isAllowedImageBuffer(buf: Buffer): boolean {
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return true;
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return true;
  // GIF: 47 49 46 38
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) return true;
  // WebP: RIFF....WEBP
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
      buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) return true;
  // HEIC/HEIF: ftyp at offset 4
  if (buf.length > 11 && buf.slice(4, 8).toString("ascii") === "ftyp") return true;
  return false;
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  // Validate file extension (whitelist)
  const ALLOWED_EXTENSIONS = ["jpg", "jpeg", "png", "gif", "webp", "heic", "heif"];
  const rawExt = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!ALLOWED_EXTENSIONS.includes(rawExt)) {
    return NextResponse.json({ error: "Ungültiger Dateityp" }, { status: 400 });
  }

  // Validate file size (max 10 MB)
  const MAX_SIZE = 10 * 1024 * 1024;
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "Datei zu gross (max. 10 MB)" }, { status: 400 });
  }

  // Client-side EXIF (sent from browser before iOS strips it)
  const clientExifTime = formData.get("clientExifTime") as string | null;

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);

  // Validate MIME type via magic bytes (server-side, not spoofable)
  if (!isAllowedImageBuffer(buffer)) {
    return NextResponse.json({ error: "Ungültiger Dateityp (MIME)" }, { status: 400 });
  }

  const uploadsDir = join(process.cwd(), "data", "uploads");
  await mkdir(uploadsDir, { recursive: true });

  const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
  const filepath = join(uploadsDir, filename);

  let compressed: Buffer;
  try {
    compressed = await sharp(buffer)
      .resize({ width: 1920, withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();
  } catch {
    compressed = buffer;
  }

  await writeFile(filepath, compressed);

  // Prefer client-provided EXIF time (survives iOS Safari stripping)
  let exifTime: string | null = clientExifTime || null;

  if (!exifTime) {
    // Fallback: server-side EXIF parsing
    try {
      const exif = await exifr.parse(buffer, { pick: ["DateTimeOriginal", "DateTime"] });
      const raw = exif?.DateTimeOriginal ?? exif?.DateTime ?? null;
      if (raw instanceof Date) {
        exifTime = raw.toISOString();
      } else if (typeof raw === "string") {
        const normalized = raw.replace(/^(\d{4}):(\d{2}):(\d{2})/, "$1-$2-$3");
        const parsed = new Date(normalized);
        if (!isNaN(parsed.getTime())) {
          exifTime = parsed.toISOString();
        }
      }
    } catch {
      // No EXIF data available
    }
  }

  trackEvent("upload.success");
  return NextResponse.json({ url: `/api/uploads/${filename}`, exifTime });
}
