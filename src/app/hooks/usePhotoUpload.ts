"use client";

import { useState, useCallback, useRef } from "react";
import { compressImage } from "@/lib/compressImage";
import type { Rotation } from "@/lib/constants";
import { fetchWithTimeout, UPLOAD_TIMEOUT_MS, uploadPhoto } from "@/lib/apiClient";
import { putBlob, offlineBlobToken, isOfflineBlobUrl } from "@/lib/idb";

/**
 * Netz-unabhängige Aufnahmezeit eines Fotos: erst die EXIF-Zeit (via `exifr`, wie server-seitig),
 * sonst `lastModified`. Gebraucht beim OFFLINE-Erfassen — der client-komprimierte Blob verliert
 * beim Canvas-Durchlauf seine EXIF-Daten, die Zeit muss also hier aus dem ORIGINAL gelesen werden.
 * `exifr` wird dynamisch geladen, damit es nur beim tatsächlichen Offline-Erfassen im Bundle landet.
 */
async function readClientExifTime(file: File): Promise<string | null> {
  try {
    const { default: exifr } = await import("exifr");
    const exif = await exifr.parse(file, { pick: ["DateTimeOriginal", "DateTime"] });
    const raw = exif?.DateTimeOriginal ?? exif?.DateTime;
    if (raw instanceof Date && !isNaN(raw.getTime())) return raw.toISOString();
  } catch { /* keine/unlesbare EXIF-Zeit → auf lastModified zurückfallen */ }
  return file.lastModified ? new Date(file.lastModified).toISOString() : null;
}

export type SealState = "idle" | "detecting" | "detected" | "not-detected";
/** Zustand der Waagen-Erkennung — dieselben vier Schritte wie bei der Siegel-Erkennung. */
export type ScaleState = SealState;
export type DeviceDetectionState = "idle" | "detecting" | "detected" | "not-detected";

export interface DeviceSuggestion {
  deviceId: string;
  deviceName: string;
}

interface UsePhotoUploadOptions {
  /** Current startTime for EXIF time comparison. */
  startTime: string;
  /** Translate EXIF warnings. Return a display string. */
  exifWarningText?: (type: "deviation" | "missing", hours?: number) => string;
  /** Translate upload error message. Return a display string. */
  uploadErrorText?: () => string;
  /** Auto-detect seal number from photo (Verschluss only). Default false. */
  enableSealDetection?: boolean;
  /** Auto-detect device from photo by comparing against reference images. Default false. */
  enableDeviceDetection?: boolean;
  /**
   * Die Waagen-Anzeige aus dem Foto lesen (Gewichts-Erfassung). Default false.
   *
   * Wie die Siegel-Erkennung ein VORSCHLAG: das Ergebnis füllt das Zahlenfeld vor, bestätigt wird
   * es vom Menschen. Läuft auch nach jedem Drehen erneut — bei einer Anzeige, die schräg
   * fotografiert wurde, ist genau das oft der Unterschied zwischen Lesen und Raten.
   */
  enableScaleDetection?: boolean;
  /** Anzeige-Einheit dessen, der fotografiert — gilt nur, wenn die Waage selbst keine nennt. */
  scaleUnitSystem?: "metric" | "imperial";
  /**
   * Darf dieses Formular ein Foto OHNE Netz lokal zwischenspeichern? Default false.
   *
   * NUR true setzen, wenn das Formular über die Offline-Warteschlange (`offlineFetch`) einreicht —
   * denn nur der Flush (`resolveOfflinePhotos`) löst den `offline-blob:<id>`-Marker wieder auf. Ein
   * Formular, das direkt sendet (Keyholder-Pfad, Aufgaben-Nachweis, Gerätebild, Bildersafe), würde
   * sonst einen Marker erzeugen, den niemand hochlädt — der Server lehnte ihn ab und der Blob bliebe
   * als Waise liegen. Ohne das Flag bleibt es beim bisherigen Verhalten: offline scheitert der Upload
   * mit einer Fehlermeldung (`abortUpload`).
   */
  enableOfflineCapture?: boolean;
  /** Initial values (for edit mode). */
  initial?: {
    imageUrl?: string | null;
    imageExifTime?: string | null;
    kontrollCode?: string | null;
  };
}

export function usePhotoUpload({
  startTime,
  exifWarningText,
  uploadErrorText,
  enableSealDetection = false,
  enableDeviceDetection = false,
  enableScaleDetection = false,
  scaleUnitSystem = "metric",
  enableOfflineCapture = false,
  initial,
}: UsePhotoUploadOptions) {
  const [imageUrl, setImageUrl] = useState(initial?.imageUrl ?? "");
  const [imageExifTime, setImageExifTime] = useState(initial?.imageExifTime ?? "");
  const [imagePreview, setImagePreview] = useState(initial?.imageUrl ?? "");
  const [uploading, setUploading] = useState(false);
  const [exifWarning, setExifWarning] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [sealNumber, setSealNumber] = useState(initial?.kontrollCode ?? "");
  const [sealState, setSealState] = useState<SealState>("idle");
  const [deviceSuggestion, setDeviceSuggestion] = useState<DeviceSuggestion | null>(null);
  const [deviceDetectionState, setDeviceDetectionState] = useState<DeviceDetectionState>("idle");
  const [rotation, setRotation] = useState<Rotation>(0);
  const [scaleKg, setScaleKg] = useState<number | null>(null);
  const [scaleState, setScaleState] = useState<ScaleState>("idle");
  const blobUrlRef = useRef<string | null>(null);
  // Ref so rotate callbacks always see the latest imageUrl without stale closure
  const imageUrlRef = useRef(imageUrl);
  imageUrlRef.current = imageUrl;

  const runDeviceDetection = useCallback(async (url: string) => {
    setDeviceDetectionState("detecting");
    setDeviceSuggestion(null);
    try {
      const res = await fetchWithTimeout(
        "/api/detect-device",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageUrl: url }),
        },
        // Bild-Frist, nicht die gewöhnliche: dahinter steckt eine Vision-Abfrage, die auf der
        // selbstgehosteten Box gut und gern eine halbe Minute braucht. Mit `CLIENT_TIMEOUT_MS`
        // hätte diese Korrektur die Erkennung abgewürgt, die vorher funktionierte.
        UPLOAD_TIMEOUT_MS,
      );
      if (res.ok) {
        const { deviceId, deviceName } = await res.json() as { deviceId: string | null; deviceName: string | null };
        if (deviceId && deviceName) {
          setDeviceSuggestion({ deviceId, deviceName });
          setDeviceDetectionState("detected");
        } else {
          setDeviceDetectionState("not-detected");
        }
      } else {
        setDeviceDetectionState("not-detected");
      }
    } catch {
      setDeviceDetectionState("not-detected");
    }
  }, []);

  const runScaleDetection = useCallback(async (url: string, rot: Rotation) => {
    setScaleState("detecting");
    try {
      const res = await fetchWithTimeout(
        "/api/detect-weight",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageUrl: url, rotation: rot, unit: scaleUnitSystem }),
        },
        UPLOAD_TIMEOUT_MS,
      );
      if (!res.ok) { setScaleState("not-detected"); return; }
      const { detectedKg } = await res.json() as { detectedKg: number | null };
      setScaleKg(detectedKg);
      setScaleState(detectedKg === null ? "not-detected" : "detected");
    } catch {
      setScaleState("not-detected");
    }
  }, [scaleUnitSystem]);

  const runSealDetection = useCallback(async (url: string, rot: Rotation) => {
    setSealState("detecting");
    try {
      const detectRes = await fetchWithTimeout(
        "/api/detect-seal",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageUrl: url, rotation: rot }),
        },
        UPLOAD_TIMEOUT_MS,
      );
      if (detectRes.ok) {
        const { detected } = await detectRes.json() as { detected: string | null };
        if (detected) {
          setSealNumber(detected);
          setSealState("detected");
        } else {
          setSealState("not-detected");
        }
      } else {
        setSealState("not-detected");
      }
    } catch {
      setSealState("not-detected");
    }
  }, []);

  const handleFile = useCallback(async (file: File) => {
    setUploading(true);
    setExifWarning("");
    setUploadError("");
    setRotation(0);
    if (enableSealDetection) setSealState("idle");
    if (enableScaleDetection) { setScaleState("idle"); setScaleKg(null); }
    if (enableDeviceDetection) { setDeviceDetectionState("idle"); setDeviceSuggestion(null); }
    if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
    const blobUrl = URL.createObjectURL(file);
    blobUrlRef.current = blobUrl;
    setImagePreview(blobUrl);

    // Read lastModified BEFORE compression (iOS Safari strips EXIF)
    const clientExifTime = file.lastModified ? new Date(file.lastModified).toISOString() : null;
    const compressed = await compressImage(file).catch(() => file);

    function abortUpload() {
      URL.revokeObjectURL(blobUrl);
      blobUrlRef.current = null;
      setImagePreview("");
      setImageUrl("");
      imageUrlRef.current = "";
      setImageExifTime("");
      setUploadError(uploadErrorText ? uploadErrorText() : "Upload failed");
      setUploading(false);
    }

    // OHNE NETZ (nur wenn das Formular queue-fähig ist, siehe `enableOfflineCapture`): das Foto lokal
    // zwischenspeichern statt hochzuladen. Der (komprimierte) Blob landet in IndexedDB, an die
    // Bild-Stelle des Rumpfs kommt ein `offline-blob:<id>`-Marker — beim Nachreichen lädt
    // `useOfflineQueue` den Blob hoch und ersetzt den Marker durch die echte URL. Die Kamera-Vorschau
    // (`blobUrl`) bleibt stehen. Erkennungen (Siegel/Gerät/Waage) brauchen den Server und laufen erst
    // beim Flush — hier wird nichts gestartet.
    async function captureOffline(): Promise<void> {
      try {
        const exifTime = await readClientExifTime(file);
        const id = await putBlob({ blob: compressed, filename: compressed.name, clientExifTime: exifTime });
        const token = offlineBlobToken(id);
        setImageUrl(token);
        imageUrlRef.current = token;
        setImageExifTime(exifTime ?? "");
        setUploading(false);
      } catch {
        // IndexedDB nicht verfügbar (Privatfenster o.ä.) → kein stiller Verlust: als Fehler zeigen.
        abortUpload();
      }
    }

    if (enableOfflineCapture && typeof navigator !== "undefined" && !navigator.onLine) {
      await captureOffline();
      return;
    }

    let result: { url: string; exifTime: string | null } | null;
    try {
      result = await uploadPhoto(compressed, clientExifTime);
    } catch {
      // Netz-/Zeitlimit-Fehler beim Upload. Queue-fähig → offline zwischenspeichern statt das Foto zu
      // verlieren (der Eintrag wandert ohnehin über die Warteschlange). Sonst das bisherige Verhalten.
      if (enableOfflineCapture) { await captureOffline(); return; }
      abortUpload();
      return;
    }

    if (!result) {
      // Server erreichbar, hat die Datei aber ABGELEHNT (z.B. zu gross, falscher Typ) — ein echter
      // Fehler, kein Netzproblem: nicht offline zwischenspeichern, sondern melden.
      abortUpload();
      return;
    }

    setImageUrl(result.url);
    imageUrlRef.current = result.url;
    // Keep blob URL for preview — server URL requires an existing entry for ownership check
    setImageExifTime(result.exifTime ?? "");

    // EXIF time validation
    if (exifWarningText) {
      if (result.exifTime && startTime) {
        const diff = Math.abs(new Date(result.exifTime).getTime() - new Date(startTime).getTime());
        if (diff > 3600000) {
          setExifWarning(exifWarningText("deviation", Math.round(diff / 3600000)));
        }
      } else if (!result.exifTime) {
        setExifWarning(exifWarningText("missing"));
      }
    }
    setUploading(false);

    await Promise.all([
      enableSealDetection ? runSealDetection(result.url, 0) : Promise.resolve(),
      enableDeviceDetection ? runDeviceDetection(result.url) : Promise.resolve(),
      enableScaleDetection ? runScaleDetection(result.url, 0) : Promise.resolve(),
    ]);
  }, [startTime, exifWarningText, uploadErrorText, enableSealDetection, enableDeviceDetection, enableScaleDetection, enableOfflineCapture, runSealDetection, runDeviceDetection, runScaleDetection]);

  // Die VORSCHLAG-Erkennungen nach einem Drehen neu feuern (Siegel bzw. Waage). Ein Offline-Marker ist
  // keine echte URL — dann liefe die Server-Erkennung ins Leere, also übersprungen. EIN Ort für beide
  // Dreh-Richtungen, statt der viermal wiederholten Bedingung.
  const runRotationDetections = useCallback((rot: Rotation) => {
    const url = imageUrlRef.current;
    if (!url || isOfflineBlobUrl(url)) return;
    if (enableSealDetection) runSealDetection(url, rot);
    if (enableScaleDetection) runScaleDetection(url, rot);
  }, [enableSealDetection, runSealDetection, enableScaleDetection, runScaleDetection]);

  const rotateLeft = useCallback(() => {
    setRotation(prev => {
      const next = ((prev - 90 + 360) % 360) as Rotation;
      runRotationDetections(next);
      return next;
    });
  }, [runRotationDetections]);

  const rotateRight = useCallback(() => {
    setRotation(prev => {
      const next = ((prev + 90) % 360) as Rotation;
      runRotationDetections(next);
      return next;
    });
  }, [runRotationDetections]);

  const clearPhoto = useCallback(() => {
    if (blobUrlRef.current) { URL.revokeObjectURL(blobUrlRef.current); blobUrlRef.current = null; }
    setImageUrl("");
    setImagePreview("");
    setImageExifTime("");
    setExifWarning("");
    setUploadError("");
    setSealState("idle");
    setScaleState("idle");
    setScaleKg(null);
    setDeviceDetectionState("idle");
    setDeviceSuggestion(null);
    setRotation(0);
  }, []);

  return {
    imageUrl, setImageUrl,
    imageExifTime, setImageExifTime,
    imagePreview, setImagePreview,
    uploading,
    exifWarning, setExifWarning,
    uploadError, setUploadError,
    sealNumber, setSealNumber,
    sealState, setSealState,
    scaleKg, setScaleKg,
    scaleState, setScaleState,
    deviceSuggestion, setDeviceSuggestion,
    deviceDetectionState, setDeviceDetectionState,
    rotation, rotateLeft, rotateRight,
    handleFile,
    clearPhoto,
  };
}
