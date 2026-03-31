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

/**
 * Runs the Claude Vision check for a handwritten Kontrolle code.
 * Returns "ai" if the code matches, null otherwise (or on any error).
 * Reads the image from the local uploads directory.
 */
export async function verifyKontrolleCode(
  imageUrl: string,
  expectedCode: string
): Promise<"ai" | null> {
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
      return null;
    }

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const result = JSON.parse(jsonMatch[0]);
    const detected: string | null = result.detected ?? null;
    const isMatch = result.match === true || (detected !== null && fuzzyMatch(detected, expectedCode));
    return isMatch ? "ai" : null;
  } catch {
    return null;
  }
}
