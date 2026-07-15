"use client";

import { useState, useEffect } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Lock } from "lucide-react";
import { toDatetimeLocal, fromDatetimeLocal, formatDateTime, toDateLocale } from "@/lib/utils";
import { usePhotoUpload } from "@/app/hooks/usePhotoUpload";
import { useEntrySubmit } from "@/app/hooks/useEntrySubmit";
import PhotoCapture from "@/app/components/PhotoCapture";
import RotatableImagePreview from "@/app/components/RotatableImagePreview";
import FormError from "@/app/components/FormError";
import RequiredHint from "@/app/components/RequiredHint";
import FormField from "@/app/components/FormField";
import DateTimePicker from "@/app/components/DateTimePicker";
import Input from "@/app/components/Input";
import Textarea from "@/app/components/Textarea";
import Button from "@/app/components/Button";
import EntryFormShell from "@/app/components/EntryFormShell";
import Select from "@/app/components/Select";
import Card from "@/app/components/Card";
import Toggle from "@/app/components/Toggle";
import type { DeviceOption } from "@/lib/queries";
import type { VerschlussPayload, SubmitResult } from "./types";

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
  tz: string;
  nowDefault: string;
  mobileDesktopMode?: boolean;
  devices?: DeviceOption[];
  /** Device ID requested by keyholder via VerschlussAnforderung */
  anforderungDeviceId?: string | null;
  /** Bildersafe-Instanz: zweiten, versiegelten Code-Foto-Schritt anzeigen. */
  bildersafe?: boolean;
  /** Box-User: „Schlüssel ist in der Box"-Bestätigung (ersetzt Bildersafe); Submit verlangt sie. */
  boxConfirm?: boolean;
  /** Name(n) der Box(en) — in der „Schlüssel in Box"-Bestätigung angezeigt. */
  boxName?: string;
  isEdit?: boolean;
  submitFn: (payload: VerschlussPayload) => Promise<SubmitResult>;
  onSuccess?: () => void;
  onCancel?: () => void;
  submitVariant?: "semantic" | "primary";
  submitLabel?: string;
}

export default function VerschlussFormCore({
  initial, minTime, tz, nowDefault, mobileDesktopMode, devices = [], anforderungDeviceId, bildersafe = false,
  boxConfirm = false, boxName,
  isEdit = false, submitFn, onSuccess, onCancel, submitVariant = "semantic", submitLabel,
}: Props) {
  const t = useTranslations("common");
  const tForm = useTranslations("lockForm");
  const dl = toDateLocale(useLocale());

  const [startTime, setStartTime] = useState(toDatetimeLocal(initial?.startTime, tz) || nowDefault);
  const [note, setNote] = useState(initial?.note ?? "");
  // Wahrheitsgemässe Angabe, KEIN Submit-Gate mehr: „nein" ist eine legitime Antwort (Schlüssel
  // reist mit) und darf das Speichern nicht blockieren. Default an = der Normalfall, und die Box
  // folgt dem Eintrag wie bisher; wer den Schlüssel behält, schaltet bewusst ab.
  const [keyInBox, setKeyInBox] = useState(true);

  // Device defaulting: anforderung > single-device auto-pick > initial > empty
  const defaultDeviceId = anforderungDeviceId
    ?? (devices.length === 1 ? devices[0].id : null)
    ?? initial?.deviceId
    ?? "";
  const [deviceId, setDeviceId] = useState(defaultDeviceId);
  const showDeviceSelector = devices.length > 0;
  const wrongDevice = Boolean(anforderungDeviceId && deviceId && deviceId !== anforderungDeviceId);

  const { saving, error, submit } = useEntrySubmit<VerschlussPayload>(submitFn, onSuccess);

  const {
    imageUrl, imageExifTime, imagePreview, uploading, exifWarning, uploadError,
    sealNumber, setSealNumber, sealState, setSealState,
    deviceSuggestion, deviceDetectionState,
    rotation, rotateLeft, rotateRight,
    handleFile, clearPhoto,
  } = usePhotoUpload({
    startTime,
    enableSealDetection: true,
    enableDeviceDetection: devices.length >= 2,
    exifWarningText: (type, hours) =>
      type === "deviation" ? t("exifDeviation", { hours: hours ?? 0 }) : t("exifMissing"),
    uploadErrorText: () => t("uploadError"),
    initial,
  });

  // Auto-apply device suggestion unless the user has already made an explicit choice
  // or there's a keyholder-mandated device. Track whether the user manually changed the selection.
  const [deviceManuallySet, setDeviceManuallySet] = useState(false);

  useEffect(() => {
    if (deviceSuggestion && !deviceManuallySet && !anforderungDeviceId) {
      setDeviceId(deviceSuggestion.deviceId);
    }
  }, [deviceSuggestion, deviceManuallySet, anforderungDeviceId]);

  // ── Bildersafe: zweites, versiegeltes Schlüsselbox-Code-Foto ──
  // Eigene Upload-Instanz OHNE Seal-/Device-Erkennung; Lesbarkeit wird separat geprüft (nur
  // boolean — die Zahl verlässt den Server nicht). Keine Vorschau für den Sub.
  const codePhoto = usePhotoUpload({
    startTime,
    enableSealDetection: false,
    enableDeviceDetection: false,
    uploadErrorText: () => t("uploadError"),
  });
  const [codeReadable, setCodeReadable] = useState<boolean | null>(null);
  const [codeChecking, setCodeChecking] = useState(false);
  const codeUrl = codePhoto.imageUrl;
  useEffect(() => {
    if (!bildersafe || !codeUrl) { setCodeReadable(null); return; }
    let cancelled = false;
    setCodeChecking(true);
    fetch("/api/detect-seal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageUrl: codeUrl, readableOnly: true, lockbox: true }),
    })
      .then((r) => (r.ok ? r.json() : { readable: null }))
      // true = lesbar · false = unlesbar · null = nicht geprüft (KI aus) → Versiegeln erlaubt
      .then(({ readable }) => { if (!cancelled) setCodeReadable(typeof readable === "boolean" ? readable : null); })
      .catch(() => { if (!cancelled) setCodeReadable(null); })
      .finally(() => { if (!cancelled) setCodeChecking(false); });
    return () => { cancelled = true; };
  }, [bildersafe, codeUrl]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await submit({
      type: "VERSCHLUSS",
      // Wahrheitsgemäss, nicht als Pflicht: der Verschluss ist real, auch wenn der Schlüssel
      // mitreist. Wer hier „nein" sagt, bekommt keine verriegelte leere Box — und die Keyholderin
      // keinen vorgetäuschten Hardware-Hold.
      ...(boxConfirm ? { keyInBox } : {}),
      startTime: fromDatetimeLocal(startTime, tz).toISOString(),
      imageUrl: imageUrl || null,
      imageExifTime: imageExifTime || null,
      note: note.trim() || null,
      kontrollCode: sealNumber.trim() || null,
      deviceId: deviceId || null,
      ...(bildersafe ? { codeImageUrl: codeUrl || null, codeReadable } : {}),
    });
  }

  const defaultLabel = isEdit ? t("update") : tForm("saveBtn");

  return (
    <EntryFormShell
      onSubmit={handleSubmit}
      onCancel={onCancel}
      cancelLabel={t("cancel")}
      actions={
        <Button
          type="submit"
          variant={submitVariant}
          semantic={submitVariant === "semantic" ? "lock" : undefined}
          fullWidth
          loading={saving || uploading || codePhoto.uploading}
          disabled={bildersafe && (!codeUrl || codeReadable === false)}
          icon={submitVariant === "primary" ? <Lock size={16} /> : undefined}
        >
          {submitLabel ?? defaultLabel}
        </Button>
      }
    >
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
            onChange={(e) => { setDeviceId(e.target.value); setDeviceManuallySet(true); }}
            hint={devices.length >= 2 && !anforderungDeviceId ? tForm("selectDeviceHint") : undefined}
          />
          {!deviceId && deviceDetectionState !== "detecting" && (
            <p className="text-xs text-warn font-medium">{tForm("noDeviceWarning")}</p>
          )}
          {deviceDetectionState === "detecting" && (
            <p className="text-xs text-foreground-faint">{tForm("deviceDetecting")}</p>
          )}
          {deviceDetectionState === "detected" && deviceSuggestion && (
            <p className="text-xs text-lock">{tForm("deviceDetected", { name: deviceSuggestion.deviceName })}</p>
          )}
          {deviceDetectionState === "not-detected" && (
            <p className="text-xs text-foreground-faint">{tForm("deviceNotDetected")}</p>
          )}
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
                <p className="text-xs text-foreground-faint">{t("exifDate")}: {formatDateTime(imageExifTime, dl, tz)}</p>
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
          <>
            <PhotoCapture onFile={handleFile} uploading={uploading} variant="emerald" mobileDesktopMode={mobileDesktopMode} />
            {uploadError && !uploading && <p className="text-xs text-warn font-medium mt-1">{uploadError}</p>}
          </>
        )}
      </FormField>

      {bildersafe && (
        <FormField label={tForm("codePhotoLabel")}>
          {codeUrl ? (
            // Ganze Fläche = neu aufnehmen.
            <button type="button" onClick={codePhoto.clearPhoto} className="text-left w-full">
              <Card variant="semantic" semantic={codeReadable === false ? "warn" : "sperrzeit"}>
                <div className="flex items-start gap-2.5">
                  <Lock size={16} className={`flex-shrink-0 mt-0.5 ${codeReadable === false ? "text-warn" : "text-sperrzeit"}`} />
                  <div className="text-xs flex-1">
                    <p className={`font-bold ${codeReadable === false ? "text-warn-text" : "text-sperrzeit-text"}`}>{tForm("codePhotoSealed")}</p>
                    <p className={`mt-0.5 ${codeReadable === false ? "text-warn" : "text-sperrzeit"}`}>
                      {codeChecking
                        ? tForm("codePhotoChecking")
                        : codeReadable === false
                          ? tForm("codePhotoUnreadable")
                          : codeReadable === true
                            ? tForm("codePhotoReadable")
                            : tForm("codePhotoNoCheck")}
                    </p>
                    <p className="text-foreground-faint mt-1.5 underline">{tForm("codePhotoRetake")}</p>
                  </div>
                </div>
              </Card>
            </button>
          ) : (
            <>
              <p className="text-xs text-foreground-faint mb-1.5">{tForm("codePhotoHint")}</p>
              <PhotoCapture onFile={codePhoto.handleFile} uploading={codePhoto.uploading} variant="emerald" mobileDesktopMode={mobileDesktopMode} />
              {codePhoto.uploadError && !codePhoto.uploading && <p className="text-xs text-warn font-medium mt-1">{codePhoto.uploadError}</p>}
            </>
          )}
        </FormField>
      )}

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

      {boxConfirm && (
        <div className="flex flex-col gap-2">
          <Card variant="semantic" semantic="sperrzeit" padding="compact">
            {boxName && (
              <p className="mb-2 text-xs font-medium text-foreground-muted">{tForm("keyInBoxName", { name: boxName })}</p>
            )}
            <Toggle
              label={tForm("keyInBoxLabel")}
              description={tForm("keyInBoxDesc")}
              checked={keyInBox}
              onChange={setKeyInBox}
            />
          </Card>
        </div>
      )}

      <Textarea
        label={t("noteOptional")}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={3}
      />

      <FormError message={error} />
    </EntryFormShell>
  );
}
