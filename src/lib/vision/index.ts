import type { VisionRequest, VisionResponse } from "./types";
import { anthropicAvailable, anthropicComplete } from "./anthropic";
import { localAvailable, localComplete } from "./local";

export type {
  VisionTask,
  VisionBlock,
  VisionRequest,
  VisionResponse,
} from "./types";

/** Aktiver Provider laut `VERIFY_PROVIDER`. Default „anthropic" → abwärtskompatibel. */
export function visionProvider(): "anthropic" | "local" {
  return process.env.VERIFY_PROVIDER === "local" ? "local" : "anthropic";
}

/** Hat der aktive Provider seine nötige Konfiguration? (API-Key bzw. Basis-URL) */
export function visionConfigured(): boolean {
  return visionProvider() === "local" ? localAvailable() : anthropicAvailable();
}

/**
 * Führt eine Vision-Anfrage gegen den konfigurierten Provider aus.
 * Wirft bei Transport-/Verfügbarkeitsfehlern — Aufrufer behalten ihr try/catch
 * + null-Handling (insbesondere: KEIN automatischer Anthropic-Fallback aus dem
 * lokalen Modus, damit keine Fotos ungewollt an Anthropic gehen).
 */
export async function visionComplete(req: VisionRequest): Promise<VisionResponse> {
  return visionProvider() === "local"
    ? localComplete(req)
    : anthropicComplete(req);
}
