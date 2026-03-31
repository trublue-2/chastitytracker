import { readFile } from "fs/promises";
import { join, basename } from "path";
import Anthropic from "@anthropic-ai/sdk";

const MEDIA_TYPES: Record<string, "image/jpeg" | "image/png" | "image/gif" | "image/webp"> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
};

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

/**
 * Runs the Claude Vision check and returns the full result (detected code, match, reason).
 * Returns null on read/API errors.
 */
export async function verifyKontrolleCodeDetailed(
  imageUrl: string,
  expectedCode: string
): Promise<VerifyDetailedResult | null> {
  try {
    const filename = basename(imageUrl);
    if (!filename || filename.includes("..") || filename.includes("/")) return null;

    const buffer = await readFile(join(process.cwd(), "data", "uploads", filename));
    const base64 = buffer.toString("base64");
    const ext = filename.split(".").pop()?.toLowerCase() ?? "";
    const mediaType = MEDIA_TYPES[ext] ?? "image/jpeg";

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 100,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
            {
              type: "text",
              text: `This image should contain a handwritten 5-digit number: ${expectedCode}.\nLook carefully for any handwritten digits in the image. Note: handwritten "1" often looks like "7" and vice versa – read carefully.\nReply with JSON only: {"detected": "<5-digit code or null>", "match": true/false, "reason": "<brief reason in German if match is false, else null>"}.\nPossible reasons (pick the most fitting, keep it short): "Kein Code sichtbar", "Bild zu unscharf", "Code verdeckt oder abgeschnitten", "Schrift nicht lesbar", "Falscher Code sichtbar: <detected>", "Bild zu dunkel", "Kein handgeschriebener Code gefunden".`,
            },
          ],
        },
      ],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const policyKeywords = ["I'm unable", "I cannot", "I can't", "inappropriate", "violates", "policy", "explicit", "sorry, I"];
    if (!text.includes("{") && policyKeywords.some(kw => text.toLowerCase().includes(kw.toLowerCase()))) {
      return { detected: null, match: false, reason: null, error: "policy" };
    }

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { detected: null, match: false, reason: null };

    const result = JSON.parse(jsonMatch[0]);
    const detected: string | null = result.detected ?? null;
    const isMatch = result.match === true || (detected !== null && fuzzyMatch(detected, expectedCode));
    return { detected, match: isMatch, reason: isMatch ? null : (result.reason ?? null) };
  } catch {
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
 */
export async function detectSealNumber(imageUrl: string): Promise<string | null> {
  try {
    const filename = basename(imageUrl);
    if (!filename || filename.includes("..") || filename.includes("/")) return null;

    const buffer = await readFile(join(process.cwd(), "data", "uploads", filename));
    const base64 = buffer.toString("base64");
    const ext = filename.split(".").pop()?.toLowerCase() ?? "";
    const mediaType = MEDIA_TYPES[ext] ?? "image/jpeg";

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 50,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
            {
              type: "text",
              text: `Look for a numbered seal, security seal, or any label with a printed or stamped number in this image. Report the 5–8 digit number if you find one.\nReply with JSON only: {"detected": "<5-8 digit number or null>"}. If no clear number is found, use null.`,
            },
          ],
        },
      ],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const result = JSON.parse(jsonMatch[0]);
    const detected = result.detected;
    if (!detected || typeof detected !== "string") return null;
    if (!/^\d{5,8}$/.test(detected)) return null;
    return detected;
  } catch {
    return null;
  }
}
