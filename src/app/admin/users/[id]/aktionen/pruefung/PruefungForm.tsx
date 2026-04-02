"use client";

import { useRef, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ClipboardCheck, Loader2 } from "lucide-react";
import { toDatetimeLocal } from "@/lib/utils";
import { usePhotoUpload } from "@/app/hooks/usePhotoUpload";
import ImageViewer from "@/app/components/ImageViewer";
import PhotoCapture from "@/app/components/PhotoCapture";

const inputCls = "w-full bg-surface-raised border border-border rounded-xl px-4 py-3.5 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-foreground-muted focus:border-transparent transition";

export default function PruefungForm({ userId }: { userId: string }) {
  const router = useRouter();

  const [startTime, setStartTime] = useState(() => toDatetimeLocal(new Date()));
  const [note, setNote] = useState("");
  const [kontrollCode, setKontrollCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [verifyStatus, setVerifyStatus] = useState<"pending" | "match" | "mismatch" | "error" | "policy" | null>(null);
  const [verifyReason, setVerifyReason] = useState<string | null>(null);
  const [aiMatch, setAiMatch] = useState<boolean | null>(null);
  const lastVerifiedKey = useRef<string>("");

  const {
    imageUrl, imageExifTime, imagePreview, uploading, exifWarning,
    handleFile: uploadFile, clearPhoto,
  } = usePhotoUpload({
    startTime,
    exifWarningText: (type, hours) =>
      type === "deviation" ? `EXIF-Zeit weicht ${hours}h ab` : "Foto enthält keine EXIF-Zeitangabe",
  });

  function handleFile(file: File) {
    setError("");
    setVerifyStatus(null);
    setVerifyReason(null);
    setAiMatch(null);
    uploadFile(file);
  }

  useEffect(() => {
    const key = `${kontrollCode}|${imageUrl}`;
    if (kontrollCode.length >= 5 && kontrollCode.length <= 8 && imageUrl && key !== lastVerifiedKey.current) {
      lastVerifiedKey.current = key;
      setVerifyStatus("pending");
      setVerifyReason(null);
      setAiMatch(null);
      fetch("/api/verify-kontrolle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl, expectedCode: kontrollCode }),
      })
        .then((r) => r.json())
        .then((v) => {
          if (v.error === "policy") {
            setVerifyStatus("policy");
          } else if (v.error) {
            setVerifyStatus("error");
          } else {
            setVerifyStatus(v.match ? "match" : "mismatch");
            setVerifyReason(v.reason ?? null);
            setAiMatch(v.match ? true : false);
          }
        })
        .catch(() => setVerifyStatus("error"));
    }
  }, [kontrollCode, imageUrl]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!imageUrl) { setError("Foto ist bei Kontrolle zwingend"); return; }
    setLoading(true);
    setError("");
    const res = await fetch("/api/admin/entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId,
        type: "PRUEFUNG",
        startTime: new Date(startTime).toISOString(),
        note: note.trim() || undefined,
        imageUrl: imageUrl || undefined,
        imageExifTime: imageExifTime || undefined,
        kontrollCode: kontrollCode || undefined,
        verifikationStatus: aiMatch === true ? "ai" : undefined,
      }),
    });
    setLoading(false);
    if (res.ok) {
      router.push(`/admin/users/${userId}/aktionen`);
    } else {
      const d = await res.json();
      setError(d.error || "Fehler");
    }
  }

  return (
    <main className="w-full max-w-3xl px-4 sm:px-6 py-6 flex flex-col gap-4">
      <Link href={`/admin/users/${userId}/aktionen`} className="text-sm text-foreground-faint hover:text-foreground transition">
        ← Aktionen
      </Link>

      <div className="bg-surface rounded-2xl border border-border overflow-hidden">
        <div className="px-5 py-4 border-b border-border-subtle flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "var(--color-inspect-bg)" }}>
            <ClipboardCheck size={20} strokeWidth={2} style={{ color: "var(--color-inspect)" }} />
          </div>
          <h1 className="text-base font-semibold text-foreground">Prüfung erfassen</h1>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5 px-5 py-5">
          {/* Datum / Zeit */}
          <div>
            <label className="block text-xs font-semibold text-foreground-faint uppercase tracking-wider mb-2">Datum / Zeit *</label>
            <input type="datetime-local" value={startTime} onChange={(e) => setStartTime(e.target.value)} required className={inputCls} />
          </div>

          {/* Foto (zwingend) */}
          <div>
            <label className="block text-xs font-semibold text-foreground-faint uppercase tracking-wider mb-2">
              Foto <span className="text-warn">*</span> <span className="text-foreground-faint normal-case font-normal">(zwingend)</span>
            </label>
            {imagePreview ? (
              <div className="flex items-start gap-4">
                <ImageViewer src={imagePreview} alt="Vorschau" width={80} height={80} className="w-20 h-20 rounded-xl object-cover flex-shrink-0" />
                <div className="flex flex-col gap-2 flex-1 pt-1">
                  {imageExifTime && <p className="text-xs text-foreground-faint">EXIF: {new Date(imageExifTime).toLocaleString()}</p>}
                  {exifWarning && !uploading && <p className="text-xs text-[var(--color-warn)] font-medium">⚠ {exifWarning}</p>}
                  <PhotoCapture onFile={handleFile} uploading={uploading} variant="orange" compact />
                  <button type="button" onClick={() => { clearPhoto(); setVerifyStatus(null); setAiMatch(null); }}
                    className="text-xs text-warn hover:opacity-80 w-fit transition">
                    Foto entfernen
                  </button>
                </div>
              </div>
            ) : (
              <PhotoCapture onFile={handleFile} uploading={uploading} variant="orange" />
            )}
          </div>

          {/* Verifikationsstatus */}
          {verifyStatus === "pending" && (
            <p className="text-sm text-foreground-muted flex items-center gap-2">
              <Loader2 size={14} className="animate-spin" /> Code wird im Bild geprüft…
            </p>
          )}
          {verifyStatus === "match" && (
            <p className="text-sm text-[var(--color-ok)] font-medium">✅ Code erkannt</p>
          )}
          {verifyStatus === "policy" && (
            <div className="bg-surface-raised border border-border rounded-xl px-4 py-3">
              <p className="text-sm text-foreground-muted font-medium">Bild konnte nicht geprüft werden</p>
              <p className="text-xs text-foreground-faint mt-0.5">Das Bild entspricht nicht den Inhaltsrichtlinien – kann trotzdem gespeichert werden.</p>
            </div>
          )}
          {verifyStatus === "mismatch" && (
            <div className="bg-warn-bg border border-[var(--color-warn-border)] rounded-xl px-4 py-3">
              <p className="text-sm text-[var(--color-warn-text)] font-medium">⚠ Code nicht erkannt</p>
              {verifyReason && <p className="text-xs text-[var(--color-warn)] mt-0.5">{verifyReason}</p>}
              <p className="text-xs text-[var(--color-warn)] mt-1">Code deutlich sichtbar im Foto zeigen – kann trotzdem gespeichert werden.</p>
            </div>
          )}

          {/* Kontroll-Code */}
          <div>
            <label className="block text-xs font-semibold text-foreground-faint uppercase tracking-wider mb-2">
              Kontroll-Code <span className="text-[var(--color-inspect)] normal-case font-normal">(muss im Foto erkennbar sein)</span>
            </label>
            <input
              type="text"
              value={kontrollCode}
              onChange={(e) => { setKontrollCode(e.target.value.replace(/\D/g, "").slice(0, 8)); setVerifyStatus(null); setAiMatch(null); }}
              maxLength={8}
              placeholder="–"
              className={`${inputCls} font-mono tracking-widest text-[var(--color-inspect)] font-bold text-xl`}
            />
          </div>

          {/* Notiz */}
          <div>
            <label className="block text-xs font-semibold text-foreground-faint uppercase tracking-wider mb-2">Notiz (optional)</label>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} className={`${inputCls} resize-none`} />
          </div>

          {error && <p className="text-sm text-warn bg-warn-bg border border-[var(--color-warn-border)] rounded-xl px-4 py-3">{error}</p>}

          <div className="flex flex-col-reverse sm:flex-row gap-3 pt-1">
            <button type="button" onClick={() => router.push(`/admin/users/${userId}/aktionen`)}
              className="flex-1 text-sm text-foreground-muted border border-border rounded-xl py-3.5 hover:bg-surface-raised active:scale-[0.98] transition-all">
              Abbrechen
            </button>
            <button type="submit" disabled={loading || uploading}
              className="flex-1 bg-[var(--color-inspect)] text-white text-base font-semibold py-3.5 rounded-xl flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.98] disabled:opacity-50 transition-all">
              {loading ? <Loader2 size={16} className="animate-spin" /> : <ClipboardCheck size={16} />}
              {loading ? "Sende…" : "Prüfung erfassen"}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
