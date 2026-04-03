"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toDatetimeLocal, toDateLocale } from "@/lib/utils";
import { usePhotoUpload } from "@/app/hooks/usePhotoUpload";
import ImageViewer from "@/app/components/ImageViewer";
import PhotoCapture from "@/app/components/PhotoCapture";
import { useTranslations, useLocale } from "next-intl";
import FormError from "@/app/components/FormError";
import FormField from "@/app/components/FormField";
import DateTimePicker from "@/app/components/DateTimePicker";
import Input from "@/app/components/Input";
import Textarea from "@/app/components/Textarea";
import Button from "@/app/components/Button";
import useToast from "@/app/hooks/useToast";

interface Props {
  initial?: {
    id: string;
    startTime: string;
    imageUrl?: string | null;
    imageExifTime?: string | null;
    note?: string | null;
    kontrollCode?: string | null;
  };
  mobileDesktopMode?: boolean;
  redirectTo?: string;
}

export default function VerschlussForm({ initial, mobileDesktopMode, redirectTo }: Props) {
  const t = useTranslations("common");
  const tForm = useTranslations("lockForm");
  const tDash = useTranslations("dashboard");
  const dl = toDateLocale(useLocale());
  const router = useRouter();
  const toast = useToast();
  const [startTime, setStartTime] = useState(
    toDatetimeLocal(initial?.startTime) || toDatetimeLocal(new Date())
  );
  const [note, setNote] = useState(initial?.note ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const {
    imageUrl, imageExifTime, imagePreview, uploading, exifWarning,
    sealNumber, setSealNumber, sealState, setSealState,
    handleFile, clearPhoto,
  } = usePhotoUpload({
    startTime,
    enableSealDetection: true,
    exifWarningText: (type, hours) =>
      type === "deviation" ? t("exifDeviation", { hours: hours ?? 0 }) : t("exifMissing"),
    initial,
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");

    try {
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
            kontrollCode: sealNumber.trim() || null,
          }),
        }
      );

      setSaving(false);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setError(err.error || t("savingError"));
        return;
      }
      toast.success(initial ? tDash("entryUpdated") : tDash("entrySaved"));
      router.push(redirectTo ?? "/dashboard");
    } catch {
      setSaving(false);
      setError(t("networkError"));
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <DateTimePicker
        label={t("dateTimeRequired")}
        value={startTime}
        onChange={(e) => setStartTime(e.target.value)}
        required
      />

      {/* Photo */}
      <FormField label={t("photoOptional")}>
        {imagePreview ? (
          <div className="flex items-start gap-4">
            <ImageViewer
              src={imagePreview}
              alt={t("preview")}
              width={80}
              height={80}
              className="w-20 h-20 rounded-xl object-cover"
            />
            <div className="flex flex-col gap-2 flex-1 pt-1">
              {imageExifTime && (
                <p className="text-xs text-foreground-faint">{t("exifDate")}: {new Date(imageExifTime).toLocaleString(dl)}</p>
              )}
              {exifWarning && !uploading && (
                <p className="text-xs text-warn font-medium">{exifWarning}</p>
              )}
              <PhotoCapture onFile={handleFile} uploading={uploading} variant="emerald" compact mobileDesktopMode={mobileDesktopMode} />
              <button type="button" onClick={clearPhoto}
                className="text-xs text-warn hover:opacity-80 w-fit transition">
                {t("removePhoto")}
              </button>
            </div>
          </div>
        ) : (
          <PhotoCapture onFile={handleFile} uploading={uploading} variant="emerald" mobileDesktopMode={mobileDesktopMode} />
        )}
      </FormField>

      {/* Seal number */}
      <div className="flex flex-col gap-1.5">
        <Input
          label={tForm("sealNumber")}
          type="text"
          inputMode="numeric"
          maxLength={8}
          value={sealNumber}
          onChange={(e) => { setSealNumber(e.target.value.replace(/\D/g, "")); setSealState("idle"); }}
          placeholder={tForm("sealNumberHint")}
          className="font-mono"
        />
        {sealState === "detecting" && (
          <p className="text-xs text-foreground-faint">{tForm("sealDetecting")}</p>
        )}
        {sealState === "detected" && (
          <p className="text-xs text-lock">{tForm("sealDetected", { code: sealNumber })}</p>
        )}
        {sealState === "not-detected" && !sealNumber && (
          <p className="text-xs text-foreground-faint">{tForm("sealNotDetected")}</p>
        )}
      </div>

      <Textarea
        label={t("noteOptional")}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={3}
      />

      <FormError message={error} />

      <div className="flex flex-col-reverse sm:flex-row gap-3 pt-1">
        <Button
          type="button"
          variant="secondary"
          fullWidth
          onClick={() => router.push("/dashboard")}
        >
          {t("cancel")}
        </Button>
        <Button
          type="submit"
          variant="semantic"
          semantic="lock"
          fullWidth
          loading={saving || uploading}
        >
          {initial ? t("update") : tForm("saveBtn")}
        </Button>
      </div>
    </form>
  );
}
