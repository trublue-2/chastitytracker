"use client";

import { useState, useCallback, useRef } from "react";
import { compressImage } from "@/lib/compressImage";

export type SealState = "idle" | "detecting" | "detected" | "not-detected";

interface UsePhotoUploadOptions {
  /** Current startTime for EXIF time comparison. */
  startTime: string;
  /** Translate EXIF warnings. Return a display string. */
  exifWarningText?: (type: "deviation" | "missing", hours?: number) => string;
  /** Auto-detect seal number from photo (Verschluss only). Default false. */
  enableSealDetection?: boolean;
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
  enableSealDetection = false,
  initial,
}: UsePhotoUploadOptions) {
  const [imageUrl, setImageUrl] = useState(initial?.imageUrl ?? "");
  const [imageExifTime, setImageExifTime] = useState(initial?.imageExifTime ?? "");
  const [imagePreview, setImagePreview] = useState(initial?.imageUrl ?? "");
  const [uploading, setUploading] = useState(false);
  const [exifWarning, setExifWarning] = useState("");
  const [sealNumber, setSealNumber] = useState(initial?.kontrollCode ?? "");
  const [sealState, setSealState] = useState<SealState>("idle");
  const blobUrlRef = useRef<string | null>(null);

  const handleFile = useCallback(async (file: File) => {
    setUploading(true);
    setExifWarning("");
    if (enableSealDetection) setSealState("idle");
    if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
    const blobUrl = URL.createObjectURL(file);
    blobUrlRef.current = blobUrl;
    setImagePreview(blobUrl);

    // Read lastModified BEFORE compression (iOS Safari strips EXIF)
    const clientExifTime = file.lastModified ? new Date(file.lastModified).toISOString() : null;
    const compressed = await compressImage(file).catch(() => file);

    const fd = new FormData();
    fd.append("file", compressed);
    if (clientExifTime) fd.append("clientExifTime", clientExifTime);
    const res = await fetch("/api/upload", { method: "POST", body: fd });
    const data = await res.json();

    setImageUrl(data.url);
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

    // Seal detection (Verschluss forms only)
    if (enableSealDetection) {
      setSealState("detecting");
      try {
        const detectRes = await fetch("/api/detect-seal", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageUrl: data.url }),
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
    }
  }, [startTime, exifWarningText, enableSealDetection]);

  const clearPhoto = useCallback(() => {
    if (blobUrlRef.current) { URL.revokeObjectURL(blobUrlRef.current); blobUrlRef.current = null; }
    setImageUrl("");
    setImagePreview("");
    setImageExifTime("");
    setExifWarning("");
    setSealState("idle");
  }, []);

  return {
    imageUrl, setImageUrl,
    imageExifTime, setImageExifTime,
    imagePreview, setImagePreview,
    uploading,
    exifWarning, setExifWarning,
    sealNumber, setSealNumber,
    sealState, setSealState,
    handleFile,
    clearPhoto,
  };
}
