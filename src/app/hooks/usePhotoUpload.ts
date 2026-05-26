"use client";

import { useState, useCallback, useRef } from "react";
import { compressImage } from "@/lib/compressImage";
import type { Rotation } from "@/lib/constants";

export type SealState = "idle" | "detecting" | "detected" | "not-detected";
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
  const blobUrlRef = useRef<string | null>(null);
  // Ref so rotate callbacks always see the latest imageUrl without stale closure
  const imageUrlRef = useRef(imageUrl);
  imageUrlRef.current = imageUrl;

  const runDeviceDetection = useCallback(async (url: string) => {
    setDeviceDetectionState("detecting");
    setDeviceSuggestion(null);
    try {
      const res = await fetch("/api/detect-device", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl: url }),
      });
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

  const runSealDetection = useCallback(async (url: string, rot: Rotation) => {
    setSealState("detecting");
    try {
      const detectRes = await fetch("/api/detect-seal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl: url, rotation: rot }),
      });
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

    let res: Response;
    try {
      const fd = new FormData();
      fd.append("file", compressed);
      if (clientExifTime) fd.append("clientExifTime", clientExifTime);
      res = await fetch("/api/upload", { method: "POST", body: fd });
    } catch {
      abortUpload();
      return;
    }

    if (!res.ok) {
      abortUpload();
      return;
    }

    const data = await res.json() as { url: string; exifTime?: string };

    setImageUrl(data.url);
    imageUrlRef.current = data.url;
    // Keep blob URL for preview — server URL requires an existing entry for ownership check
    setImageExifTime(data.exifTime ?? "");

    // EXIF time validation
    if (exifWarningText) {
      if (data.exifTime && startTime) {
        const diff = Math.abs(new Date(data.exifTime).getTime() - new Date(startTime).getTime());
        if (diff > 3600000) {
          setExifWarning(exifWarningText("deviation", Math.round(diff / 3600000)));
        }
      } else if (!data.exifTime) {
        setExifWarning(exifWarningText("missing"));
      }
    }
    setUploading(false);

    await Promise.all([
      enableSealDetection ? runSealDetection(data.url, 0) : Promise.resolve(),
      enableDeviceDetection ? runDeviceDetection(data.url) : Promise.resolve(),
    ]);
  }, [startTime, exifWarningText, uploadErrorText, enableSealDetection, enableDeviceDetection, runSealDetection, runDeviceDetection]);

  const rotateLeft = useCallback(() => {
    setRotation(prev => {
      const next = ((prev - 90 + 360) % 360) as Rotation;
      if (enableSealDetection && imageUrlRef.current) {
        runSealDetection(imageUrlRef.current, next);
      }
      return next;
    });
  }, [enableSealDetection, runSealDetection]);

  const rotateRight = useCallback(() => {
    setRotation(prev => {
      const next = ((prev + 90) % 360) as Rotation;
      if (enableSealDetection && imageUrlRef.current) {
        runSealDetection(imageUrlRef.current, next);
      }
      return next;
    });
  }, [enableSealDetection, runSealDetection]);

  const clearPhoto = useCallback(() => {
    if (blobUrlRef.current) { URL.revokeObjectURL(blobUrlRef.current); blobUrlRef.current = null; }
    setImageUrl("");
    setImagePreview("");
    setImageExifTime("");
    setExifWarning("");
    setUploadError("");
    setSealState("idle");
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
    deviceSuggestion, setDeviceSuggestion,
    deviceDetectionState, setDeviceDetectionState,
    rotation, rotateLeft, rotateRight,
    handleFile,
    clearPhoto,
  };
}
