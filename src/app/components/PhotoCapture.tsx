"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { Camera, X, SwitchCamera, FolderOpen, Loader2 } from "lucide-react";
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
  /** If provided, renders children as trigger instead of the default dashed button */
  children?: React.ReactNode;
}

export default function PhotoCapture({ onFile, uploading, variant = "emerald", children }: Props) {
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

  const accentBorder = variant === "orange" ? "border-orange-200 hover:border-orange-300 hover:bg-orange-50 text-orange-400" : "border-gray-200 hover:border-gray-300 hover:bg-gray-50 text-gray-400";

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const startStream = useCallback(async (deviceId?: string) => {
    stopStream();
    setCamError(null);
    try {
      const constraints: MediaStreamConstraints = {
        video: deviceId ? { deviceId: { exact: deviceId } } : { facingMode: "environment" },
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      // After first permission grant, enumerate labeled devices
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

  async function openModal() {
    if (!navigator.mediaDevices?.getUserMedia) {
      fileRef.current?.click();
      return;
    }
    setModalOpen(true);
  }

  useEffect(() => {
    if (modalOpen) {
      startStream(selectedDeviceId || undefined);
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
    if (file) {
      if (modalOpen) closeModal();
      onFile(file);
    }
    e.target.value = "";
  }

  return (
    <>
      {/* Hidden file input — no capture attr so desktop shows file picker */}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Trigger */}
      {children ? (
        <span onClick={openModal} style={{ cursor: "pointer" }}>{children}</span>
      ) : (
        <button
          type="button"
          onClick={openModal}
          disabled={uploading}
          className={`w-full flex flex-col items-center gap-2 border-2 border-dashed rounded-xl py-8 disabled:opacity-50 transition ${accentBorder}`}
        >
          {uploading ? <Loader2 size={28} className="animate-spin" /> : <Camera size={28} />}
          <span className="text-sm font-medium">
            {uploading ? t("uploading") : t("takePhoto")}
          </span>
        </button>
      )}

      {/* Webcam modal */}
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
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
                  <SwitchCamera size={14} className="text-gray-400" />
                  {t("selectCamera")}
                </span>
              )}
              <button
                type="button"
                onClick={closeModal}
                className="text-gray-400 hover:text-gray-600 transition p-1"
              >
                <X size={20} />
              </button>
            </div>

            {/* Video preview */}
            <div className="relative bg-black aspect-[4/3] w-full">
              {camError ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-white gap-2">
                  <Camera size={32} className="opacity-40" />
                  <p className="text-sm opacity-60">{camError}</p>
                </div>
              ) : (
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
              )}
            </div>

            {/* Canvas (hidden, used for capture) */}
            <canvas ref={canvasRef} className="hidden" />

            {/* Actions */}
            <div className="flex gap-3 p-4">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="flex items-center gap-1.5 text-sm text-gray-500 border border-gray-200 rounded-xl px-4 py-2.5 hover:bg-gray-50 transition"
              >
                <FolderOpen size={15} />
                {t("chooseFile")}
              </button>
              <button
                type="button"
                onClick={capturePhoto}
                disabled={!!camError || capturing}
                className="flex-1 flex items-center justify-center gap-2 bg-gray-900 text-white font-semibold rounded-xl py-2.5 hover:bg-gray-700 disabled:opacity-40 transition"
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
