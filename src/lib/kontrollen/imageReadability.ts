import sharp from "sharp";
import { loadUploadedImage } from "@/lib/imageUtils";

/**
 * Lokale, datenschutzfreundliche Schärfeprüfung für das Bildersafe-Code-Foto — OHNE KI, ohne
 * Datenabfluss. Standard-Fokus-Maß „Varianz des Laplace-Operators": ein scharfes Foto hat viele
 * harte Kanten → hohe Varianz, ein verwackeltes/unscharfes Foto wenige → niedrige Varianz.
 * (Empirisch: scharf ~ mehrere hundert+, klar unscharf < ~15.)
 *
 * Der Laplace wird bewusst MANUELL signiert aus dem Rohpuffer gerechnet — sharps convolve clamped
 * auf uint8 und verschluckt die negativen Kantenantworten (→ unbrauchbar).
 *
 * Schwellwert über BILDERSAFE_SHARPNESS_MIN justierbar (Default tolerant). Im Zweifel (Datei
 * fehlt/zu kleines Bild/Fehler) wird erlaubt — nie hart blockiert, damit gute Fotos nicht
 * fälschlich abgelehnt werden.
 */
export async function localCodeReadable(imageUrl: string, rotation = 0): Promise<boolean> {
  const img = await loadUploadedImage(imageUrl); // sichere Pfadauflösung + Path-Traversal-Schutz
  if (!img) return true; // im Zweifel nicht blockieren

  try {
    const { data, info } = await sharp(Buffer.from(img.base64, "base64"))
      .rotate(rotation || 0)
      .grayscale()
      .resize(640, 640, { fit: "inside", withoutEnlargement: true })
      .raw()
      .toBuffer({ resolveWithObject: true });

    const W = info.width;
    const H = info.height;
    if (W < 3 || H < 3) return true;

    // Varianz des 3×3-Laplace (signiert)
    let sum = 0;
    let sumSq = 0;
    let n = 0;
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        const i = y * W + x;
        const lap = data[i - W] + data[i + W] + data[i - 1] + data[i + 1] - 4 * data[i];
        sum += lap;
        sumSq += lap * lap;
        n++;
      }
    }
    if (n === 0) return true;
    const mean = sum / n;
    const variance = sumSq / n - mean * mean;

    const threshold = Number(process.env.BILDERSAFE_SHARPNESS_MIN) || 20;
    return variance >= threshold;
  } catch {
    return true; // im Zweifel nicht blockieren
  }
}
