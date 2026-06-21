import { prisma } from "@/lib/prisma";
import { structuredLog } from "@/lib/serverLog";
import { embedAvailable, embedModel, embedImages, bytesToVector, vectorToBytes, cosine } from "@/lib/embed";
import type { DetectedDevice } from "@/lib/detectDevice";

const dlog = (label: string, fields: Record<string, unknown>) => structuredLog("device-embed", label, fields);

/** Mindest-Abstand zwischen bestem und zweitbestem Gerät — sonst „zu unsicher" → kein Vorschlag. */
function minMargin(): number {
  const n = Number(process.env.EMBED_MIN_MARGIN);
  return Number.isFinite(n) ? n : 0.01;
}

/**
 * Geräte-Erkennung per BILD-EMBEDDING: das Query-Foto wird zu einem Vektor und dem Gerät mit der
 * höchsten Cosine-Ähnlichkeit (über dessen kuratierte Referenz-Embeddings) zugeordnet. Schnell
 * (Millisekunden) und genau, sobald der CLIP-Dienst läuft. Fehlende/veraltete Referenz-Embeddings
 * werden lazy berechnet und in DeviceReferenceImage.embedding gecacht.
 *
 * Voraussetzung: kuratierte Referenzfotos je Gerät. Geräte ohne Referenzen sind keine Kandidaten.
 * Gibt null zurück, wenn kein Dienst, keine Referenzen oder das Ergebnis zu uneindeutig ist.
 */
export async function detectDeviceByEmbedding(queryImageUrl: string, userId: string): Promise<DetectedDevice | null> {
  if (!embedAvailable()) return null;
  const model = embedModel();

  const devices = await prisma.device.findMany({
    where: { userId, archivedAt: null, OR: [{ category: { isBuiltIn: true } }, { categoryId: null }] },
    select: {
      id: true,
      name: true,
      referenceImages: { select: { id: true, imageUrl: true, embedding: true, embeddingModel: true } },
    },
  });
  const withRefs = devices.filter((d) => d.referenceImages.length > 0);
  if (withRefs.length === 0) return null;
  if (withRefs.length === 1) return { deviceId: withRefs[0].id, deviceName: withRefs[0].name };

  // Lazy: fehlende / Modell-fremde Referenz-Embeddings nachrechnen und persistieren.
  for (const d of withRefs) {
    const missing = d.referenceImages.filter((r) => !r.embedding || r.embeddingModel !== model);
    if (missing.length === 0) continue;
    const vecs = await embedImages(missing.map((r) => r.imageUrl));
    if (!vecs) continue;
    await Promise.all(
      missing.map((r, i) => {
        const v = vecs[i];
        if (!v) return Promise.resolve();
        r.embedding = vectorToBytes(v);
        r.embeddingModel = model;
        return prisma.deviceReferenceImage.update({ where: { id: r.id }, data: { embedding: r.embedding, embeddingModel: model } });
      })
    );
  }

  const q = (await embedImages([queryImageUrl]))?.[0];
  if (!q) {
    dlog("query_embed_failed", { queryImageUrl });
    return null;
  }

  // Score je Gerät = max Cosine über seine (gültigen) Referenz-Vektoren.
  const scores = withRefs
    .map((d) => {
      let best = -1;
      for (const r of d.referenceImages) {
        if (!r.embedding || r.embeddingModel !== model) continue;
        const sim = cosine(q, bytesToVector(r.embedding as Uint8Array));
        if (sim > best) best = sim;
      }
      return { deviceId: d.id, deviceName: d.name, score: best };
    })
    .filter((s) => s.score > -1)
    .sort((a, b) => b.score - a.score);

  if (scores.length === 0) return null;
  const top = scores[0];
  const margin = scores.length > 1 ? top.score - scores[1].score : 1;
  dlog("scores", { top: top.deviceName, topScore: Number(top.score.toFixed(3)), margin: Number(margin.toFixed(3)) });
  if (margin < minMargin()) return null; // zu uneindeutig → lieber kein (falscher) Vorschlag
  return { deviceId: top.deviceId, deviceName: top.deviceName };
}
