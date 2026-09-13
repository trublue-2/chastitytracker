import type { VisionConfig } from "./config";
import type { VisionRequest, VisionResponse } from "./types";
import { isAllowedVisionUrl } from "./urlGuard";

/**
 * Vision über einen OpenAI-kompatiblen `chat/completions`-Endpunkt: OpenAI, Google Gemini,
 * Mistral, ein beliebiger kompatibler Dienst — und der eigene Server (Ollama, vLLM, …).
 *
 * Bis 6.2.4 hiess das Modul `local.ts` und las Adresse, Schlüssel und Modell aus der `.env`. Die
 * Form der Anfrage war schon damals die allgemeine; mit der Anbieter-Wahl bekommt der Client seine
 * Einstellung übergeben, statt sie selbst zu lesen. Die `.env`-Variablen gibt es weiter — gelesen
 * werden sie jetzt an EINER Stelle, in `config.ts`.
 */

interface OpenAIChatResponse {
  id?: string;
  choices?: { message?: { content?: string }; finish_reason?: string | null }[];
}

function endpoint(config: VisionConfig): string {
  if (!config.baseUrl) throw new Error("vision base URL not set");
  return `${config.baseUrl.replace(/\/+$/, "")}/chat/completions`;
}

function headers(config: VisionConfig): Record<string, string> {
  // Ollama ignoriert den Schlüssel, verlangt aber das Header-Feld — daher der Platzhalter.
  return { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey || "local"}` };
}

/**
 * `fetch` gegen die Adresse der Einstellung — bei einer Adresse aus der APP mit Zielprüfung und ohne
 * Weiterleitungen (`urlGuard.ts`). Die Prüfung beim Speichern allein reicht nicht: ein Hostname kann
 * später auf eine interne Adresse umgebogen werden, und ein öffentlicher Dienst kann per Redirect
 * dorthin weiterleiten. Adressen aus der `.env` hat der Betreiber selbst eingetragen.
 */
async function visionFetch(config: VisionConfig, url: string, init: RequestInit): Promise<Response> {
  if (config.source !== "app") return fetch(url, init);
  if (!(await isAllowedVisionUrl(url))) throw new Error("vision target not allowed");
  return fetch(url, { ...init, redirect: "error" });
}

/** Health-Probe fürs eigene Backend: winzige echte Mini-Inferenz („ping", 1 Token). Bestätigt, dass
 *  der Host erreichbar ist UND das Modell antwortet. Wirft nie. */
export async function visionHealthProbe(
  config: VisionConfig,
  timeoutMs = 20_000,
): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  if (!config.baseUrl || !config.models) return { ok: false, latencyMs: 0, error: "vision base URL not set" };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const startedAt = Date.now();
  try {
    const res = await visionFetch(config, endpoint(config), {
      method: "POST",
      headers: headers(config),
      body: JSON.stringify({ model: config.models.strong, max_tokens: 1, temperature: 0, messages: [{ role: "user", content: "ping" }] }),
      signal: ctrl.signal,
    });
    const latencyMs = Date.now() - startedAt;
    await res.text().catch(() => {}); // Body verwerfen (nur Status relevant) → hält sonst den Socket bis GC
    return res.ok ? { ok: true, latencyMs } : { ok: false, latencyMs, error: `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, latencyMs: Date.now() - startedAt, error: (e as Error).message };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Erkennt die Absage eines Anbieters, der die klassischen Parameter nicht mehr nimmt: neuere
 * OpenAI-Modelle verlangen `max_completion_tokens` statt `max_tokens` und lehnen ein gesetztes
 * `temperature` ab. Genau EIN zweiter Versuch in der neuen Form — sonst läuft ein Fehler, der mit
 * den Parametern nichts zu tun hat, zweimal durch.
 */
function isParameterRejection(status: number, body: string): boolean {
  return status === 400 && /max_tokens|max_completion_tokens|temperature/i.test(body);
}

/**
 * Führt eine Vision-Anfrage aus. Wirft bei Timeout oder HTTP-Fehler — der Aufrufer fängt das ab und
 * gibt `null` zurück. Einen Rückfall auf einen anderen Anbieter gibt es bewusst nicht: fällt der
 * gewählte Dienst aus, bleibt das Foto ungeprüft, statt heimlich woanders hinzugehen.
 */
export async function openaiCompatibleComplete(config: VisionConfig, model: string, req: VisionRequest): Promise<VisionResponse> {
  const url = endpoint(config);
  const timeoutMs = Number(process.env.LOCAL_VISION_TIMEOUT_MS) || 120_000;

  // Der Body enthält das Base64-Bild (mehrere hundert KB). Er wird je Form EINMAL zu Bytes kodiert,
  // und das Nachrichten-Array entsteht nur im Builder — nach dem Kodieren hält nichts mehr eine
  // zweite Kopie des Bildes über die Aufrufdauer, und Wiederholungen kodieren nicht neu.
  const encode = (params: Record<string, unknown>) => new TextEncoder().encode(JSON.stringify({
    model,
    ...params,
    messages: [{
      role: "user",
      content: req.content.map((b) =>
        b.type === "text"
          ? { type: "text" as const, text: b.text }
          : { type: "image_url" as const, image_url: { url: `data:${b.mediaType};base64,${b.base64}` } }
      ),
    }],
  }));
  let body = encode({ max_tokens: req.maxTokens, temperature: 0 });
  let modernForm = false;

  /** Ein Aufruf. `null` = der Anbieter lehnt die Parameter-Form ab. */
  async function send(): Promise<VisionResponse | null> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await visionFetch(config, url, { method: "POST", headers: headers(config), body, signal: ctrl.signal });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        if (isParameterRejection(res.status, text)) return null;
        throw new Error(`vision HTTP ${res.status}: ${text.slice(0, 200)}`);
      }
      const data = (await res.json()) as OpenAIChatResponse;
      return {
        text: data.choices?.[0]?.message?.content ?? "",
        requestId: data.id,
        stopReason: data.choices?.[0]?.finish_reason ?? null,
        protocol: "openai",
      };
    } finally {
      clearTimeout(timer);
    }
  }

  /** Parameter-Retry: lehnt der Anbieter die klassische Form ab, genau ein Versuch in der neuen — und
   *  die bleibt dann, auch für einen Timeout-Retry, statt die abgelehnte Form erneut zu senden. */
  async function sendAnyForm(): Promise<VisionResponse> {
    const res = await send();
    if (res) return res;
    if (modernForm) throw new Error("vision HTTP 400: parameters rejected");
    modernForm = true;
    body = encode({ max_completion_tokens: req.maxTokens });
    const second = await send();
    if (!second) throw new Error("vision HTTP 400: parameters rejected");
    return second;
  }

  // Der erste Call nach Leerlauf kann in den Modell-Cold-Start laufen (Laden dauert länger als der
  // Timeout); der Abbruch stoppt das server-seitige Laden nicht. GENAU EIN zweiter Versuch trifft dann
  // das inzwischen geladene Modell. Andere Fehler (HTTP, Config) nicht wiederholen.
  try {
    return await sendAnyForm();
  } catch (e) {
    if ((e as Error).name !== "AbortError") throw e;
    console.warn(`[vision] Timeout nach ${timeoutMs}ms (task ${req.task}) — zweiter Versuch (Cold Start?)`);
    return sendAnyForm();
  }
}
