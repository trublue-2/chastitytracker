import type { VisionRequest, VisionResponse } from "./types";
import { anthropicComplete } from "./anthropic";
import { openaiCompatibleComplete } from "./openaiCompatible";
import { currentVisionConfig, modelFor, visionSpec } from "./config";

export type {
  VisionTask,
  VisionBlock,
  VisionRequest,
  VisionResponse,
} from "./types";

/** Ist eine Foto-Prüfung eingerichtet? Welche, entscheidet `config.ts`. */
export async function visionConfigured(): Promise<boolean> {
  return (await currentVisionConfig()).provider !== "off";
}

/**
 * Führt eine Vision-Anfrage gegen den gewählten Anbieter aus.
 * Wirft bei Transport-/Verfügbarkeitsfehlern — Aufrufer behalten ihr try/catch + null-Handling.
 * Einen automatischen Rückfall auf einen ANDEREN Anbieter gibt es nicht: fällt der gewählte aus,
 * geht kein Foto ungewollt woandershin.
 */
export async function visionComplete(req: VisionRequest): Promise<VisionResponse> {
  const config = await currentVisionConfig();
  const model = modelFor(config, req.task);
  if (config.provider === "off" || !model) throw new Error("vision not configured");
  return visionSpec(config).protocol === "anthropic"
    ? anthropicComplete(config, model, req)
    : openaiCompatibleComplete(config, model, req);
}
