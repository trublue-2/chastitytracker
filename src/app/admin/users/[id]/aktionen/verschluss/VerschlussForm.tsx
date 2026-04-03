"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Lock } from "lucide-react";
import { toDatetimeLocal } from "@/lib/utils";
import { useTranslations } from "next-intl";
import { usePhotoUpload } from "@/app/hooks/usePhotoUpload";
import Card from "@/app/components/Card";
import Input from "@/app/components/Input";
import Button from "@/app/components/Button";
import FormError from "@/app/components/FormError";
import Textarea from "@/app/components/Textarea";
import ImageViewer from "@/app/components/ImageViewer";
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
    <main className="w-full max-w-2xl mx-auto px-4 py-6 flex flex-col gap-4">
      <Link href={`/admin/users/${userId}/aktionen`} className="text-sm text-foreground-faint hover:text-foreground transition">
        ← {t("aktionen")}
      </Link>

      <Card padding="none" className="overflow-hidden">
        <div className="px-5 py-4 border-b border-border-subtle flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "var(--color-lock-bg)" }}>
            <Lock size={20} strokeWidth={2} style={{ color: "var(--color-lock)" }} />
          </div>
          <h1 className="text-base font-semibold text-foreground">{tLock("title")}</h1>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-5 py-5">
          <Input
            label={tc("dateTime")}
            type="datetime-local"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            required
          />

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-foreground-muted">{tc("photoOptional")}</label>
            {imagePreview ? (
              <div className="flex items-start gap-4">
                <ImageViewer src={imagePreview} alt={tc("preview")} width={80} height={80} className="w-20 h-20 rounded-xl object-cover" />
                <div className="flex flex-col gap-2 flex-1 pt-1">
                  {imageExifTime && (
                    <p className="text-xs text-foreground-faint">EXIF: {new Date(imageExifTime).toLocaleString()}</p>
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
      </Card>
    </main>
  );
}
