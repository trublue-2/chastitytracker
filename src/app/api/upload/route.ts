import { NextRequest, NextResponse } from "next/server";
import { requireApi } from "@/lib/authGuards";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import exifr from "exifr";
import sharp from "sharp";
import { trackEvent } from "@/lib/telemetry";
import { uploadsDirPath, generateUploadFilename } from "@/lib/imageUtils";
import { fromDatetimeLocal, APP_TZ } from "@/lib/utils";

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
  const session = await requireApi();
  if (session instanceof NextResponse) return session;

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
  // Upload ist immer das eigene Foto → die Zeitzone des hochladenden Subs governiert die Auslegung
  // einer nackten (tz-losen) EXIF-Wanduhrzeit.
  const tz = session.user.timezone ?? APP_TZ;

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);

  // Validate MIME type via magic bytes (server-side, not spoofable)
  if (!isAllowedImageBuffer(buffer)) {
    return NextResponse.json({ error: "Ungültiger Dateityp (MIME)" }, { status: 400 });
  }

  const uploadsDir = uploadsDirPath();
  await mkdir(uploadsDir, { recursive: true });

  const filename = generateUploadFilename();
  const filepath = join(uploadsDir, filename);

  // Zeit + GPS aus dem ROHEN Puffer lesen, BEVOR gespeichert wird (exifr liest auch HEIC). Die
  // Aufnahmezeit für den Abgleich ist damit IMMER verfügbar — unabhängig davon, ob sharp das Bild
  // verarbeiten kann. clientExifTime (file.lastModified) hat Vorrang (überlebt iOS-Safari-Stripping).
  let exifTime: string | null = clientExifTime || null;
  let hasGps = false;
  try {
    const gps = await exifr.gps(buffer);
    hasGps = !!gps && (gps.latitude != null || gps.longitude != null);
  } catch { /* keine/unlesbare GPS-Daten */ }
  if (!exifTime) {
    try {
      // reviveValues:false → DateTimeOriginal kommt als ROHER String ("YYYY:MM:DD HH:MM:SS"): eine
      // Kamera-WANDUHRZEIT ohne Zeitzone. Diese in der Sub-Zeitzone auslegen → korrektes UTC. Vorher
      // wurde sie via `new Date(...)`/exifr als Server-Lokalzeit (UTC im Container) fehlinterpretiert →
      // über Zeitzonen falscher Instant und dadurch falsche „Zeit korrigiert"-Warnungen.
      const exif = await exifr.parse(buffer, { pick: ["DateTimeOriginal", "DateTime"], reviveValues: false });
      const raw = exif?.DateTimeOriginal ?? exif?.DateTime ?? null;
      if (typeof raw === "string") {
        const m = /^(\d{4})[:-](\d{2})[:-](\d{2})[ T](\d{2}):(\d{2})/.exec(raw);
        if (m) {
          const parsed = fromDatetimeLocal(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}`, tz);
          if (!isNaN(parsed.getTime())) exifTime = parsed.toISOString();
        }
      }
    } catch { /* keine EXIF-Zeit verfügbar */ }
  }

  // H4: sharp re-encodiert zu JPEG und verwirft dabei ALLE Metadaten inkl. GPS (kein .withMetadata()).
  let compressed: Buffer | null = null;
  try {
    compressed = await sharp(buffer)
      .resize({ width: 1920, withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();
  } catch {
    compressed = null;
  }

  if (compressed) {
    await writeFile(filepath, compressed); // GPS-frei (re-encodiert)
  } else if (!hasGps) {
    // sharp konnte das Bild nicht verarbeiten (z.B. HEIC ohne Codec), es enthält aber KEINE
    // GPS-Daten → das Original ist unbedenklich speicherbar. Die Zeit ist oben bereits erfasst.
    await writeFile(filepath, buffer);
  } else {
    // Unverarbeitbar UND mit Standortdaten → niemals roh speichern (GPS-Leak, H4). Ablehnen.
    return NextResponse.json(
      { error: "Bild mit Standortdaten konnte nicht bereinigt werden — bitte als JPEG hochladen." },
      { status: 422 }
    );
  }

  trackEvent("upload.success");
  return NextResponse.json({ url: `/api/uploads/${filename}`, exifTime });
}
