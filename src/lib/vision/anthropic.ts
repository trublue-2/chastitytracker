import Anthropic from "@anthropic-ai/sdk";
import type { VisionConfig } from "./config";
import type { VisionRequest, VisionResponse } from "./types";

/**
 * Vision über die Anthropic-API.
 *
 * Der Client entsteht aus der gültigen Einstellung (`config.ts`), nicht aus der `.env` — ein
 * Schlüsselwechsel in der App wirkt beim nächsten Aufruf, ohne Neustart.
 */

/** Ein Platz, kein Pool: es gibt je Instanz einen gültigen Schlüssel. Ein neuer ersetzt den alten,
 *  statt dass ein nicht mehr gültiger bis zum Neustart im Speicher liegt. */
let cached: { key: string; client: Anthropic } | null = null;

function clientFor(apiKey: string): Anthropic {
  if (cached?.key !== apiKey) cached = { key: apiKey, client: new Anthropic({ apiKey }) };
  return cached.client;
}

/**
 * Nimmt das Modell `temperature` an? Opus 4.7+, Sonnet 5 und die Fable/Mythos-Reihe lehnen ein
 * gesetztes `temperature` mit 400 ab. Die Vorgabe-Modelle (Sonnet 4.6, Haiku 4.5) nehmen es — und
 * brauchen es: ohne das Feld liegt der Default bei 1.0, und dasselbe Foto wird bei jedem Aufruf
 * potenziell anders gelesen („mal klappt es, mal 20× nicht"). Seit der Admin das Modell wählen kann,
 * muss diese Unterscheidung hier stehen statt in einem Kommentar über der Tabelle.
 */
export function acceptsTemperature(model: string): boolean {
  return !/^claude-(opus-(4-[7-9]|[5-9])|sonnet-[5-9]|fable|mythos)/.test(model);
}

/** Führt eine Vision-Anfrage über die Anthropic-API aus. Wirft bei Transportfehlern. */
export async function anthropicComplete(config: VisionConfig, model: string, req: VisionRequest): Promise<VisionResponse> {
  if (!config.apiKey) throw new Error("anthropic api key not set");
  const content: Anthropic.MessageParam["content"] = req.content.map((b) =>
    b.type === "text"
      ? { type: "text", text: b.text }
      : { type: "image", source: { type: "base64", media_type: b.mediaType, data: b.base64 } }
  );

  const response = await clientFor(config.apiKey).messages.create({
    model,
    max_tokens: req.maxTokens,
    ...(acceptsTemperature(model) ? { temperature: 0 } : {}),
    messages: [{ role: "user", content }],
  });

  const text = response.content[0]?.type === "text" ? response.content[0].text : "";
  return { text, requestId: response.id, stopReason: response.stop_reason, protocol: "anthropic" };
}
