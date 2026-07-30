import type { DeviceCheckStatus } from "@/lib/deviceCheck";
import { loadUploadedImage, type ImageData } from "@/lib/imageUtils";
import { visionDeviceMaxImagePx, visionMaxTotalRefs } from "@/lib/constants";
import { structuredLog } from "@/lib/serverLog";
import { visionComplete, visionConfigured, type VisionBlock } from "@/lib/vision";
import { parseJsonObject } from "@/lib/vision/parse";

function dlog(label: string, fields: Record<string, unknown>) {
  structuredLog("detect-device", label, fields);
}

/** Antwort-Token für „ein Gerät ist zu sehen, aber diese Ansicht trägt die Unterscheidung nicht".
 *  Bewusst kein DEVICE_-Schlüssel, damit es beim Nachschlagen nicht versehentlich matcht. */
const UNSURE = "UNSURE";

export interface DeviceReference {
  deviceId: string;
  deviceName: string;
  /** Wie das Gerät AUSSIEHT, in Worten (Material, Bauform, Beschreibung) — `null`, wenn nichts
   *  hinterlegt ist. Bewusst nur die optischen Stammdaten: `securityLevel`, `pullOffRisk`,
   *  `healthFlags` und `retentionNotes` sagen nichts über das Bild und hätten im Prompt nur
   *  ablenkendes Gewicht. */
  visualTraits: string | null;
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
  visualTraits: string | null;
  images: ImageData[];
}

interface DeviceSet {
  loadedRefs: LoadedReference[];
  deviceKeys: { key: string; deviceId: string; deviceName: string; visualTraits: string | null }[];
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
        return images.length > 0 ? { deviceId: ref.deviceId, deviceName: ref.deviceName, visualTraits: ref.visualTraits, images } : null;
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

  const deviceKeys = loadedRefs.map((ref, i) => ({ key: `DEVICE_${i + 1}`, deviceId: ref.deviceId, deviceName: ref.deviceName, visualTraits: ref.visualTraits }));
  return { loadedRefs, deviceKeys, newImg };
}

/** Die gültigen Antwort-Schlüssel als Aufzählung für den Prompt. Eine Quelle für beide Prompts: der
 *  Parser schlägt die Antwort später in genau dieser Liste nach, zwei handgeschriebene Kopien könnten
 *  in Format oder Bestand auseinanderlaufen und Antworten erzeugen, die er dann verwirft. */
function deviceKeyList(set: DeviceSet): string {
  return set.deviceKeys.map((d) => `"${d.key}"`).join(", ");
}

/**
 * Der „Known devices"-Katalog des Prompts. Nennt je Gerät den Schlüssel, den Namen und — sofern
 * hinterlegt — die optischen Merkmale.
 *
 * Die Merkmale stehen hier, weil Bilder allein zwei optisch nahe Geräte nicht trennen: am 27.07.2026
 * wurde ein Vollmetall-KG auf einem Ausschnitt ohne Gurt für ein anderes Vollmetall-KG gehalten. Ein
 * Satz wie „starrer Hüftreif, breites Schrittband" ist genau das Unterscheidungsmerkmal, das auf
 * einem Teilbild fehlt — und das ein Referenzfoto nie explizit macht.
 *
 * `requiredKey` markiert das Gerät, das getragen werden MUSS (nur der Kontroll-Check kennt eins).
 */
function deviceCatalogue(set: DeviceSet, requiredKey?: string): string {
  return set.deviceKeys
    .map((dk) => {
      const required = dk.key === requiredKey ? " — REQUIRED (the device the user must be wearing)" : "";
      const traits = dk.visualTraits ? ` — looks like: ${dk.visualTraits}` : "";
      return `  ${dk.key}: "${dk.deviceName}"${required}${traits}`;
    })
    .join("\n");
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
    deviceCatalogue(set) + "\n";
  const validKeys = deviceKeyList(set);
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
  /** ok = passendes Gerät sichtbar · wrong = ein ANDERES, benanntes Gerät sichtbar · missing = kein
   *  Gerät sichtbar · error = NICHT PRÜFBAR (Bild/Referenzen nicht ladbar, keine Referenzbilder,
   *  Vision-Fehler, oder ein Gerät sichtbar, das keiner Referenz zuzuordnen war) — ein klarer
   *  „konnte nicht prüfen" statt eines stillen null, das mit „gar nicht geprüft" verschmilzt.
   *
   *  `pending` ist hier ausgeschlossen: es ist ein Marker des SCHREIBPFADS („Erkennung läuft"), den
   *  `entries/route.ts` vor dem Aufruf setzt. Ein Ergebnis dieser Funktion ist per Definition ein
   *  Endzustand — so kann niemand versehentlich `pending` zurückgeben und die Zeile dort festnageln. */
  status: Exclude<DeviceCheckStatus, "pending">;
  /** Im Foto erkanntes Gerät (Name) oder null, wenn keins zugeordnet/sichtbar/prüfbar; bei "wrong"
   *  immer gesetzt. */
  detected: string | null;
  /** Erwartetes (aktuell verschlossenes) Gerät — der Soll-Zustand; null, wenn bei „error" nicht auflösbar. */
  expected: string | null;
};

/**
 * Kontroll-Geräte-Check: Ist das aktuell verschlossene Gerät (`lockedDeviceId`) im Kontroll-Foto
 * sichtbar? Presence + Match gegen die Referenzbilder aller Geräte. Advisory (Keyholder sieht es).
 * `status:"error"` = geprüft werden WOLLTE, ging aber nicht (Bild/Referenzen unladbar, keine
 * Referenzbilder, Vision-Fehler, unlesbare Antwort, oder ein Gerät sichtbar, das keiner Referenz
 * zuzuordnen war) — ein klarer „nicht prüfbar" statt eines stillen null. `null` NUR,
 * wenn gar kein Vision-Provider konfiguriert ist (Feature aus).
 */
export async function checkDeviceInPhoto(
  queryImageUrl: string,
  references: DeviceReference[],
  lockedDeviceId: string
): Promise<DeviceCheckResult | null> {
  // Erwarteter Gerätename für den „nicht prüfbar"-Fall (aus den rohen Referenzen, unabhängig davon,
  // ob die Bilder ladbar waren); null, wenn das Gerät gar keine Referenz hat.
  const expectedName = references.find((r) => r.deviceId === lockedDeviceId)?.deviceName ?? null;

  // Kein Vision-Provider = Feature aus (kein Fehler pro Foto) → bewusst null, nicht „error".
  if (!visionConfigured()) {
    dlog("check:not_configured", { queryImageUrl });
    return null;
  }

  const set = await loadDeviceSet(references, queryImageUrl);
  if (!set) {
    // Bild/Referenzen nicht ladbar → geprüft werden WOLLTE, ging aber nicht: nicht prüfbar.
    dlog("check:load_failed", { queryImageUrl, refCount: references.length });
    return { status: "error", detected: null, expected: expectedName };
  }
  const lockedKey = set.deviceKeys.find((d) => d.deviceId === lockedDeviceId);
  if (!lockedKey) {
    // Keine (ladbaren) Referenzbilder des verschlossenen Geräts → nicht prüfbar.
    dlog("check:locked_no_references", { lockedDeviceId });
    return { status: "error", detected: null, expected: expectedName };
  }

  const intro =
    `You are verifying a chastity-control photo. The user must currently be wearing ${lockedKey.key} ("${lockedKey.deviceName}").\n\nKnown devices:\n` +
    deviceCatalogue(set, lockedKey.key) + "\n";
  const content: VisionBlock[] = [
    { type: "text", text: intro },
    ...deviceImageBlocks(set),
    {
      type: "text",
      text:
        `Answer two questions about the QUERY photo:\n` +
        `1) present: is a chastity device clearly visible (worn on a body) in the QUERY photo? true/false\n` +
        `2) device: if present, which reference device does it match?\n` +
        `   - one of ${deviceKeyList(set)} when the visible details actually identify it\n` +
        `   - "${UNSURE}" when a device is visible but this view does not show enough to tell the known devices apart — ` +
        `e.g. a close crop, or the parts that distinguish them are outside the frame or hidden\n` +
        `   - null when it clearly matches none of them\n` +
        `Naming a specific device is a positive identification. If two of the known devices would both ` +
        `fit what you can see, answer "${UNSURE}" rather than picking the more likely one.\n` +
        `Reply with JSON only: {"present": <true|false>, "device": <"DEVICE_n" | "${UNSURE}" | null>}`,
    },
  ];

  try {
    const response = await visionComplete({ task: "device-check", maxTokens: 50, content });
    dlog("check:response", { requestId: response.requestId, textPreview: response.text.slice(0, 200) });

    const expected = lockedKey.deviceName;
    const parsed = parseJsonObject<{ present?: boolean; device?: string | null }>(response.text);
    // Unlesbare/abgeschnittene Antwort = nicht ausgewertet, NICHT „kein Gerät sichtbar" — sonst
    // steht wieder ein Negativbefund ohne Beleg in der Zeile (Issue #44, gleiche Klasse).
    if (!parsed) return { status: "error", detected: null, expected };
    if (parsed.present !== true) return { status: "missing", detected: null, expected };

    // Ausdrücklich unsicher: die Ansicht trägt die Unterscheidung nicht. Das ist ein NICHT-Befund,
    // kein Negativbefund — dieselbe Klasse wie „nicht zuordenbar" unten. Ohne diese Ausfahrt musste
    // das Modell sich zwischen „passt" und „ein anderes" entscheiden und riet auf einem Ausschnitt
    // gelegentlich das optisch nächste Gerät; das wurde als `wrong` gebucht, obwohl gar nichts
    // festgestellt war (Verwechslungsfall 27.07.2026, zwei Vollmetall-KG ohne sichtbaren Gurt).
    if (parsed.device === UNSURE) {
      dlog("check:unsure", { lockedDeviceId });
      return { status: "error", detected: null, expected };
    }

    const matched = parsed.device ? set.deviceKeys.find((d) => d.key === parsed.device) : undefined;
    if (matched?.key === lockedKey.key) {
      return { status: "ok", detected: expected, expected };
    }
    if (!matched) {
      // Nicht zuordenbar heisst NICHT „anderes Gerät getragen", sondern „nichts feststellbar":
      // Nicht-Befund, kein Negativbefund (Issue #44).
      dlog("check:present_unattributed", { device: parsed.device ?? null });
      return { status: "error", detected: null, expected };
    }
    // Ein anderes, benanntes Gerät ist sichtbar — der einzige echte Negativbefund.
    return { status: "wrong", detected: matched.deviceName, expected };
  } catch (e) {
    const err = e as { message?: string; name?: string };
    dlog("check:exception", { error: err.message, name: err.name });
    // Vision-Aufruf gescheitert → nicht prüfbar (expected ist hier bekannt).
    return { status: "error", detected: null, expected: lockedKey.deviceName };
  }
}
