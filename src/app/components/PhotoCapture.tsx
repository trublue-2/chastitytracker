"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { Camera, X, FolderOpen, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

interface VideoDevice {
  deviceId: string;
  label: string;
}

interface Props {
  onFile: (file: File) => void;
  uploading: boolean;
  /** "emerald" for Verschluss, "orange" for Pruefung */
  variant?: "emerald" | "orange";
  /** compact = small inline buttons for "replace photo" state */
  compact?: boolean;
}

export default function PhotoCapture({ onFile, uploading, variant = "emerald", compact = false }: Props) {
  const t = useTranslations("common");
  const fileRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [devices, setDevices] = useState<VideoDevice[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");
  const [capturing, setCapturing] = useState(false);
  const [camError, setCamError] = useState<string | null>(null);

  const accent = variant === "orange"
    ? { border: "border-orange-200 hover:border-orange-300 hover:bg-orange-50", icon: "text-orange-400", text: "text-orange-400" }
    : { border: "border-gray-200 hover:border-gray-300 hover:bg-gray-50", icon: "text-gray-400", text: "text-gray-400" };

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const startStream = useCallback(async (deviceId?: string) => {
    stopStream();
    setCamError(null);
    try {
      const constraints: MediaStreamConstraints = {
        video: deviceId ? { deviceId: { exact: deviceId } } : true,
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      const all = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = all
        .filter((d) => d.kind === "videoinput")
        .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Kamera ${i + 1}` }));
      setDevices(videoDevices);
      if (!deviceId && videoDevices.length > 0) {
        setSelectedDeviceId(videoDevices[0].deviceId);
      }
    } catch {
      setCamError(t("webcamNotAvailable"));
    }
  }, [stopStream, t]);

  useEffect(() => {
    if (modalOpen) {
      startStream(undefined);
    } else {
      stopStream();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modalOpen]);

  async function handleDeviceChange(deviceId: string) {
    setSelectedDeviceId(deviceId);
    await startStream(deviceId);
  }

  function capturePhoto() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    setCapturing(true);
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        setCapturing(false);
        if (!blob) return;
        const file = new File([blob], `webcam-${Date.now()}.jpg`, { type: "image/jpeg" });
        closeModal();
        onFile(file);
      },
      "image/jpeg",
      0.92
    );
  }

  function closeModal() {
    setModalOpen(false);
    stopStream();
    setDevices([]);
    setSelectedDeviceId("");
    setCamError(null);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) onFile(file);
    e.target.value = "";
  }

  return (
    <>
      <input ref={fileRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />

      {compact ? (
        /* ── Compact mode: small inline buttons for "replace" state ── */
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="text-xs text-gray-500 border border-gray-200 rounded-lg px-3 py-2 hover:bg-gray-50 disabled:opacity-50 transition flex items-center gap-1.5"
          >
            <FolderOpen size={12} />
            {t("replacePhoto")}
          </button>
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            disabled={uploading}
            className="text-xs text-gray-500 border border-gray-200 rounded-lg px-3 py-2 hover:bg-gray-50 disabled:opacity-50 transition flex items-center gap-1.5"
          >
            <Camera size={12} />
            {t("webcam")}
          </button>
        </div>
      ) : (
        /* ── Default mode: two side-by-side big buttons ── */
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className={`flex flex-col items-center gap-2 border-2 border-dashed rounded-xl py-7 disabled:opacity-50 transition ${accent.border}`}
          >
            {uploading ? <Loader2 size={24} className="animate-spin" /> : <FolderOpen size={24} className={accent.icon} />}
            <span className={`text-xs font-medium ${accent.text}`}>{t("chooseFile")}</span>
          </button>
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            disabled={uploading}
            className={`flex flex-col items-center gap-2 border-2 border-dashed rounded-xl py-7 disabled:opacity-50 transition ${accent.border}`}
          >
            <Camera size={24} className={accent.icon} />
            <span className={`text-xs font-medium ${accent.text}`}>{t("webcam")}</span>
          </button>
        </div>
      )}

      {/* ── Webcam modal ── */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="bg-white rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              {devices.length > 1 ? (
                <select
                  value={selectedDeviceId}
                  onChange={(e) => handleDeviceChange(e.target.value)}
                  className="text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none"
                >
                  {devices.map((d) => (
                    <option key={d.deviceId} value={d.deviceId}>{d.label}</option>
                  ))}
                </select>
              ) : (
                <span className="text-sm font-medium text-gray-700">{t("selectCamera")}</span>
              )}
              <button type="button" onClick={closeModal} className="text-gray-400 hover:text-gray-600 transition p-1">
                <X size={20} />
              </button>
            </div>

            {/* Video */}
            <div className="relative bg-black aspect-[4/3] w-full">
              {camError ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-white gap-2">
                  <Camera size={32} className="opacity-40" />
                  <p className="text-sm opacity-60">{camError}</p>
                </div>
              ) : (
                <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
              )}
            </div>

            <canvas ref={canvasRef} className="hidden" />

            {/* Actions */}
            <div className="p-4">
              <button
                type="button"
                onClick={capturePhoto}
                disabled={!!camError || capturing}
                className="w-full flex items-center justify-center gap-2 bg-gray-900 text-white font-semibold rounded-xl py-3 hover:bg-gray-700 disabled:opacity-40 transition"
              >
                {capturing ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />}
                {t("captureBtn")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
