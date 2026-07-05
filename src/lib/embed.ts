import { loadUploadedImage } from "@/lib/imageUtils";
import { visionDeviceMaxImagePx } from "@/lib/constants";
import { structuredLog } from "@/lib/serverLog";

/**
 * Client für den lokalen Bild-Embedding-Dienst (CLIP/SigLIP, OpenAI-unabhängig). Liefert L2-
 * normalisierte Vektoren; die Geräte-Zuordnung passiert per Cosine-Ähnlichkeit (Nächster-Nachbar
 * gegen kuratierte Referenz-Embeddings). Aktiv, sobald EMBED_BASE_URL gesetzt ist — dann läuft die
 * Geräte-Erkennung in Millisekunden statt sekundenlanger VLM-Inferenz.
 */

const elog = (label: string, fields: Record<string, unknown>) => structuredLog("embed", label, fields);

export function embedAvailable(): boolean {
  return !!process.env.EMBED_BASE_URL;
}

/** 1×1-Pixel-Testbild (transparentes PNG) für die Health-Probe des Embedding-Diensts. */
const HEALTH_PROBE_PNG_1PX = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

/** Health-Probe: echte Mini-Inferenz (bettet ein 1×1-Pixel-Bild ein) → bestätigt, dass der
 *  Embedding-Dienst erreichbar ist UND einen Vektor liefert (nicht nur der Port offen ist). Wirft
 *  nie — liefert {ok, latencyMs, error?} für den Health-Check. */
export async function embedHealthProbe(
  timeoutMs = 20_000,
): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  const base = process.env.EMBED_BASE_URL;
  if (!base) return { ok: false, latencyMs: 0, error: "EMBED_BASE_URL not set" };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const startedAt = Date.now();
  try {
    const res = await fetch(`${base.replace(/\/+$/, "")}/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ images: [HEALTH_PROBE_PNG_1PX] }),
      signal: ctrl.signal,
    });
    const latencyMs = Date.now() - startedAt;
    if (!res.ok) {
      await res.text().catch(() => {}); // Body verwerfen → Socket freigeben
      return { ok: false, latencyMs, error: `HTTP ${res.status}` };
    }
    const data = (await res.json().catch(() => null)) as { embeddings?: number[][] } | null;
    return data?.embeddings?.length === 1 ? { ok: true, latencyMs } : { ok: false, latencyMs, error: "bad response" };
  } catch (e) {
    return { ok: false, latencyMs: Date.now() - startedAt, error: (e as Error).message };
  } finally {
    clearTimeout(timer);
  }
}

/** Modellname für die Invalidierung gespeicherter Embeddings (muss zum Dienst passen). */
export function embedModel(): string {
  return process.env.EMBED_MODEL || "clip-ViT-L-14";
}

/** Float32-Vektor → Buffer (Prisma Bytes) und zurück (Offset-/Alignment-sicher kopiert). */
export function vectorToBytes(v: Float32Array): Buffer {
  // Echte Kopie des Byte-Bereichs — NICHT Buffer.from(v.buffer, …), das wäre ein View, der den
  // Vektor-Speicher aliast (Korruption, falls v ein Subarray ist oder später mutiert wird).
  return Buffer.from(v.buffer.slice(v.byteOffset, v.byteOffset + v.byteLength));
}
export function bytesToVector(b: Uint8Array): Float32Array {
  // Korrupte/abgeschnittene Blobs (Länge kein Vielfaches von 4) → leerer Vektor statt RangeError,
  // damit eine kaputte DB-Zeile nicht die ganze Erkennung wirft (Score 0 → effektiv ignoriert).
  if (b.byteLength % 4 !== 0) return new Float32Array(0);
  const copy = new Uint8Array(b.byteLength);
  copy.set(b);
  return new Float32Array(copy.buffer);
}

/** Cosine-Ähnlichkeit. Vektoren sind L2-normalisiert → Dot-Produkt genügt. */
export function cosine(a: Float32Array, b: Float32Array): number {
  const n = Math.min(a.length, b.length);
  let s = 0;
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
}

/**
 * Bettet hochgeladene Bilder ein. Rückgabe ist AUSGERICHTET zu imageUrls (null je Bild, das nicht
 * geladen/eingebettet werden konnte). Null gesamt, wenn kein Dienst konfiguriert ist oder der Call
 * fehlschlägt.
 */
export async function embedImages(imageUrls: string[]): Promise<(Float32Array | null)[] | null> {
  const base = process.env.EMBED_BASE_URL;
  if (!base) return null;
  if (imageUrls.length === 0) return [];

  const maxPx = visionDeviceMaxImagePx();
  const loaded = await Promise.all(imageUrls.map((u) => loadUploadedImage(u, { maxPx })));
  const valid: { idx: number; b64: string }[] = [];
  loaded.forEach((img, idx) => { if (img) valid.push({ idx, b64: img.base64 }); });
  if (valid.length === 0) return imageUrls.map(() => null);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), Number(process.env.EMBED_TIMEOUT_MS) || 30_000);
  try {
    const res = await fetch(`${base.replace(/\/+$/, "")}/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ images: valid.map((v) => v.b64) }),
      signal: ctrl.signal,
    });
    if (!res.ok) { elog("http_error", { status: res.status }); return null; }
    const data = (await res.json()) as { embeddings?: number[][] };
    if (!data.embeddings || data.embeddings.length !== valid.length) { elog("bad_response", {}); return null; }
    const out: (Float32Array | null)[] = imageUrls.map(() => null);
    valid.forEach((v, i) => { out[v.idx] = Float32Array.from(data.embeddings![i]); });
    return out;
  } catch (e) {
    elog("exception", { error: (e as Error).message });
    return null;
  } finally {
    clearTimeout(timer);
  }
}
