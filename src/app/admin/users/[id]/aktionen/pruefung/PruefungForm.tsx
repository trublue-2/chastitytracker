"use client";

import { useRef, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ClipboardCheck } from "lucide-react";
import { toDatetimeLocal } from "@/lib/utils";
import { useTranslations } from "next-intl";
import { usePhotoUpload } from "@/app/hooks/usePhotoUpload";
import Card from "@/app/components/Card";
import Input from "@/app/components/Input";
import Button from "@/app/components/Button";
import FormError from "@/app/components/FormError";
import Spinner from "@/app/components/Spinner";
import Textarea from "@/app/components/Textarea";
import ImageViewer from "@/app/components/ImageViewer";
import PhotoCapture from "@/app/components/PhotoCapture";

export default function PruefungForm({ userId }: { userId: string }) {
  const t = useTranslations("admin");
  const tInspection = useTranslations("inspectionForm");
  const tc = useTranslations("common");
  const router = useRouter();

  const [startTime, setStartTime] = useState(() => toDatetimeLocal(new Date()));
  const [note, setNote] = useState("");
  const [kontrollCode, setKontrollCode] = useState("");
  const [saving, setSaving] = useState(false);
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
      type === "deviation" ? tc("exifDeviation", { hours: hours ?? 0 }) : tc("exifMissing"),
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
    if (!imageUrl) { setError(tInspection("photoRequired")); return; }
    setSaving(true);
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
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "var(--color-inspect-bg)" }}>
            <ClipboardCheck size={20} strokeWidth={2} style={{ color: "var(--color-inspect)" }} />
          </div>
          <h1 className="text-base font-semibold text-foreground">{tInspection("title")}</h1>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5 px-5 py-5">
          <Input
            label={tc("dateTimeRequired")}
            type="datetime-local"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            required
          />

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-foreground-muted">
              {tc("photo")} <span className="text-warn">*</span>{" "}
              <span className="text-foreground-faint normal-case font-normal">({tc("photoMandatory")})</span>
            </label>
            {imagePreview ? (
              <div className="flex items-start gap-4">
                <ImageViewer src={imagePreview} alt={tc("preview")} width={80} height={80} className="w-20 h-20 rounded-xl object-cover flex-shrink-0" />
                <div className="flex flex-col gap-2 flex-1 pt-1">
                  {imageExifTime && <p className="text-xs text-foreground-faint">EXIF: {new Date(imageExifTime).toLocaleString()}</p>}
                  {exifWarning && !uploading && <p className="text-xs text-[var(--color-warn)] font-medium">⚠ {exifWarning}</p>}
                  <PhotoCapture onFile={handleFile} uploading={uploading} variant="orange" compact />
                  <button type="button" onClick={() => { clearPhoto(); setVerifyStatus(null); setAiMatch(null); }}
                    className="text-xs text-warn hover:opacity-80 w-fit transition">
                    {tc("removePhoto")}
                  </button>
                </div>
              </div>
            ) : (
              <PhotoCapture onFile={handleFile} uploading={uploading} variant="orange" />
            )}
          </div>

          {verifyStatus === "pending" && (
            <p className="text-sm text-foreground-muted flex items-center gap-2">
              <Spinner size="sm" /> {tInspection("verifying")}
            </p>
          )}
          {verifyStatus === "match" && (
            <p className="text-sm text-[var(--color-ok)] font-medium">{tInspection("codeMatch")}</p>
          )}
          {verifyStatus === "policy" && (
            <div className="bg-surface-raised border border-border rounded-xl px-4 py-3">
              <p className="text-sm text-foreground-muted font-medium">{tInspection("policyError")}</p>
              <p className="text-xs text-foreground-faint mt-0.5">{tInspection("policyErrorHint")}</p>
            </div>
          )}
          {verifyStatus === "mismatch" && (
            <div className="bg-warn-bg border border-[var(--color-warn-border)] rounded-xl px-4 py-3">
              <p className="text-sm text-[var(--color-warn-text)] font-medium">{tInspection("codeMismatch")}</p>
              {verifyReason && <p className="text-xs text-[var(--color-warn)] mt-0.5">{verifyReason}</p>}
              <p className="text-xs text-[var(--color-warn)] mt-1">{tInspection("codeMismatchHint")}</p>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-foreground-muted">
              {tInspection("controlCode")}{" "}
              <span className="text-[var(--color-inspect)] normal-case font-normal">({tInspection("controlCodeHint")})</span>
            </label>
            <input
              type="text"
              value={kontrollCode}
              onChange={(e) => { setKontrollCode(e.target.value.replace(/\D/g, "").slice(0, 8)); setVerifyStatus(null); setAiMatch(null); }}
              maxLength={8}
              placeholder="–"
              className="w-full rounded-lg border border-border px-3 py-2 text-foreground bg-surface-raised focus:outline-none focus-visible:outline-2 focus-visible:outline-focus-ring font-mono tracking-widest text-[var(--color-inspect)] font-bold text-xl"
            />
          </div>

          <Textarea
            label={tc("noteOptional")}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
          />

          <FormError message={error || null} />

          <div className="flex flex-col-reverse sm:flex-row gap-3">
            <Button type="button" variant="secondary" fullWidth onClick={() => router.push(`/admin/users/${userId}/aktionen`)}>
              {tc("cancel")}
            </Button>
            <Button type="submit" variant="primary" fullWidth loading={saving || uploading} icon={<ClipboardCheck size={16} />}>
              {tInspection("saveBtn")}
            </Button>
          </div>
        </form>
      </Card>
    </main>
  );
}
