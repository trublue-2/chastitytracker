import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { readFile } from "fs/promises";
import { join, basename } from "path";
import Anthropic from "@anthropic-ai/sdk";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { imageUrl, expectedCode } = await req.json();

  if (!imageUrl || !expectedCode) {
    return NextResponse.json({ error: "imageUrl and expectedCode required" }, { status: 400 });
  }

  // Extract filename from URL like /api/uploads/<filename>
  const filename = basename(imageUrl);
  if (filename.includes("..")) {
    return NextResponse.json({ error: "Invalid imageUrl" }, { status: 400 });
  }

  try {
    const uploadsDir = join(process.cwd(), "data", "uploads");
    const buffer = await readFile(join(uploadsDir, filename));
    const base64 = buffer.toString("base64");

    // Detect media type from extension
    const ext = filename.split(".").pop()?.toLowerCase() ?? "";
    const mediaTypeMap: Record<string, "image/jpeg" | "image/png" | "image/gif" | "image/webp"> = {
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      gif: "image/gif",
      webp: "image/webp",
    };
    const mediaType = mediaTypeMap[ext] ?? "image/jpeg";

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 100,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mediaType, data: base64 },
            },
            {
              type: "text",
              text: `This image should contain a handwritten 5-digit number: ${expectedCode}.\nLook carefully for any handwritten digits in the image. Note: handwritten "1" often looks like "7" and vice versa – read carefully.\nReply with JSON only: {"detected": "<5-digit code or null>", "match": true/false, "reason": "<brief reason in German if match is false, else null>"}.\nPossible reasons (pick the most fitting, keep it short): "Kein Code sichtbar", "Bild zu unscharf", "Code verdeckt oder abgeschnitten", "Schrift nicht lesbar", "Falscher Code sichtbar: <detected>", "Bild zu dunkel", "Kein handgeschriebener Code gefunden".`,
            },
          ],
        },
      ],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";

    // Erkennung von Content-Policy-Ablehnungen
    const policyKeywords = ["I'm unable", "I cannot", "I can't", "inappropriate", "violates", "policy", "explicit", "sorry, I"];
    const isRefusal = !text.includes("{") && policyKeywords.some((kw) => text.toLowerCase().includes(kw.toLowerCase()));
    if (isRefusal) {
      return NextResponse.json({ detected: null, match: false, error: "policy" });
    }

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ detected: null, match: false });
    }

    const result = JSON.parse(jsonMatch[0]);
    const detected: string | null = result.detected ?? null;

    // Fuzzy-Match: häufig verwechselte Ziffern (1↔7, 0↔6) als Treffer werten
    const fuzzyMatch = (a: string, b: string): boolean => {
      if (a === b) return true;
      if (a.length !== b.length) return false;
      const similar: Record<string, string> = { "1": "7", "7": "1", "0": "6", "6": "0" };
      return a.split("").every((ch, i) => ch === b[i] || similar[ch] === b[i]);
    };

    const isMatch = result.match === true || (detected !== null && fuzzyMatch(detected, expectedCode));

    return NextResponse.json({
      detected,
      match: isMatch,
      reason: isMatch ? null : (result.reason ?? null),
    });
  } catch (err) {
    console.error("verify-kontrolle error:", err);
    return NextResponse.json({ detected: null, match: false, error: true });
  }
}
