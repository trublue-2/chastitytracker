import { readFile } from "fs/promises";
import { join, basename } from "path";
import Anthropic from "@anthropic-ai/sdk";
import sharp from "sharp";
import type { Rotation } from "@/lib/constants";
import { structuredLog, redactDigits } from "@/lib/serverLog";

const MEDIA_TYPES: Record<string, "image/jpeg" | "image/png" | "image/gif" | "image/webp"> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
};

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/** Beschreibung der zulaessigen Code-Quellen — wird in beiden Vision-Prompts verwendet
 *  damit Vokabular nicht zwischen verifyKontrolleCodeDetailed und detectSealNumber driftet. */
const SEAL_VOCAB = `plastic security seal or numbered tag (e.g. coloured strip — yellow, red, blue, white — with a round locking head, a barcode and digits; often used to seal chastity devices). The seal may appear in any orientation — upside down, sideways or angled — read it as it would read when held upright. Preserve any leading zeros.`;

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
  let buffer: Buffer;
  try {
    buffer = rotation !== 0 ? await sharp(raw).rotate(rotation).toBuffer() : raw;
  } catch (e) {
    vlog("loadImageBuffer:sharp_failed", { filename, rotation, rawBytes: raw.length, error: (e as Error).message });
    return null;
  }
  const base64 = buffer.toString("base64");
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const mediaType = MEDIA_TYPES[ext] ?? "image/jpeg";
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
  if (!process.env.ANTHROPIC_API_KEY) {
    vlog("verify:no_api_key", { imageUrl, codeLen });
    return null;
  }
  try {
    const img = await loadImageBuffer(imageUrl, rotation);
    if (!img) {
      vlog("verify:image_load_null", { imageUrl, codeLen, rotation });
      return null;
    }

    vlog("verify:anthropic_call", { codeLen, mediaType: img.mediaType, rotation });
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 150,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: img.mediaType, data: img.base64 } },
            {
              type: "text",
              text: `Look for the specific number ${expectedCode} in this image. Only this number matters — ignore other numbers, barcodes, prices, or device serials that may also be visible.\nThe target number may appear in any of these forms:\n• handwritten on a slip of paper or card,\n• printed/typed on a tag, sticker or label,\n• printed on a ${SEAL_VOCAB}\nNote: in handwriting "1" often looks like "7" and vice versa — read carefully.\nReply with JSON only: {"detected": "<the target number if you found it, else null>", "match": true if the number matches ${expectedCode} else false, "reason": "<brief reason in German if match is false, else null>"}.\nIf you find a different number than ${expectedCode}, set detected to that other number and match to false.\nPossible reasons (pick the most fitting, keep it short): "Kein Code sichtbar", "Bild zu unscharf", "Code verdeckt oder abgeschnitten", "Schrift nicht lesbar", "Falscher Code sichtbar: <detected>", "Bild zu dunkel", "Kein Code gefunden".`,
            },
          ],
        },
      ],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    vlog("verify:anthropic_response", { requestId: response.id, stopReason: response.stop_reason, textPreview: redactDigits(text.slice(0, 200)) });

    const policyKeywords = ["I'm unable", "I cannot", "I can't", "inappropriate", "violates", "policy", "explicit", "sorry, I"];
    if (!text.includes("{") && policyKeywords.some(kw => text.toLowerCase().includes(kw.toLowerCase()))) {
      vlog("verify:policy_block", { textPreview: redactDigits(text.slice(0, 200)) });
      return { detected: null, match: false, reason: null, error: "policy" };
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
    const detected: string | null = parsed.detected ?? null;
    const isMatch = parsed.match === true || (detected !== null && fuzzyMatch(detected, expectedCode));
    vlog("verify:result", { codeLen, hasDetected: detected !== null, detectedLen: detected?.length ?? 0, isMatch, reason: parsed.reason ?? null });
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
  expectedCode: string
): Promise<"ai" | null> {
  const result = await verifyKontrolleCodeDetailed(imageUrl, expectedCode);
  return result?.match ? "ai" : null;
}

/**
 * Tries to detect a 5–8 digit numbered seal from an image.
 * Returns the detected number string, or null if none found.
 * @param rotation  Clockwise rotation in degrees applied before sending to Claude.
 */
export async function detectSealNumber(imageUrl: string, rotation: Rotation = 0): Promise<string | null> {
  if (!process.env.ANTHROPIC_API_KEY) {
    vlog("seal:no_api_key", { imageUrl });
    return null;
  }
  try {
    const img = await loadImageBuffer(imageUrl, rotation);
    if (!img) {
      vlog("seal:image_load_null", { imageUrl, rotation });
      return null;
    }

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 100,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: img.mediaType, data: img.base64 } },
            {
              type: "text",
              text: `Look for a ${SEAL_VOCAB}\nThe number is usually 5–8 digits.\nReply with JSON only: {"detected": "<number with leading zeros or null>"}. If no seal or number is visible, use null.`,
            },
          ],
        },
      ],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    vlog("seal:anthropic_response", { requestId: response.id, stopReason: response.stop_reason, textPreview: redactDigits(text.slice(0, 200)) });

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      vlog("seal:no_json", { textPreview: redactDigits(text.slice(0, 200)) });
      return null;
    }
    const result = JSON.parse(jsonMatch[0]);
    const detected = result.detected;
    if (!detected || typeof detected !== "string") {
      vlog("seal:no_detection", { detectedType: typeof detected });
      return null;
    }
    if (!/^\d{5,8}$/.test(detected)) {
      vlog("seal:invalid_format", { detectedLen: detected.length });
      return null;
    }
    return detected;
  } catch (e) {
    const err = e as { status?: number; message?: string; name?: string };
    vlog("seal:exception", { imageUrl, name: err.name, status: err.status, message: err.message });
    return null;
  }
}
