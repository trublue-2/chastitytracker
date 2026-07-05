import type { VisionRequest, VisionResponse, VisionTask } from "./types";

/** Lokales Modell (z.B. Ollama). Default + optionale Pro-Task-Overrides via Env.
 *  Ein lokales Modell deckt i.d.R. alle drei Tasks ab; die Overrides erlauben
 *  Feintuning (z.B. ein größeres Modell nur für die Siegel-OCR). */
function modelFor(task: VisionTask): string {
  const base = process.env.LOCAL_VISION_MODEL || "qwen2.5-vl:7b";
  const overrides: Record<VisionTask, string | undefined> = {
    "code-verify": process.env.LOCAL_VISION_MODEL_CODE,
    "seal-detect": process.env.LOCAL_VISION_MODEL_SEAL,
    "device-detect": process.env.LOCAL_VISION_MODEL_DEVICE,
    "device-check": process.env.LOCAL_VISION_MODEL_DEVICE, // gleicher Override wie device-detect
  };
  return overrides[task] || base;
}

/** Ist der lokale Provider konfiguriert? (Basis-URL gesetzt) */
export function localAvailable(): boolean {
  return !!process.env.LOCAL_VISION_BASE_URL;
}

/** Health-Probe: winzige echte Mini-Inferenz (Text-only „ping", max_tokens 1) gegen den lokalen
 *  Vision-Dienst → bestätigt, dass der Host erreichbar ist UND das Modell antwortet (nicht nur der
 *  TCP-Port offen ist). Kein Bild, minimale Last, keine relevanten Kosten (lokal). Wirft nie —
 *  liefert {ok, latencyMs, error?} für den Health-Check. */
export async function visionHealthProbe(
  timeoutMs = 20_000,
): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  const base = process.env.LOCAL_VISION_BASE_URL;
  if (!base) return { ok: false, latencyMs: 0, error: "LOCAL_VISION_BASE_URL not set" };
  const url = `${base.replace(/\/+$/, "")}/chat/completions`;
  const apiKey = process.env.LOCAL_VISION_API_KEY || "local";
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const startedAt = Date.now();
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: modelFor("code-verify"), max_tokens: 1, temperature: 0, messages: [{ role: "user", content: "ping" }] }),
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

interface OpenAIChatResponse {
  id?: string;
  choices?: { message?: { content?: string }; finish_reason?: string | null }[];
}

/**
 * Führt eine Vision-Anfrage über einen OpenAI-kompatiblen Endpoint aus
 * (Ollama, vLLM, …). Wirft bei fehlender Konfiguration, Timeout oder HTTP-Fehler —
 * der Aufrufer fängt das ab und gibt `null` zurück (kein heimlicher Anthropic-Fallback).
 */
export async function localComplete(req: VisionRequest): Promise<VisionResponse> {
  const baseUrl = process.env.LOCAL_VISION_BASE_URL;
  if (!baseUrl) throw new Error("LOCAL_VISION_BASE_URL not set");

  const url = `${baseUrl.replace(/\/+$/, "")}/chat/completions`;
  const apiKey = process.env.LOCAL_VISION_API_KEY || "local"; // Ollama ignoriert den Key
  const timeoutMs = Number(process.env.LOCAL_VISION_TIMEOUT_MS) || 120_000;

  // OpenAI-Format: Text bleibt Text, Bilder werden zu data:-URIs. Body EINMAL serialisieren (enthält
  // das Base64-Bild, mehrere MB) — der Retry-Pfad soll nicht neu stringifyen, und das content-
  // Zwischenarray wird nach dem Stringify GC-fähig (eine Bild-Kopie weniger über die Call-Dauer).
  const body = JSON.stringify({
    model: modelFor(req.task),
    max_tokens: req.maxTokens,
    temperature: 0, // deterministisch — OCR/Klassifikation, keine Kreativität
    messages: [{
      role: "user",
      content: req.content.map((b) =>
        b.type === "text"
          ? { type: "text" as const, text: b.text }
          : { type: "image_url" as const, image_url: { url: `data:${b.mediaType};base64,${b.base64}` } }
      ),
    }],
  });

  async function attempt(): Promise<VisionResponse> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body,
        signal: ctrl.signal,
      });

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`local vision HTTP ${res.status}: ${body.slice(0, 200)}`);
      }

      const data = (await res.json()) as OpenAIChatResponse;
      const text = data.choices?.[0]?.message?.content ?? "";
      return {
        text,
        requestId: data.id,
        stopReason: data.choices?.[0]?.finish_reason ?? null,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  // Der erste Call nach Leerlauf kann in den Modell-Cold-Start laufen (Laden dauert länger als
  // der Timeout); der Abbruch stoppt das server-seitige Laden nicht. GENAU EIN zweiter Versuch
  // trifft dann das inzwischen geladene Modell. Andere Fehler (HTTP, Config) nicht wiederholen.
  try {
    return await attempt();
  } catch (e) {
    if ((e as Error).name !== "AbortError") throw e;
    console.warn(`[vision:local] Timeout nach ${timeoutMs}ms (task ${req.task}) — zweiter Versuch (Cold Start?)`);
    return attempt();
  }
}
