/**
 * Provider-unabhängige Typen für Bild-Verifikation (Vision).
 *
 * Die App nutzt Vision an drei Stellen (Code-Verifikation, Siegelnummer, Geräte-Erkennung).
 * Diese Typen kapseln „Bild(er) + Text rein → Text raus", damit der konkrete Anbieter
 * (Anthropic-API oder lokales Modell via OpenAI-kompatiblem Endpoint) austauschbar ist.
 */

/** Welcher Anwendungsfall — bestimmt pro Provider das gewählte Modell.
 *  device-check: „ist das verschlossene Gerät im Kontroll-Foto sichtbar?" (Presence/Match). */
export type VisionTask = "code-verify" | "seal-detect" | "device-detect" | "device-check";

/** Ein Inhaltsblock einer Vision-Anfrage: Text oder Bild (base64). */
export type VisionBlock =
  | { type: "text"; text: string }
  | {
      type: "image";
      mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp";
      base64: string;
    };

export interface VisionRequest {
  task: VisionTask;
  /** max. Antwort-Tokens (entspricht max_tokens). */
  maxTokens: number;
  /** Reihenfolge bleibt erhalten — Bilder + erklärender Text wie vom Aufrufer gebaut. */
  content: VisionBlock[];
}

export interface VisionResponse {
  /** Roher Text der Modellantwort (der Aufrufer parst daraus sein JSON). */
  text: string;
  /** Provider-Request-ID fürs Logging (Anthropic: response.id; OpenAI: data.id). */
  requestId?: string;
  /** Stop-/Finish-Reason fürs Logging. */
  stopReason?: string | null;
}
