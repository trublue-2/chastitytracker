import { loadUploadedImage, type ImageData } from "@/lib/imageUtils";
import { visionDeviceMaxImagePx, visionMaxTotalRefs } from "@/lib/constants";
import { structuredLog } from "@/lib/serverLog";
import { visionComplete, visionConfigured, type VisionBlock } from "@/lib/vision";

function dlog(label: string, fields: Record<string, unknown>) {
  structuredLog("detect-device", label, fields);
}

export interface DeviceReference {
  deviceId: string;
  deviceName: string;
  /** All available reference image URLs for this device (device photo + recent Verschluss entries). */
  imageUrls: string[];
}

export interface DetectedDevice {
  deviceId: string;
  deviceName: string;
}

interface LoadedReference {
  deviceId: string;
  deviceName: string;
  images: ImageData[];
}

interface DeviceSet {
  loadedRefs: LoadedReference[];
  deviceKeys: { key: string; deviceId: string; deviceName: string }[];
  newImg: ImageData;
}

/** Lädt (runterskaliert) alle Referenzbilder + das Query-Bild und vergibt stabile DEVICE_n-Keys.
 *  Geteilt von detectDevice (Klassifikation) und checkDeviceInPhoto (Presence/Match). */
async function loadDeviceSet(references: DeviceReference[], queryImageUrl: string): Promise<DeviceSet | null> {
  const maxPx = visionDeviceMaxImagePx(); // kleiner als bei Ziffern — mehrere Bilder, Form reicht
  const loadedRefs: LoadedReference[] = (
    await Promise.all(
      references.map(async (ref) => {
        const images = (
          await Promise.all(ref.imageUrls.map((u) => loadUploadedImage(u, { maxPx })))
        ).filter((img): img is ImageData => img !== null);
        return images.length > 0 ? { deviceId: ref.deviceId, deviceName: ref.deviceName, images } : null;
      })
    )
  ).filter((r): r is LoadedReference => r !== null);
  if (loadedRefs.length === 0) return null;

  // Bilder je Gerät begrenzen (Latenz dominiert von der Bild-Anzahl): fairer Anteil aus dem
  // Gesamt-Budget, min. 1. Best-effort — bei mehr Geräten als visionMaxTotalRefs() bleibt es bei
  // 1 Bild/Gerät, die Gesamtzahl kann das Budget dann übersteigen (jedes Gerät braucht ≥1 Bild).
  const perDevice = Math.max(1, Math.floor(visionMaxTotalRefs() / loadedRefs.length));
  for (const r of loadedRefs) r.images = r.images.slice(0, perDevice);

  const newImg = await loadUploadedImage(queryImageUrl, { maxPx });
  if (!newImg) return null;

  const deviceKeys = loadedRefs.map((ref, i) => ({ key: `DEVICE_${i + 1}`, deviceId: ref.deviceId, deviceName: ref.deviceName }));
  return { loadedRefs, deviceKeys, newImg };
}

/** Referenzbild-Blöcke je Gerät + Query-Bild (gemeinsamer Prompt-Aufbau). */
function deviceImageBlocks(set: DeviceSet): VisionBlock[] {
  const content: VisionBlock[] = [];
  for (let i = 0; i < set.loadedRefs.length; i++) {
    content.push({ type: "text", text: `Reference images for ${set.deviceKeys[i].key} ("${set.loadedRefs[i].deviceName}"):` });
    for (const img of set.loadedRefs[i].images) {
      content.push({ type: "image", mediaType: img.mediaType, base64: img.base64 });
    }
  }
  content.push({ type: "text", text: "QUERY image (the photo to check):" });
  content.push({ type: "image", mediaType: set.newImg.mediaType, base64: set.newImg.base64 });
  return content;
}

/** Erstes JSON-Objekt aus einer Modellantwort parsen, sonst null. */
function parseJsonObject<T>(text: string): T | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]) as T;
  } catch {
    return null;
  }
}

/**
 * Uses the vision model to identify which device appears in `newImageUrl` by comparing
 * it against the reference images per device. Returns the matched device, or null.
 */
export async function detectDevice(
  newImageUrl: string,
  references: DeviceReference[]
): Promise<DetectedDevice | null> {
  // Geräte-Erkennung ist Bild-Verständnis (kein OCR-Fallback). Ohne Vision-Provider sauber aussteigen.
  if (!visionConfigured()) {
    dlog("detect:not_configured", { newImageUrl });
    return null;
  }

  const set = await loadDeviceSet(references, newImageUrl);
  if (!set) {
    dlog("detect:load_failed", { newImageUrl, refCount: references.length });
    return null;
  }

  const intro =
    "You are identifying which chastity device appears in the QUERY image.\n\nKnown devices:\n" +
    set.deviceKeys.map((dk) => `  ${dk.key}: "${dk.deviceName}"`).join("\n") + "\n";
  const validKeys = set.deviceKeys.map((d) => `"${d.key}"`).join(", ");
  const content: VisionBlock[] = [
    { type: "text", text: intro },
    ...deviceImageBlocks(set),
    {
      type: "text",
      text: `Based on visual characteristics (shape, color, model, brand markings, size), which device does the QUERY image show?\nRespond with JSON only: {"device": <one of ${validKeys}, or null if you cannot determine>}`,
    },
  ];

  try {
    const response = await visionComplete({ task: "device-detect", maxTokens: 50, content });
    dlog("detect:response", { requestId: response.requestId, textPreview: response.text.slice(0, 200), refCount: set.loadedRefs.length });

    const parsed = parseJsonObject<{ device?: string | null }>(response.text);
    const matched = parsed?.device ? set.deviceKeys.find((d) => d.key === parsed.device) : undefined;
    if (!matched) {
      dlog("detect:no_match", { device: parsed?.device ?? null });
      return null;
    }
    dlog("detect:matched", { deviceId: matched.deviceId, deviceName: matched.deviceName });
    return { deviceId: matched.deviceId, deviceName: matched.deviceName };
  } catch (e) {
    const err = e as { message?: string; name?: string };
    dlog("detect:exception", { error: err.message, name: err.name });
    return null;
  }
}

export type DeviceCheckResult = {
  /** ok = passendes Gerät sichtbar · wrong = anderes/unklares Gerät · missing = kein Gerät sichtbar. */
  status: "ok" | "wrong" | "missing";
  /** Im Foto erkanntes Gerät (Name) oder null, wenn keins zugeordnet/sichtbar. */
  detected: string | null;
  /** Erwartetes (aktuell verschlossenes) Gerät — der Soll-Zustand. */
  expected: string;
};

/**
 * Kontroll-Geräte-Check: Ist das aktuell verschlossene Gerät (`lockedDeviceId`) im Kontroll-Foto
 * sichtbar? Presence + Match gegen die Referenzbilder aller Geräte. Advisory (Keyholder sieht es).
 * Gibt null zurück, wenn nicht prüfbar (kein Provider / keine Referenzbilder des verschlossenen Geräts).
 */
export async function checkDeviceInPhoto(
  queryImageUrl: string,
  references: DeviceReference[],
  lockedDeviceId: string
): Promise<DeviceCheckResult | null> {
  if (!visionConfigured()) {
    dlog("check:not_configured", { queryImageUrl });
    return null;
  }

  const set = await loadDeviceSet(references, queryImageUrl);
  if (!set) {
    dlog("check:load_failed", { queryImageUrl, refCount: references.length });
    return null;
  }
  const lockedKey = set.deviceKeys.find((d) => d.deviceId === lockedDeviceId);
  if (!lockedKey) {
    // Keine (ladbaren) Referenzbilder des verschlossenen Geräts → nicht prüfbar.
    dlog("check:locked_no_references", { lockedDeviceId });
    return null;
  }

  const intro =
    `You are verifying a chastity-control photo. The user must currently be wearing ${lockedKey.key} ("${lockedKey.deviceName}").\n\nKnown devices:\n` +
    set.deviceKeys.map((dk) => `  ${dk.key}: "${dk.deviceName}"${dk.key === lockedKey.key ? " — REQUIRED (the device the user must be wearing)" : ""}`).join("\n") + "\n";
  const content: VisionBlock[] = [
    { type: "text", text: intro },
    ...deviceImageBlocks(set),
    {
      type: "text",
      text:
        `Answer two questions about the QUERY photo:\n` +
        `1) present: is a chastity device clearly visible (worn on a body) in the QUERY photo? true/false\n` +
        `2) device: if present, which reference device does it match? one of ${set.deviceKeys.map((d) => `"${d.key}"`).join(", ")}, or null if it matches none.\n` +
        `Reply with JSON only: {"present": <true|false>, "device": <"DEVICE_n" or null>}`,
    },
  ];

  try {
    const response = await visionComplete({ task: "device-check", maxTokens: 50, content });
    dlog("check:response", { requestId: response.requestId, textPreview: response.text.slice(0, 200) });

    const expected = lockedKey.deviceName;
    const parsed = parseJsonObject<{ present?: boolean; device?: string | null }>(response.text);
    if (!parsed || !parsed.present) return { status: "missing", detected: null, expected };

    const matched = parsed.device ? set.deviceKeys.find((d) => d.key === parsed.device) : undefined;
    if (matched?.key === lockedKey.key) {
      return { status: "ok", detected: expected, expected };
    }
    // Gerät sichtbar, aber nicht das verschlossene (anderes erkannt oder keins zugeordnet).
    return { status: "wrong", detected: matched?.deviceName ?? null, expected };
  } catch (e) {
    const err = e as { message?: string; name?: string };
    dlog("check:exception", { error: err.message, name: err.name });
    return null;
  }
}
