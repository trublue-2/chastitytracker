import type Anthropic from "@anthropic-ai/sdk";
import { anthropic } from "@/lib/anthropic";
import type { VisionRequest, VisionResponse, VisionTask } from "./types";

/** Task → Anthropic-Modell. Geräte-Erkennung (Form grob klassifizieren) läuft auf Haiku,
 *  das Ablesen von Ziffern auf Sonnet: Siegel-Nummer schon immer, Kontroll-Code seit 4.51.36.
 *  Der Kontroll-Code ist die SCHWERSTE der drei Aufgaben (Handschrift statt Druck, dazu im
 *  Dual-Modus zwei Zahlen im selben Bild) und lief zuvor ausgerechnet auf dem schwächsten Modell. */
const MODEL: Record<VisionTask, string> = {
  "code-verify": "claude-sonnet-4-6",
  "seal-detect": "claude-sonnet-4-6",
  "device-detect": "claude-haiku-4-5-20251001",
  "device-check": "claude-haiku-4-5-20251001",
  // Schlüssel im Sichtfenster: reine Anwesenheits-Frage an einem kontrastreichen Motiv (Metall vor
  // schwarzem Schaumstoff) — dieselbe Klasse wie die Geräte-Erkennung, also Haiku.
  "key-detect": "claude-haiku-4-5-20251001",
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
    // Deterministisch — Ziffern ablesen und Geräte klassifizieren ist Analyse, keine Kreativität
    // (gleiche Begründung wie im lokalen Provider). Ohne das Feld liegt der API-Default bei 1.0:
    // dasselbe Foto wird dann bei jedem Aufruf potenziell anders gelesen, was als „mal klappt es,
    // mal 20× nicht" beim Nutzer ankommt.
    // ACHTUNG bei Modellwechseln: Opus 4.7+ und Sonnet 5 lehnen ein gesetztes `temperature` mit
    // 400 ab. Die MODEL-Tabelle oben muss deshalb bei Modellen bleiben, die es akzeptieren.
    temperature: 0,
    messages: [{ role: "user", content }],
  });

  const text = response.content[0]?.type === "text" ? response.content[0].text : "";
  return { text, requestId: response.id, stopReason: response.stop_reason };
}
