"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, RotateCcw, RotateCw } from "lucide-react";
import { toDatetimeLocal } from "@/lib/utils";
import { useTranslations } from "next-intl";
import { usePhotoUpload } from "@/app/hooks/usePhotoUpload";
import AdminActionFormShell from "@/app/components/AdminActionFormShell";
import DateTimePicker from "@/app/components/DateTimePicker";
import Button from "@/app/components/Button";
import FormError from "@/app/components/FormError";
import Textarea from "@/app/components/Textarea";
import PhotoCapture from "@/app/components/PhotoCapture";

export default function VerschlussForm({ userId }: { userId: string }) {
  const t = useTranslations("admin");
  const tLock = useTranslations("lockForm");
  const tc = useTranslations("common");
  const router = useRouter();
  const [startTime, setStartTime] = useState(() => toDatetimeLocal(new Date()));
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const {
    imageUrl, imageExifTime, imagePreview, uploading,
    sealNumber, setSealNumber, sealState, setSealState,
    rotation, rotateLeft, rotateRight,
    handleFile, clearPhoto,
  } = usePhotoUpload({
    startTime,
    enableSealDetection: true,
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    const res = await fetch("/api/admin/entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId,
        type: "VERSCHLUSS",
        startTime: new Date(startTime).toISOString(),
        note: note.trim() || undefined,
        imageUrl: imageUrl || undefined,
        imageExifTime: imageExifTime || undefined,
        kontrollCode: sealNumber.trim() || undefined,
      }),
    });
    setSaving(false);
    if (res.ok) {
      router.push(`/admin/users/${userId}/aktionen`);
    } else {
      const d = await res.json();
      setError(d.error || tc("error"));
    }
  }

  return (
    <AdminActionFormShell
      userId={userId}
      backLabel={t("aktionen")}
      icon={<Lock size={20} strokeWidth={2} />}
      iconBg="var(--color-lock-bg)"
      iconColor="var(--color-lock)"
      title={tLock("title")}
    >
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-5 py-5">
          <DateTimePicker
            label={tc("dateTime")}
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            required
          />

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-foreground-muted">{tc("photoOptional")}</label>
            {imagePreview ? (
              <div className="flex items-start gap-4">
                <div className="flex flex-col items-center gap-1.5 flex-shrink-0">
                  <div className="w-20 h-20 rounded-xl overflow-hidden" style={{ transform: `rotate(${rotation}deg)`, transition: "transform 0.2s ease" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={imagePreview} alt={tc("preview")} className="w-full h-full object-cover" />
                  </div>
                  <div className="flex gap-1">
                    <button type="button" onClick={rotateLeft}
                      className="p-1.5 rounded-lg text-foreground-muted hover:text-foreground active:text-foreground transition-colors"
                      aria-label={tc("rotateLeft")}>
                      <RotateCcw size={14} />
                    </button>
                    <button type="button" onClick={rotateRight}
                      className="p-1.5 rounded-lg text-foreground-muted hover:text-foreground active:text-foreground transition-colors"
                      aria-label={tc("rotateRight")}>
                      <RotateCw size={14} />
                    </button>
                  </div>
                </div>
                <div className="flex flex-col gap-2 flex-1 pt-1">
                  {imageExifTime && (
                    <p className="text-xs text-foreground-faint">{tc("exifDate")}: {new Date(imageExifTime).toLocaleString()}</p>
                  )}
                  <PhotoCapture onFile={handleFile} uploading={uploading} variant="emerald" compact />
                  <button type="button" onClick={clearPhoto}
                    className="text-xs text-warn hover:opacity-80 w-fit transition">
                    {tc("removePhoto")}
                  </button>
                </div>
              </div>
            ) : (
              <PhotoCapture onFile={handleFile} uploading={uploading} variant="emerald" />
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-foreground-muted">{tLock("sealNumber")}</label>
            <input
              type="text"
              inputMode="numeric"
              pattern="\d{5,8}"
              maxLength={8}
              value={sealNumber}
              onChange={(e) => { setSealNumber(e.target.value.replace(/\D/g, "")); setSealState("idle"); }}
              placeholder={tLock("sealNumberHint")}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm text-foreground bg-surface-raised placeholder:text-foreground-faint focus:outline-none focus-visible:outline-2 focus-visible:outline-focus-ring"
            />
            {sealState === "detecting" && <p className="text-xs text-foreground-faint">{tLock("sealDetecting")}</p>}
            {sealState === "detected" && <p className="text-xs text-[var(--color-lock)]">{tLock("sealDetected", { code: sealNumber })}</p>}
            {sealState === "not-detected" && !sealNumber && <p className="text-xs text-foreground-faint">{tLock("sealNotDetected")}</p>}
          </div>

          <Textarea
            label={tc("noteOptional")}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={tc("note")}
            rows={2}
          />

          <FormError message={error || null} />

          <Button type="submit" variant="primary" fullWidth loading={saving || uploading} icon={<Lock size={16} />}>
            {tLock("saveBtn")}
          </Button>
        </form>
    </AdminActionFormShell>
  );
}
