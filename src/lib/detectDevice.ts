import type Anthropic from "@anthropic-ai/sdk";
import { anthropic } from "@/lib/anthropic";
import { loadUploadedImage, type ImageData } from "@/lib/imageUtils";
import { structuredLog } from "@/lib/serverLog";

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

/**
 * Uses Claude Vision to identify which device appears in `newImageUrl` by comparing
 * it against the reference images per device.
 *
 * Returns the matched device, or null if no match can be determined.
 */
export async function detectDevice(
  newImageUrl: string,
  references: DeviceReference[]
): Promise<DetectedDevice | null> {
  // Load reference images for each device (parallel)
  const loadedRefs: LoadedReference[] = (
    await Promise.all(
      references.map(async (ref) => {
        const images = (
          await Promise.all(ref.imageUrls.map(loadUploadedImage))
        ).filter((img): img is ImageData => img !== null);
        return images.length > 0
          ? { deviceId: ref.deviceId, deviceName: ref.deviceName, images }
          : null;
      })
    )
  ).filter((r): r is LoadedReference => r !== null);

  if (loadedRefs.length === 0) {
    dlog("detect:no_references_loaded", { newImageUrl, refCount: references.length });
    return null;
  }

  const newImg = await loadUploadedImage(newImageUrl);
  if (!newImg) {
    dlog("detect:new_image_load_failed", { newImageUrl });
    return null;
  }

  // Assign stable keys (DEVICE_1, DEVICE_2, …) for the prompt
  const deviceKeys = loadedRefs.map((ref, i) => ({
    key: `DEVICE_${i + 1}`,
    deviceId: ref.deviceId,
    deviceName: ref.deviceName,
  }));

  // Build message content: reference images grouped by device, then the query image
  const content: Anthropic.MessageParam["content"] = [];

  let introText =
    "You are identifying which chastity device appears in the QUERY image.\n\nKnown devices:\n";
  for (const dk of deviceKeys) {
    introText += `  ${dk.key}: "${dk.deviceName}"\n`;
  }
  content.push({ type: "text", text: introText });

  for (let i = 0; i < loadedRefs.length; i++) {
    content.push({
      type: "text",
      text: `Reference images for ${deviceKeys[i].key} ("${loadedRefs[i].deviceName}"):`,
    });
    for (const img of loadedRefs[i].images) {
      content.push({
        type: "image",
        source: { type: "base64", media_type: img.mediaType, data: img.base64 },
      });
    }
  }

  content.push({ type: "text", text: "QUERY image (the photo to identify):" });
  content.push({
    type: "image",
    source: { type: "base64", media_type: newImg.mediaType, data: newImg.base64 },
  });

  const validKeys = deviceKeys.map((d) => `"${d.key}"`).join(", ");
  content.push({
    type: "text",
    text: `Based on visual characteristics (shape, color, model, brand markings, size), which device does the QUERY image show?\nRespond with JSON only: {"device": <one of ${validKeys}, or null if you cannot determine>}`,
  });

  try {
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 50,
      messages: [{ role: "user", content }],
    });

    const text =
      response.content[0].type === "text" ? response.content[0].text : "";
    dlog("detect:response", {
      requestId: response.id,
      textPreview: text.slice(0, 200),
      refCount: loadedRefs.length,
    });

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      dlog("detect:no_json", { textPreview: text.slice(0, 200) });
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]) as { device?: string | null };
    const deviceKey = parsed.device;
    if (!deviceKey || typeof deviceKey !== "string") return null;

    const matched = deviceKeys.find((d) => d.key === deviceKey);
    if (!matched) {
      dlog("detect:unknown_key", { deviceKey });
      return null;
    }

    dlog("detect:matched", {
      deviceKey,
      deviceId: matched.deviceId,
      deviceName: matched.deviceName,
    });
    return { deviceId: matched.deviceId, deviceName: matched.deviceName };
  } catch (e) {
    const err = e as { message?: string; name?: string };
    dlog("detect:exception", { error: err.message, name: err.name });
    return null;
  }
}
