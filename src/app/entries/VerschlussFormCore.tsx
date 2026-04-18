"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Lock } from "lucide-react";
import { toDatetimeLocal, toDateLocale } from "@/lib/utils";
import { usePhotoUpload } from "@/app/hooks/usePhotoUpload";
import PhotoCapture from "@/app/components/PhotoCapture";
import RotatableImagePreview from "@/app/components/RotatableImagePreview";
import FormError from "@/app/components/FormError";
import RequiredHint from "@/app/components/RequiredHint";
import FormField from "@/app/components/FormField";
import DateTimePicker from "@/app/components/DateTimePicker";
import Input from "@/app/components/Input";
import Textarea from "@/app/components/Textarea";
import Button from "@/app/components/Button";
import Select from "@/app/components/Select";
import Card from "@/app/components/Card";
import type { DeviceOption } from "@/lib/queries";
import type { SubmitResult } from "./OrgasmusFormCore";

export type { SubmitResult } from "./OrgasmusFormCore";

export interface VerschlussPayload {
  type: "VERSCHLUSS";
  startTime: string;
  imageUrl: string | null;
  imageExifTime: string | null;
  note: string | null;
  kontrollCode: string | null;
  deviceId: string | null;
}

interface Props {
  initial?: {
    startTime: string;
    imageUrl?: string | null;
    imageExifTime?: string | null;
    note?: string | null;
    kontrollCode?: string | null;
    deviceId?: string | null;
  };
  minTime?: string;
  mobileDesktopMode?: boolean;
  devices?: DeviceOption[];
  /** Device ID requested by keyholder via VerschlussAnforderung */
  anforderungDeviceId?: string | null;
  isEdit?: boolean;
  submitFn: (payload: VerschlussPayload) => Promise<SubmitResult>;
  onCancel?: () => void;
  submitVariant?: "semantic" | "primary";
  submitLabel?: string;
}

export default function VerschlussFormCore({
  initial, minTime, mobileDesktopMode, devices = [], anforderungDeviceId,
  isEdit = false, submitFn, onCancel, submitVariant = "semantic", submitLabel,
}: Props) {
  const t = useTranslations("common");
  const tForm = useTranslations("lockForm");
  const dl = toDateLocale(useLocale());

  const [startTime, setStartTime] = useState(toDatetimeLocal(initial?.startTime) || toDatetimeLocal(new Date()));
  const [note, setNote] = useState(initial?.note ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Device selection: anforderung wins, else auto-pick single device, else initial value, else empty
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
      const result = await submitFn({
        type: "VERSCHLUSS",
        startTime: new Date(startTime).toISOString(),
        imageUrl: imageUrl || null,
        imageExifTime: imageExifTime || null,
        note: note.trim() || null,
        kontrollCode: sealNumber.trim() || null,
        deviceId: deviceId || null,
      });
      if ("error" in result && !result.ok) setError(result.error);
    } catch {
      setError(t("networkError"));
    } finally {
      setSaving(false);
    }
  }

  const defaultLabel = isEdit ? t("update") : tForm("saveBtn");

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <RequiredHint />

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

      <FormField label={t("photoOptional")}>
        {imagePreview ? (
          <div className="flex items-start gap-4">
            <RotatableImagePreview src={imagePreview} rotation={rotation} onRotateLeft={rotateLeft} onRotateRight={rotateRight} />
            <div className="flex flex-col gap-2 flex-1 pt-1">
              {imageExifTime && (
                <p className="text-xs text-foreground-faint">{t("exifDate")}: {new Date(imageExifTime).toLocaleString(dl)}</p>
              )}
              {exifWarning && !uploading && (
                <p className="text-xs text-warn font-medium">{exifWarning}</p>
              )}
              <PhotoCapture onFile={handleFile} uploading={uploading} variant="emerald" compact mobileDesktopMode={mobileDesktopMode} />
              <button type="button" onClick={clearPhoto} className="text-xs text-warn hover:opacity-80 w-fit transition">
                {t("removePhoto")}
              </button>
            </div>
          </div>
        ) : (
          <PhotoCapture onFile={handleFile} uploading={uploading} variant="emerald" mobileDesktopMode={mobileDesktopMode} />
        )}
      </FormField>

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
        {sealState === "detecting" && <p className="text-xs text-foreground-faint">{tForm("sealDetecting")}</p>}
        {sealState === "detected" && <p className="text-xs text-lock">{tForm("sealDetected", { code: sealNumber })}</p>}
        {sealState === "not-detected" && !sealNumber && <p className="text-xs text-foreground-faint">{tForm("sealNotDetected")}</p>}
      </div>

      <Textarea
        label={t("noteOptional")}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={3}
      />

      <FormError message={error} />

      <div className="flex flex-col-reverse sm:flex-row gap-3 pt-1">
        {onCancel && (
          <Button type="button" variant="secondary" fullWidth onClick={onCancel}>
            {t("cancel")}
          </Button>
        )}
        <Button
          type="submit"
          variant={submitVariant}
          semantic={submitVariant === "semantic" ? "lock" : undefined}
          fullWidth
          loading={saving || uploading}
          icon={submitVariant === "primary" ? <Lock size={16} /> : undefined}
        >
          {submitLabel ?? defaultLabel}
        </Button>
      </div>
    </form>
  );
}
