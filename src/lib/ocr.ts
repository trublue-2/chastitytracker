import sharp from "sharp";
import { spawn } from "child_process";
import { loadUploadedImage } from "@/lib/imageUtils";
import { structuredLog } from "@/lib/serverLog";

/**
 * Lokale, KI-freie Ziffern-OCR via Tesseract (im Docker-Image: `apk add tesseract-ocr`).
 * Datenschutzfreundlich — das Bild verlässt den Container NICHT. Gedacht als Fallback für
 * GEDRUCKTE Ziffern (Plomben/Siegel) wenn kein ANTHROPIC_API_KEY gesetzt ist. Für Handschrift
 * (Kontroll-Codes) ungeeignet — dort bleibt es bei KI bzw. manueller Verifikation.
 *
 * Immer „best effort": fehlt das tesseract-Binary, schlägt es fehl oder liest es nichts
 * Plausibles, wird `null` zurückgegeben — nie geworfen.
 */

const OCR_TIMEOUT_MS = 8000;

/** Bild für OCR aufbereiten: aufrichten, graustufen, Kontrast normalisieren, hochskalieren,
 *  schärfen → PNG. Hochskalieren hilft Tesseract bei kleinen Ziffern erheblich. */
async function preprocess(raw: Buffer, rotation: number): Promise<Buffer> {
  return sharp(raw)
    .rotate(rotation || 0)
    .grayscale()
    .normalize()
    .resize(1400, 1400, { fit: "inside", withoutEnlargement: false })
    .sharpen()
    .png()
    .toBuffer();
}

/** Eine tesseract-Ausführung (stdin→stdout) mit Ziffern-Whitelist. */
function runTesseract(png: Buffer, psm: number): Promise<string | null> {
  return new Promise((resolve) => {
    let proc;
    try {
      proc = spawn("tesseract", [
        "stdin",
        "stdout",
        "--psm",
        String(psm),
        "-c",
        "tessedit_char_whitelist=0123456789",
        "-c",
        "classify_bln_numeric_mode=1",
      ]);
    } catch {
      return resolve(null); // Binary nicht vorhanden
    }

    let out = "";
    let settled = false;
    const finish = (v: string | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(v);
    };
    const timer = setTimeout(() => {
      try { proc!.kill("SIGKILL"); } catch { /* ignore */ }
      finish(null);
    }, OCR_TIMEOUT_MS);
    if (typeof timer.unref === "function") timer.unref();

    proc.on("error", () => finish(null)); // z.B. ENOENT (Binary fehlt)
    proc.stdout.on("data", (d: Buffer) => { out += d.toString(); });
    proc.stderr.on("data", () => { /* tesseract loggt Fortschritt auf stderr — ignorieren */ });
    proc.on("close", (code: number) => finish(code === 0 ? out : null));
    proc.stdin.on("error", () => { /* EPIPE ignorieren, close behandelt das Ergebnis */ });
    proc.stdin.end(png);
  });
}

export interface DigitOcrOptions {
  rotation?: number;
  minLen?: number;
  maxLen?: number;
}

/**
 * Liest eine zusammenhängende Ziffernfolge (minLen..maxLen) aus einem hochgeladenen Bild.
 * Gibt den Ziffern-String zurück oder `null`, wenn nichts Plausibles erkannt wurde.
 */
export async function localReadDigits(imageUrl: string, opts: DigitOcrOptions = {}): Promise<string | null> {
  const { rotation = 0, minLen = 3, maxLen = 8 } = opts;

  const img = await loadUploadedImage(imageUrl); // sichere Pfadauflösung + Traversal-Schutz
  if (!img) return null;

  let png: Buffer;
  try {
    png = await preprocess(Buffer.from(img.base64, "base64"), rotation);
  } catch (e) {
    structuredLog("ocr", "preprocess_failed", { error: (e as Error).message });
    return null;
  }

  // PSM 7 = eine Textzeile, 8 = ein Wort, 6 = Block — verschiedene Layouts abdecken.
  for (const psm of [7, 8, 6]) {
    const out = await runTesseract(png, psm);
    if (out == null) {
      // Erster Lauf bricht ab (Binary fehlt) → gar nicht weiter versuchen.
      if (psm === 7) { structuredLog("ocr", "tesseract_unavailable", {}); return null; }
      continue;
    }
    const digits = (out.match(/\d/g) ?? []).join("");
    if (digits.length >= minLen && digits.length <= maxLen) {
      structuredLog("ocr", "hit", { psm, len: digits.length });
      return digits;
    }
  }
  structuredLog("ocr", "no_plausible_digits", {});
  return null;
}
