import type Anthropic from "@anthropic-ai/sdk";
import { anthropic } from "@/lib/anthropic";
import type { VisionRequest, VisionResponse, VisionTask } from "./types";

/** Task → Anthropic-Modell. Spiegelt das bisher fest verdrahtete Mapping:
 *  Code-Verifikation & Geräte-Erkennung liefen auf Haiku, Siegel-Erkennung auf Sonnet. */
const MODEL: Record<VisionTask, string> = {
  "code-verify": "claude-haiku-4-5-20251001",
  "seal-detect": "claude-sonnet-4-6",
  "device-detect": "claude-haiku-4-5-20251001",
};

/** Ist der Anthropic-Provider einsatzbereit? (API-Key gesetzt) */
export function anthropicAvailable(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

/** Führt eine Vision-Anfrage über die Anthropic-API aus. Wirft bei Transportfehlern. */
export async function anthropicComplete(req: VisionRequest): Promise<VisionResponse> {
  const content: Anthropic.MessageParam["content"] = req.content.map((b) =>
    b.type === "text"
      ? { type: "text", text: b.text }
      : {
          type: "image",
          source: { type: "base64", media_type: b.mediaType, data: b.base64 },
        }
  );

  const response = await anthropic.messages.create({
    model: MODEL[req.task],
    max_tokens: req.maxTokens,
    messages: [{ role: "user", content }],
  });

  const text = response.content[0]?.type === "text" ? response.content[0].text : "";
  return { text, requestId: response.id, stopReason: response.stop_reason };
}
