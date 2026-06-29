import { readFile } from "fs/promises";
import { join, basename } from "path";
import sharp from "sharp";
import { visionMaxImagePx, type Rotation } from "@/lib/constants";
import { structuredLog, redactDigits } from "@/lib/serverLog";
import { IMAGE_MEDIA_TYPES } from "@/lib/imageUtils";
import { visionComplete, visionConfigured, visionProvider } from "@/lib/vision";
import { localReadDigits } from "@/lib/ocr";

/** Beschreibung der zulaessigen Code-Quellen — wird in beiden Vision-Prompts verwendet
 *  damit Vokabular nicht zwischen verifyKontrolleCodeDetailed und detectSealNumber driftet. */
const SEAL_VOCAB = `plastic security seal or numbered tag (e.g. coloured strip — yellow, red, blue, white — with a round locking head, a barcode and digits; often used to seal chastity devices). The seal may appear in any orientation — upside down, sideways or angled — read it as it would read when held upright. Preserve any leading zeros.`;

/** Normalisiert das `detected`-Feld der Vision-Antwort: liefert den String oder `null`, wenn keine
 *  Erkennung vorliegt. Das Modell meldet "keine Erkennung" mal als JSON-null/undefined, mal als
 *  Wort-Sentinel ("null"/"none") IM String — alle Fälle hier zentral auf `null` abbilden, damit der
 *  Sentinel nicht in Format-Prüfung/Result-Contract leakt. Geteilt von beiden `{"detected": …}`-Parsern. */
function normalizeDetected(raw: unknown): string | null {
  if (!raw || typeof raw !== "string") return null;
  return ["null", "none"].includes(raw.trim().toLowerCase()) ? null : raw;
}

/** Verify-spezifischer Logger — `[verify]`-Prefix fuer grepbare Container-Logs.
 *  WICHTIG: der erwartete Auth-Code wird bewusst NICHT geloggt (er ist die
 *  Authentifizierung der Kontrolle). Nur Laenge, Filename, mediaType, bytes,
 *  redacted previews. Niemals den API-Key oder rohe Bilddaten. */
function vlog(label: string, fields: Record<string, unknown>) {
  structuredLog("verify", label, fields);
}

async function loadImageBuffer(
  imageUrl: string,
  rotation: Rotation
): Promise<{ base64: string; mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp" } | null> {
  const filename = basename(imageUrl);
  if (!filename || filename.includes("..") || filename.includes("/")) {
    vlog("loadImageBuffer:reject_filename", { filename, imageUrl });
    return null;
  }
  const fullPath = join(process.cwd(), "data", "uploads", filename);
  let raw: Buffer;
  try {
    raw = await readFile(fullPath);
  } catch (e) {
    vlog("loadImageBuffer:read_failed", { fullPath, error: (e as Error).message });
    return null;
  }
  // Vor dem Vision-Call runterskalieren — spart Vision-Tokens/Latenz drastisch (v.a. lokale Modelle).
  const maxPx = visionMaxImagePx();
  let buffer: Buffer;
  let mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp";
  try {
    buffer = await sharp(raw)
      .rotate(rotation || 0)
      .resize(maxPx, maxPx, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();
    mediaType = "image/jpeg";
  } catch (e) {
    vlog("loadImageBuffer:sharp_failed", { filename, rotation, rawBytes: raw.length, error: (e as Error).message });
    buffer = raw; // Fallback: Original ohne Skalierung
    const ext = filename.split(".").pop()?.toLowerCase() ?? "";
    mediaType = IMAGE_MEDIA_TYPES[ext] ?? "image/jpeg";
  }
  const base64 = buffer.toString("base64");
  vlog("loadImageBuffer:ok", { filename, mediaType, bytes: buffer.length, rotation });
  return { base64, mediaType };
}

function fuzzyMatch(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  const similar: Record<string, string> = { "1": "7", "7": "1", "0": "6", "6": "0" };
  return a.split("").every((ch, i) => ch === b[i] || similar[ch] === b[i]);
}

export type VerifyDetailedResult = {
  detected: string | null;
  match: boolean;
  reason: string | null;
  error?: "policy" | true;
};

export async function verifyKontrolleCodeDetailed(
  imageUrl: string,
  expectedCode: string,
  rotation: Rotation = 0
): Promise<VerifyDetailedResult | null> {
  const codeLen = expectedCode.length;
  // Handschrift → kein lokales OCR-Fallback (Tesseract kann das nicht zuverlässig). Ohne
  // konfigurierten Vision-Provider bleibt die Verifikation manuell (Keyholder).
  if (!visionConfigured()) {
    vlog("verify:not_configured", { imageUrl, codeLen });
    return null;
  }
  try {
    const img = await loadImageBuffer(imageUrl, rotation);
    if (!img) {
      vlog("verify:image_load_null", { imageUrl, codeLen, rotation });
      return null;
    }

    vlog("verify:vision_call", { codeLen, mediaType: img.mediaType, rotation });
    const response = await visionComplete({
      task: "code-verify",
      maxTokens: 150,
      content: [
        { type: "image", mediaType: img.mediaType, base64: img.base64 },
        {
          type: "text",
          text: `Look for the specific number ${expectedCode} in this image. Only this number matters — ignore other numbers, barcodes, prices, or device serials that may also be visible.\nThe target number may appear in any of these forms:\n• handwritten on a slip of paper or card,\n• printed/typed on a tag, sticker or label,\n• printed on a ${SEAL_VOCAB}\nNote: in handwriting "1" often looks like "7" and vice versa — read carefully.\nReply with JSON only: {"detected": "<the target number if you found it, else null>", "match": true if the number matches ${expectedCode} else false, "reason": "<brief reason in German if match is false, else null>"}.\nIf you find a different number than ${expectedCode}, set detected to that other number and match to false.\nPossible reasons (pick the most fitting, keep it short): "Kein Code sichtbar", "Bild zu unscharf", "Code verdeckt oder abgeschnitten", "Schrift nicht lesbar", "Falscher Code sichtbar: <detected>", "Bild zu dunkel", "Kein Code gefunden".`,
        },
      ],
    });

    const text = response.text;
    vlog("verify:vision_response", { requestId: response.requestId, stopReason: response.stopReason, textPreview: redactDigits(text.slice(0, 200)) });

    // Policy-Refusal ist eine ANTHROPIC-Eigenheit (verweigert explizitere Fotos). Ein lokales Modell
    // kennt das nicht — ein „I cannot read…" ist dort ein normaler Lesefehler, kein Policy-Block.
    if (visionProvider() === "anthropic") {
      const policyKeywords = ["I'm unable", "I cannot", "I can't", "inappropriate", "violates", "policy", "explicit", "sorry, I"];
      if (!text.includes("{") && policyKeywords.some(kw => text.toLowerCase().includes(kw.toLowerCase()))) {
        vlog("verify:policy_block", { textPreview: redactDigits(text.slice(0, 200)) });
        return { detected: null, match: false, reason: null, error: "policy" };
      }
    }

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      vlog("verify:no_json_in_response", { textPreview: redactDigits(text.slice(0, 200)) });
      return { detected: null, match: false, reason: null };
    }

    let parsed: { detected?: string | null; match?: boolean; reason?: string | null };
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch (e) {
      vlog("verify:json_parse_failed", { jsonRawLen: jsonMatch[0].length, error: (e as Error).message });
      return { detected: null, match: false, reason: null };
    }
    const detected: string | null = normalizeDetected(parsed.detected);
    // Normalize before comparing — the model occasionally wraps the number with whitespace or
    // surrounding punctuation despite the strict JSON contract.
    const normalize = (s: string) => s.trim().replace(/\D/g, "");
    const detectedNorm = detected ? normalize(detected) : null;
    const exactDetectedMatch = detectedNorm !== null && detectedNorm === expectedCode;
    // Override match=false when detected equals the expected code — observed in 2026-05 that the
    // model returns match=false despite reading the correct digits, presumably due to prompt phrasing.
    const claudeOverridden = parsed.match !== true && exactDetectedMatch;
    const isMatch = parsed.match === true || exactDetectedMatch || (detected !== null && fuzzyMatch(detected, expectedCode));
    vlog("verify:result", { codeLen, hasDetected: detected !== null, detectedLen: detected?.length ?? 0, isMatch, claudeOverridden, reason: parsed.reason ?? null });
    return { detected, match: isMatch, reason: isMatch ? null : (parsed.reason ?? null) };
  } catch (e) {
    const err = e as { status?: number; message?: string; name?: string };
    vlog("verify:exception", { imageUrl, codeLen, name: err.name, status: err.status, message: err.message });
    return null;
  }
}

/**
 * Convenience wrapper: returns "ai" if match, null otherwise.
 */
export async function verifyKontrolleCode(
  imageUrl: string,
  expectedCode: string,
  rotation: Rotation = 0
): Promise<"ai" | null> {
  const result = await verifyKontrolleCodeDetailed(imageUrl, expectedCode, rotation);
  return result?.match ? "ai" : null;
}

/**
 * Gemeinsames Gerüst der Ziffern-Erkennung aus einem Code-/Siegelbild: ohne Vision-Provider
 * lokales OCR (min..max Ziffern), sonst visionComplete (task seal-detect) → JSON {detected}
 * → Längen-/Format-Validierung. Genutzt von detectSealNumber (Plombe) und detectLockboxCode (Dial).
 */
async function detectSealDigits(
  imageUrl: string,
  rotation: Rotation,
  opts: { minLen: number; maxLen: number; prompt: string; logPrefix: string },
): Promise<string | null> {
  const { minLen, maxLen, prompt, logPrefix } = opts;

  if (!visionConfigured()) {
    // Kein Vision-Provider → lokales OCR (gedruckte Ziffern). Kein Datenabfluss; Dials oft schwach → ggf. null.
    vlog(`${logPrefix}:no_provider_local_ocr`, { imageUrl });
    return localReadDigits(imageUrl, { rotation, minLen, maxLen });
  }
  try {
    const img = await loadImageBuffer(imageUrl, rotation);
    if (!img) {
      vlog(`${logPrefix}:image_load_null`, { imageUrl, rotation });
      return null;
    }

    const response = await visionComplete({
      task: "seal-detect",
      maxTokens: 100,
      content: [
        { type: "image", mediaType: img.mediaType, base64: img.base64 },
        { type: "text", text: prompt },
      ],
    });

    const text = response.text;
    vlog(`${logPrefix}:vision_response`, { requestId: response.requestId, stopReason: response.stopReason, textPreview: redactDigits(text.slice(0, 200)) });

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      vlog(`${logPrefix}:no_json`, { textPreview: redactDigits(text.slice(0, 200)) });
      return null;
    }
    const result = JSON.parse(jsonMatch[0]);
    const detected = normalizeDetected(result.detected);
    if (detected === null) {
      vlog(`${logPrefix}:no_detection`, { detectedType: typeof result.detected });
      return null;
    }
    if (!new RegExp(`^\\d{${minLen},${maxLen}}$`).test(detected)) {
      vlog(`${logPrefix}:invalid_format`, { detectedLen: detected.length });
      return null;
    }
    return detected;
  } catch (e) {
    const err = e as { status?: number; message?: string; name?: string };
    vlog(`${logPrefix}:exception`, { imageUrl, name: err.name, status: err.status, message: err.message });
    return null;
  }
}

/**
 * Tries to detect a 5–8 digit numbered seal (Plombe) from an image.
 * Returns the detected number string, or null if none found.
 * @param rotation  Clockwise rotation in degrees applied before sending to the vision model.
 */
export async function detectSealNumber(imageUrl: string, rotation: Rotation = 0): Promise<string | null> {
  return detectSealDigits(imageUrl, rotation, {
    minLen: 5,
    maxLen: 8,
    logPrefix: "seal",
    prompt: `Look for a ${SEAL_VOCAB}\nThe number is usually 5–8 digits.\nReply with JSON only: {"detected": "<number with leading zeros or null>"}. If no seal or number is visible, use null.`,
  });
}

/**
 * Bildersafe: liest den Code eines ZAHLEN-VORHÄNGESCHLOSSES / einer Schlüsselbox (Dial-/Rolldials),
 * nicht einer Plombe. Typisch 3–4 (bis 8) Ziffern an der Markierungslinie.
 */
export async function detectLockboxCode(imageUrl: string, rotation: Rotation = 0): Promise<string | null> {
  return detectSealDigits(imageUrl, rotation, {
    minLen: 3,
    maxLen: 8,
    logPrefix: "lockbox",
    prompt: `This is a combination padlock or key lockbox with rotating number dials (Zahlenschloss). Read the digits currently set at the indicator — the row aligned with the marker line (often red) / shown in the small windows. Read them in order (top→bottom for stacked dials, left→right for a row). The code is usually 3–4 digits (up to 8). Ignore the partially-visible neighbouring digits above/below the line.\nReply with JSON only: {"detected": "<the digits, with leading zeros, or null>"}. If you cannot read the digits, use null.`,
  });
}
