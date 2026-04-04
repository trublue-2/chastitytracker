"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { Camera, X, FolderOpen, Loader2, Flashlight, FlashlightOff } from "lucide-react";
import { useTranslations } from "next-intl";

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(true); // default true = safe for SSR
  useEffect(() => {
    setIsMobile(window.matchMedia("(pointer: coarse)").matches);
  }, []);
  return isMobile;
}

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
  /** when true, mobile behaves like desktop (file picker + webcam) */
  mobileDesktopMode?: boolean;
}

export default function PhotoCapture({ onFile, uploading, variant = "emerald", compact = false, mobileDesktopMode = false }: Props) {
  const t = useTranslations("common");
  const isMobile = useIsMobile();
  const showMobileUI = isMobile && !mobileDesktopMode;
  const fileRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [devices, setDevices] = useState<VideoDevice[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");
  const [capturing, setCapturing] = useState(false);
  const [camError, setCamError] = useState<string | null>(null);

  // Camera capabilities (Android Chrome only)
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [zoomAvailable, setZoomAvailable] = useState(false);
  const [zoomRange, setZoomRange] = useState<{ min: number; max: number; step: number }>({ min: 1, max: 1, step: 0.1 });
  const [zoomLevel, setZoomLevel] = useState(1);

  const accent = variant === "orange"
    ? { border: "border-[var(--color-inspect-border)] hover:border-[var(--color-inspect)] hover:bg-[var(--color-inspect-bg)]", icon: "text-[var(--color-inspect)]", text: "text-[var(--color-inspect)]" }
    : { border: "border-border hover:border-border-strong hover:bg-surface-raised", icon: "text-foreground-faint", text: "text-foreground-faint" };

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

      // Check camera capabilities (torch, zoom) — Android Chrome only
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        try {
          const caps = videoTrack.getCapabilities() as MediaTrackCapabilities & {
            torch?: boolean;
            zoom?: { min: number; max: number; step: number };
          };
          setTorchAvailable(!!caps.torch);
          if (caps.zoom && caps.zoom.max > caps.zoom.min) {
            setZoomAvailable(true);
            setZoomRange({ min: caps.zoom.min, max: caps.zoom.max, step: caps.zoom.step || 0.1 });
            setZoomLevel(caps.zoom.min);
          } else {
            setZoomAvailable(false);
          }
        } catch {
          setTorchAvailable(false);
          setZoomAvailable(false);
        }
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

  async function toggleTorch() {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const newState = !torchOn;
    try {
      await track.applyConstraints({ advanced: [{ torch: newState } as MediaTrackConstraintSet] });
      setTorchOn(newState);
    } catch { /* ignore — not supported */ }
  }

  async function handleZoomChange(value: number) {
    setZoomLevel(value);
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    try {
      await track.applyConstraints({ advanced: [{ zoom: value } as MediaTrackConstraintSet] });
    } catch { /* ignore */ }
  }

  function closeModal() {
    setModalOpen(false);
    stopStream();
    setDevices([]);
    setSelectedDeviceId("");
    setCamError(null);
    setTorchOn(false);
    setTorchAvailable(false);
    setZoomAvailable(false);
    setZoomLevel(1);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) onFile(file);
    e.target.value = "";
  }

  return (
    <>
      {/* Mobile: single file input with camera capture */}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        {...(showMobileUI ? { capture: "environment" } : {})}
        onChange={handleFileChange}
        className="hidden"
      />

      {showMobileUI ? (
        /* ── Mobile: single button, opens camera directly ── */
        compact ? (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="text-xs text-foreground-muted border border-border rounded-lg px-3 py-2 hover:bg-surface-raised disabled:opacity-50 transition flex items-center gap-1.5"
          >
            {uploading ? <Loader2 size={12} className="animate-spin" /> : <Camera size={12} />}
            {uploading ? t("loading") : t("replacePhoto")}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className={`w-full flex flex-col items-center gap-2 border-2 border-dashed rounded-xl py-8 disabled:opacity-50 transition ${accent.border}`}
          >
            {uploading ? <Loader2 size={28} className="animate-spin" /> : <Camera size={28} className={accent.icon} />}
            <span className={`text-sm font-medium ${accent.text}`}>{uploading ? t("uploading") : t("takePhoto")}</span>
          </button>
        )
      ) : compact ? (
        /* ── Desktop compact: two small inline buttons ── */
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="text-xs text-foreground-muted border border-border rounded-lg px-3 py-2 hover:bg-surface-raised disabled:opacity-50 transition flex items-center gap-1.5"
          >
            <FolderOpen size={12} />
            {t("replacePhoto")}
          </button>
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            disabled={uploading}
            className="text-xs text-foreground-muted border border-border rounded-lg px-3 py-2 hover:bg-surface-raised disabled:opacity-50 transition flex items-center gap-1.5"
          >
            <Camera size={12} />
            {t("webcam")}
          </button>
        </div>
      ) : (
        /* ── Desktop default: two side-by-side big buttons ── */
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
          <div className="bg-surface rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle">
              {devices.length > 1 ? (
                <select
                  value={selectedDeviceId}
                  onChange={(e) => handleDeviceChange(e.target.value)}
                  className="text-sm text-foreground-muted bg-surface-raised border border-border rounded-lg px-3 py-1.5 focus:outline-none"
                >
                  {devices.map((d) => (
                    <option key={d.deviceId} value={d.deviceId}>{d.label}</option>
                  ))}
                </select>
              ) : (
                <span className="text-sm font-medium text-foreground-muted">{t("selectCamera")}</span>
              )}
              <div className="flex items-center gap-1">
                {torchAvailable && (
                  <button
                    type="button"
                    onClick={toggleTorch}
                    className={`p-1.5 rounded-lg transition ${torchOn ? "bg-warn text-white" : "text-foreground-faint hover:text-foreground-muted"}`}
                    aria-label={torchOn ? t("torchOff") : t("torchOn")}
                  >
                    {torchOn ? <FlashlightOff size={18} /> : <Flashlight size={18} />}
                  </button>
                )}
                <button type="button" onClick={closeModal} className="text-foreground-faint hover:text-foreground-muted transition p-1">
                  <X size={20} />
                </button>
              </div>
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

            {/* Zoom slider (Android only — capabilities-based) */}
            {zoomAvailable && (
              <div className="px-4 pt-3 flex items-center gap-3">
                <span className="text-xs text-foreground-faint w-6 text-right">1x</span>
                <input
                  type="range"
                  min={zoomRange.min}
                  max={zoomRange.max}
                  step={zoomRange.step}
                  value={zoomLevel}
                  onChange={(e) => handleZoomChange(Number(e.target.value))}
                  className="flex-1 h-1 accent-foreground-muted"
                />
                <span className="text-xs text-foreground-faint w-8">{zoomLevel.toFixed(1)}x</span>
              </div>
            )}

            {/* Actions */}
            <div className="p-4">
              <button
                type="button"
                onClick={capturePhoto}
                disabled={!!camError || capturing}
                className="w-full flex items-center justify-center gap-2 bg-foreground text-background font-semibold rounded-xl py-3 hover:opacity-80 disabled:opacity-40 transition"
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
