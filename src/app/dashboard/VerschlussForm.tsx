"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toDatetimeLocal, toDateLocale } from "@/lib/utils";
import { compressImage } from "@/lib/compressImage";
import ImageViewer from "@/app/components/ImageViewer";
import PhotoCapture from "@/app/components/PhotoCapture";
import { useTranslations, useLocale } from "next-intl";

interface Props {
  initial?: {
    id: string;
    startTime: string;
    imageUrl?: string | null;
    imageExifTime?: string | null;
    note?: string | null;
  };
  mobileDesktopMode?: boolean;
}

export default function VerschlussForm({ initial, mobileDesktopMode }: Props) {
  const t = useTranslations("common");
  const tForm = useTranslations("lockForm");
  const dl = toDateLocale(useLocale());
  const router = useRouter();
  const [startTime, setStartTime] = useState(
    toDatetimeLocal(initial?.startTime) || toDatetimeLocal(new Date())
  );
  const [note, setNote] = useState(initial?.note ?? "");
  const [imageUrl, setImageUrl] = useState(initial?.imageUrl ?? "");
  const [imageExifTime, setImageExifTime] = useState(initial?.imageExifTime ?? "");
  const [imagePreview, setImagePreview] = useState(initial?.imageUrl ?? "");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [exifWarning, setExifWarning] = useState("");

  async function handleFile(file: File) {
    setUploading(true);
    setExifWarning("");
    setImagePreview(URL.createObjectURL(file));

    // iOS Safari strips EXIF — read lastModified BEFORE compression (metadata stays intact)
    const clientExifTime = file.lastModified ? new Date(file.lastModified).toISOString() : null;

    const compressed = await compressImage(file).catch(() => file);

    const fd = new FormData();
    fd.append("file", compressed);
    if (clientExifTime) fd.append("clientExifTime", clientExifTime);
    const res = await fetch("/api/upload", { method: "POST", body: fd });
    const data = await res.json();

    setImageUrl(data.url);
    setImageExifTime(data.exifTime ?? "");

    if (data.exifTime && startTime) {
      const diff = Math.abs(new Date(data.exifTime).getTime() - new Date(startTime).getTime());
      if (diff > 3600000) {
        setExifWarning(t("exifDeviation", { hours: Math.round(diff / 3600000) }));
      }
    } else if (!data.exifTime) {
      setExifWarning(t("exifMissing"));
    }
    setUploading(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");

    const res = await fetch(
      initial ? `/api/entries/${initial.id}` : "/api/entries",
      {
        method: initial ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "VERSCHLUSS",
          startTime: new Date(startTime).toISOString(),
          imageUrl: imageUrl || null,
          imageExifTime: imageExifTime || null,
          note: note || null,
        }),
      }
    );

    setSaving(false);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setError(err.error || t("savingError"));
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      {/* Datum / Zeit */}
      <Field label={t("dateTimeRequired")}>
        <input
          type="datetime-local"
          value={startTime}
          onChange={(e) => setStartTime(e.target.value)}
          required
          className={inputCls}
        />
      </Field>

      {/* Foto */}
      <Field label={t("photoOptional")}>
        {imagePreview ? (
          <div className="flex items-start gap-4">
            <ImageViewer
              src={imagePreview}
              alt="Vorschau"
              width={80}
              height={80}
              className="w-20 h-20 rounded-xl object-cover"
            />
            <div className="flex flex-col gap-2 flex-1 pt-1">
              {imageExifTime && (
                <p className="text-xs text-foreground-faint">EXIF: {new Date(imageExifTime).toLocaleString(dl)}</p>
              )}
              {exifWarning && !uploading && (
                <p className="text-xs text-[var(--color-warn)] font-medium">⚠ {exifWarning}</p>
              )}
              <PhotoCapture onFile={handleFile} uploading={uploading} variant="emerald" compact mobileDesktopMode={mobileDesktopMode} />
              <button type="button" onClick={() => { setImageUrl(""); setImagePreview(""); setImageExifTime(""); setExifWarning(""); }}
                className="text-xs text-warn hover:opacity-80 w-fit transition">
                {t("removePhoto")}
              </button>
            </div>
          </div>
        ) : (
          <PhotoCapture onFile={handleFile} uploading={uploading} variant="emerald" mobileDesktopMode={mobileDesktopMode} />
        )}
      </Field>

      {/* Notiz */}
      <Field label={t("noteOptional")}>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          className={`${inputCls} resize-none`}
        />
      </Field>

      {error && <p className="text-sm text-warn bg-warn-bg border border-[var(--color-warn-border)] rounded-xl px-4 py-3">{error}</p>}

      <FormActions saving={saving || uploading} label={initial ? t("update") : tForm("saveBtn")} color="emerald" />
    </form>
  );
}

const inputCls = "w-full bg-surface-raised border border-border rounded-xl px-4 py-3.5 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-foreground-muted focus:border-transparent transition";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-foreground-faint uppercase tracking-wider mb-2">{label}</label>
      {children}
    </div>
  );
}

function FormActions({ saving, label, color }: { saving: boolean; label: string; color: "gray" | "emerald" }) {
  const t = useTranslations("common");
  const router = useRouter();
  const btnCls = color === "emerald"
    ? "bg-[var(--color-lock)] hover:opacity-90 text-white"
    : "bg-foreground hover:opacity-80 text-background";
  return (
    <div className="flex flex-col-reverse sm:flex-row gap-3 pt-1">
      <button type="button" onClick={() => router.push("/dashboard")}
        className="flex-1 text-sm text-foreground-muted border border-border rounded-xl py-3.5 hover:bg-surface-raised active:scale-[0.98] transition-all">
        {t("cancel")}
      </button>
      <button type="submit" disabled={saving}
        className={`flex-1 text-base font-semibold py-3.5 rounded-xl active:scale-[0.98] disabled:opacity-50 transition-all ${btnCls}`}>
        {saving ? t("saving") : label}
      </button>
    </div>
  );
}
