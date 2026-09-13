/**
 * Die Anbieter der Foto-Prüfung — EINE Liste für Server und Admin-Oberfläche.
 *
 * **Warum es mehr als Anthropic gibt.** Die Prüfung schickt intime Fotos an einen Dienst, und wer
 * die Instanz betreibt, soll wählen, an welchen — und mit welchem eigenen Schlüssel er zahlt. Bis
 * 6.2.4 ging jede Portal-Instanz ungefragt über den Schlüssel des Portal-Betreibers an Anthropic.
 *
 * **Zwei Protokolle, nicht sechs.** Anthropic spricht seine eigene API; alle anderen sprechen die
 * OpenAI-kompatible `chat/completions`-Form, dieselbe, die schon der lokale Ollama-Pfad nutzt. Ein
 * neuer Anbieter ist deshalb ein Eintrag in `VISION_PROVIDERS`, kein neuer Client.
 *
 * **`external`** entscheidet, ob Nutzer einen Hinweis bekommen. `ownServer` gilt als nicht extern —
 * ob die eingetragene Adresse wirklich der eigene Rechner ist, kann die App nicht prüfen. Das trägt
 * der Admin, und die Einstellung sagt es ihm.
 *
 * **Die Modell-Vorgaben** sind nachgeschlagen am 13.09.2026 in den offiziellen Modell-Übersichten
 * (developers.openai.com/api/docs/models, ai.google.dev/gemini-api/docs/models,
 * docs.mistral.ai/getting-started/models). Sie sind VORGABEN: der Admin kann jedes überschreiben,
 * und „Einstellung testen" zeigt, ob ein Modell die Aufgabe tatsächlich kann. Bei OpenAI steht
 * bewusst das günstige Modell auf beiden Aufgaben — das stärkste kostet ein Vielfaches von Sonnet,
 * und fünf Ziffern abzulesen verlangt das nicht.
 *
 * Importfrei (per Test geprüft): die Admin-Oberfläche liest die Liste im Client.
 */

export type VisionProtocol = "anthropic" | "openai";

export const VISION_PROVIDER_IDS = ["off", "anthropic", "openai", "gemini", "mistral", "custom", "ownServer"] as const;
export type VisionProviderId = (typeof VISION_PROVIDER_IDS)[number];

/** Zwei Modelle je Anbieter: `strong` liest Ziffern (Kontroll-Code, Siegel, Waage), `light`
 *  beantwortet Anwesenheits-Fragen (Gerät im Bild, Schlüssel im Sichtfenster). */
export interface VisionModels {
  strong: string;
  light: string;
}

export interface VisionProviderSpec {
  protocol: VisionProtocol | null;
  /** Anzeigename — auch der Name, den der Hinweis an die Nutzer nennt. `null` für `custom`, dort
   *  steht die Adresse an seiner Stelle. */
  label: string | null;
  external: boolean;
  /** Feste Adresse; `null` heisst: der Admin trägt sie ein. */
  baseUrl: string | null;
  needsKey: boolean;
  /** `null` heisst: keine sinnvolle Vorgabe, der Admin muss die Modelle nennen. */
  models: VisionModels | null;
}

export const VISION_PROVIDERS: Record<VisionProviderId, VisionProviderSpec> = {
  off: { protocol: null, label: null, external: false, baseUrl: null, needsKey: false, models: null },
  anthropic: {
    protocol: "anthropic",
    label: "Anthropic",
    external: true,
    baseUrl: null,
    needsKey: true,
    // Ziffern auf Sonnet, Anwesenheit auf Haiku — die Aufteilung aus 4.51.36, unverändert.
    models: { strong: "claude-sonnet-4-6", light: "claude-haiku-4-5-20251001" },
  },
  openai: {
    protocol: "openai",
    label: "OpenAI",
    external: true,
    baseUrl: "https://api.openai.com/v1",
    needsKey: true,
    models: { strong: "gpt-5.6-luna", light: "gpt-5.6-luna" },
  },
  gemini: {
    protocol: "openai",
    label: "Google Gemini",
    external: true,
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    needsKey: true,
    models: { strong: "gemini-3.8-flash", light: "gemini-3.5-flash-lite" },
  },
  mistral: {
    protocol: "openai",
    label: "Mistral",
    external: true,
    baseUrl: "https://api.mistral.ai/v1",
    needsKey: true,
    models: { strong: "mistral-medium-3-5", light: "mistral-medium-3-5" },
  },
  custom: { protocol: "openai", label: null, external: true, baseUrl: null, needsKey: true, models: null },
  ownServer: {
    protocol: "openai",
    label: null,
    external: false,
    baseUrl: null,
    needsKey: false,
    models: { strong: "qwen2.5-vl:7b", light: "qwen2.5-vl:7b" },
  },
};

/** Trägt der Admin die Adresse selbst ein? Geteilt von Formular und Prüfung, damit beide dieselbe
 *  Antwort geben. */
export function adminSetsBaseUrl(spec: VisionProviderSpec): boolean {
  return spec.protocol === "openai" && !spec.baseUrl;
}

export function isVisionProviderId(v: unknown): v is VisionProviderId {
  return typeof v === "string" && (VISION_PROVIDER_IDS as readonly string[]).includes(v);
}

/** Die Adresse, unter der ein `custom`-Dienst im Hinweis genannt wird: der Hostname, nicht die
 *  ganze URL — ein Pfad oder Port sagt dem Träger nichts. */
export function hostLabel(baseUrl: string | null): string | null {
  if (!baseUrl) return null;
  try {
    return new URL(baseUrl).hostname;
  } catch {
    return null;
  }
}
