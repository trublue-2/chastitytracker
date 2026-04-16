"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import RotatableImagePreview from "@/app/components/RotatableImagePreview";
import { toDatetimeLocal, toDateLocale } from "@/lib/utils";
import { usePhotoUpload } from "@/app/hooks/usePhotoUpload";
import PhotoCapture from "@/app/components/PhotoCapture";
import { useTranslations, useLocale } from "next-intl";
import FormError from "@/app/components/FormError";
import RequiredHint from "@/app/components/RequiredHint";
import FormField from "@/app/components/FormField";
import DateTimePicker from "@/app/components/DateTimePicker";
import Input from "@/app/components/Input";
import Textarea from "@/app/components/Textarea";
import Button from "@/app/components/Button";
import Select from "@/app/components/Select";
import Card from "@/app/components/Card";
import useToast from "@/app/hooks/useToast";
import useOfflineQueue from "@/app/hooks/useOfflineQueue";
import type { DeviceOption } from "@/lib/queries";

interface Props {
  initial?: {
    id: string;
    startTime: string;
    imageUrl?: string | null;
    imageExifTime?: string | null;
    note?: string | null;
    kontrollCode?: string | null;
    deviceId?: string | null;
  };
  minTime?: string;
  mobileDesktopMode?: boolean;
  redirectTo?: string;
  /** Active (non-archived) devices for this user */
  devices?: DeviceOption[];
  /** Device ID requested by keyholder via VerschlussAnforderung */
  anforderungDeviceId?: string | null;
}

export default function VerschlussForm({ initial, minTime, mobileDesktopMode, redirectTo, devices = [], anforderungDeviceId }: Props) {
  const t = useTranslations("common");
  const tForm = useTranslations("lockForm");
  const tDash = useTranslations("dashboard");
  const dl = toDateLocale(useLocale());
  const router = useRouter();
  const toast = useToast();
  const { offlineFetch } = useOfflineQueue();
  const [startTime, setStartTime] = useState(
    toDatetimeLocal(initial?.startTime) || toDatetimeLocal(new Date())
  );
  const [note, setNote] = useState(initial?.note ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Device selection logic:
  // 0 devices → no selector, deviceId = null
  // 1 device → auto-selected (user can deselect)
  // ≥2 devices → dropdown, not pre-selected unless anforderung
  const defaultDeviceId = anforderungDeviceId
    ?? (devices.length === 1 ? devices[0].id : null)
    ?? initial?.deviceId
    ?? "";
  const [deviceId, setDeviceId] = useState(defaultDeviceId ?? "");
  const showDeviceSelector = devices.length > 0;
  const wrongDevice = anforderungDeviceId && deviceId && deviceId !== anforderungDeviceId;

  const {
    imageUrl, imageExifTime, imagePreview, uploading, exifWarning,
    sealNumber, setSealNumber, sealState, setSealState,
    rotation, rotateLeft, rotateRight,
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
      const url = initial ? `/api/entries/${initial.id}` : "/api/entries";
      const init: RequestInit = {
        method: initial ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "VERSCHLUSS",
          startTime: new Date(startTime).toISOString(),
          imageUrl: imageUrl || null,
          imageExifTime: imageExifTime || null,
          note: note || null,
          kontrollCode: sealNumber.trim() || null,
          deviceId: deviceId || null,
        }),
      };

      // Use offline-aware fetch for new entries (edits require online)
      const res = initial ? await fetch(url, init) : await offlineFetch(url, init);

      setSaving(false);

      // null = queued offline → navigate back
      if (res === null) {
        window.location.href = redirectTo ?? "/dashboard";
        return;
      }

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setError(err.error || t("savingError"));
        return;
      }
      toast.success(initial ? tDash("entryUpdated") : tDash("entrySaved"));
      // Full reload to update isLocked in layout (router.push doesn't re-render shared layouts)
      if (initial) {
        router.push(redirectTo ?? "/dashboard");
      } else {
        window.location.href = redirectTo ?? "/dashboard";
      }
    } catch {
      setSaving(false);
      setError(t("networkError"));
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <RequiredHint />

      {/* Device selector */}
      {showDeviceSelector && (
        <div className="flex flex-col gap-2">
          {anforderungDeviceId && (
            <Card variant="semantic" semantic="request">
              <p className="text-sm text-request-text font-medium">
                {tForm("requiredDevice", { name: devices.find((d) => d.id === anforderungDeviceId)?.name ?? "?" })}
              </p>
            </Card>
          )}
          <Select
            label={tForm("selectDevice")}
            options={[
              { value: "", label: tForm("noDevice") },
              ...devices.map((d) => ({ value: d.id, label: d.name })),
            ]}
            value={deviceId}
            onChange={(e) => setDeviceId(e.target.value)}
            hint={devices.length >= 2 && !anforderungDeviceId ? tForm("selectDeviceHint") : undefined}
          />
          {wrongDevice && (
            <p className="text-xs text-warn font-medium">{tForm("wrongDeviceWarning")}</p>
          )}
        </div>
      )}

      <DateTimePicker
        label={t("dateTime")}
        value={startTime}
        onChange={(e) => setStartTime(e.target.value)}
        required
        {...(minTime && { min: minTime })}
      />

      {/* Photo */}
      <FormField label={t("photoOptional")}>
        {imagePreview ? (
          <div className="flex items-start gap-4">
            <RotatableImagePreview
              src={imagePreview}
              rotation={rotation}
              onRotateLeft={rotateLeft}
              onRotateRight={rotateRight}
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
