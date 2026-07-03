"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ClipboardCheck, WifiOff } from "lucide-react";
import { toDatetimeLocal, fromDatetimeLocal, toDateLocale } from "@/lib/utils";
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
import Card from "@/app/components/Card";
import Badge from "@/app/components/Badge";
import Spinner from "@/app/components/Spinner";
import type { PruefungPayload, SubmitResult } from "./types";

/** Ruhezeit (ms) nach Tippen/Rotieren, bevor ein Live-Code-Check gefeuert wird (entprellt Abbruch-Stürme). */
const LIVE_CHECK_DEBOUNCE_MS = 600;

interface Props {
  initial?: {
    startTime: string;
    imageUrl?: string | null;
    imageExifTime?: string | null;
    note?: string | null;
    kontrollCode?: string | null;
    verifikationStatus?: string | null;
  };
  minTime?: string;
  tz: string;
  nowDefault: string;
  initialCode?: string;
  initialKommentar?: string;
  mobileDesktopMode?: boolean;
  isEdit?: boolean;
  submitFn: (payload: PruefungPayload) => Promise<SubmitResult>;
  onSuccess?: () => void;
  onCancel?: () => void;
  submitVariant?: "semantic" | "primary";
  submitLabel?: string;
}

export default function PruefungFormCore({
  initial, minTime, tz, nowDefault, initialCode, initialKommentar, mobileDesktopMode,
  isEdit = false, submitFn, onSuccess, onCancel, submitVariant = "semantic", submitLabel,
}: Props) {
  const t = useTranslations("inspectionForm");
  const tc = useTranslations("common");
  const tOffline = useTranslations("offline");
  const dl = toDateLocale(useLocale());

  const [isOnline, setIsOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);
  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  const [startTime, setStartTime] = useState(toDatetimeLocal(initial?.startTime, tz) || nowDefault);
  const [note, setNote] = useState(initial?.note ?? "");
  const [kontrollCode, setKontrollCode] = useState(initial?.kontrollCode ?? initialCode ?? "");
  const [verifyStatus, setVerifyStatus] = useState<"pending" | "match" | "mismatch" | "error" | "policy" | null>(null);
  const [verifyReason, setVerifyReason] = useState<string | null>(null);
  const [aiMatch, setAiMatch] = useState<boolean | null>(null);
  const lastVerifiedKey = useRef<string>("");
  const { saving, error, setError, submit } = useEntrySubmit<PruefungPayload>(submitFn, onSuccess);

  const {
    imageUrl, imageExifTime, imagePreview, uploading, exifWarning, uploadError,
    rotation, rotateLeft, rotateRight, handleFile: uploadFile,
  } = usePhotoUpload({
    startTime,
    exifWarningText: (type, hours) =>
      type === "deviation" ? tc("exifDeviation", { hours: hours ?? 0 }) : tc("exifMissing"),
    uploadErrorText: () => tc("uploadError"),
    initial,
  });

  function handleFile(file: File) {
    setError("");
    setVerifyStatus(null);
    setVerifyReason(null);
    setAiMatch(null);
    uploadFile(file);
  }

  useEffect(() => {
    const key = `${kontrollCode}|${imageUrl}|${rotation}`;
    if (kontrollCode.length < 5 || !imageUrl || key === lastVerifiedKey.current) return;

    // Entprellen: erst nach kurzer Tipp-/Rotier-Ruhe einen Live-Check feuern. Verhindert einen Sturm
    // aus Request-Abbrüchen (AbortError) und unnötiger Vision-Last bei jedem Tastendruck/Re-Render.
    const controller = new AbortController();
    const timer = setTimeout(() => {
      lastVerifiedKey.current = key;
      setVerifyStatus("pending");
      setVerifyReason(null);
      setAiMatch(null);
      fetch("/api/verify-kontrolle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl, expectedCode: kontrollCode, rotation }),
        signal: controller.signal,
      })
        .then((r) => r.json())
        .then((v) => {
          if (v.error === "policy") setVerifyStatus("policy");
          else if (v.error) setVerifyStatus("error");
          else {
            setVerifyStatus(v.match ? "match" : "mismatch");
            setVerifyReason(v.reason ?? null);
            setAiMatch(!!v.match);
          }
        })
        .catch((err) => { if (err.name !== "AbortError") setVerifyStatus("error"); });
    }, LIVE_CHECK_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
      // Abgebrochenen (noch nicht abgeschlossenen) Check freigeben → erneutes Prüfen bei Rückkehr möglich.
      if (lastVerifiedKey.current === key) lastVerifiedKey.current = "";
    };
  }, [kontrollCode, imageUrl, rotation]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!imageUrl) { setError(t("photoRequired")); return; }
    await submit({
      type: "PRUEFUNG",
      startTime: fromDatetimeLocal(startTime, tz).toISOString(),
      imageUrl: imageUrl || null,
      imageExifTime: imageExifTime || null,
      note: note.trim() || null,
      kontrollCode: kontrollCode || null,
      verifikationStatus: aiMatch === true ? "ai" : null,
      imageRotation: rotation,
    });
  }

  const defaultLabel = isEdit ? tc("update") : t("saveBtn");
  const hasPrefilledCode = !!(initialCode || initial?.kontrollCode);

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      {!isOnline && (
        <Card variant="semantic" semantic="warn">
          <div className="flex items-start gap-2.5">
            <WifiOff size={16} className="flex-shrink-0 text-warn mt-0.5" />
            <p className="text-sm text-warn-text">{tOffline("photoRequiresConnection")}</p>
          </div>
        </Card>
      )}

      {initialKommentar && (
        <Card variant="semantic" semantic="warn">
          <p className="text-xs font-semibold text-warn-text uppercase tracking-wider mb-1">{t("instruction")}</p>
          <p className="text-sm text-warn-text">{initialKommentar}</p>
        </Card>
      )}

      {hasPrefilledCode && (
        <Card padding="compact">
          <div className="flex items-center gap-3">
            <Badge variant="inspect" label={t("controlCode")} size="sm" />
            <span className="font-mono font-bold text-xl text-inspect tracking-widest">
              {kontrollCode || "–"}
            </span>
          </div>
        </Card>
      )}

      <RequiredHint />

      <DateTimePicker
        label={tc("dateTime")}
        value={startTime}
        onChange={(e) => setStartTime(e.target.value)}
        required
        {...(minTime && { min: minTime })}
      />

      <FormField label={tc("photo")} required>
        {imagePreview ? (
          <div className="flex items-start gap-4">
            <RotatableImagePreview src={imagePreview} rotation={rotation} onRotateLeft={rotateLeft} onRotateRight={rotateRight} />
            <div className="flex flex-col gap-2 flex-1 pt-1">
              {imageExifTime && <p className="text-xs text-foreground-faint">{tc("exifDate")}: {new Date(imageExifTime).toLocaleString(dl)}</p>}
              {exifWarning && !uploading && <p className="text-xs text-warn font-medium">{exifWarning}</p>}
              <PhotoCapture onFile={handleFile} uploading={uploading} variant="orange" compact mobileDesktopMode={mobileDesktopMode} />
            </div>
          </div>
        ) : (
          <>
            <PhotoCapture onFile={handleFile} uploading={uploading} variant="orange" mobileDesktopMode={mobileDesktopMode} />
            {uploadError && !uploading && <p className="text-xs text-warn font-medium mt-1">{uploadError}</p>}
          </>
        )}
      </FormField>

      {verifyStatus === "pending" && (
        <div className="flex items-center gap-2 text-sm text-foreground-muted">
          <Spinner size="sm" /> {t("verifying")}
        </div>
      )}
      {verifyStatus === "match" && <Badge variant="ok" label={t("codeMatch")} />}
      {verifyStatus === "mismatch" && (
        <Card variant="semantic" semantic="warn">
          <p className="text-sm text-warn-text font-medium">{t("codeMismatch")}</p>
          {verifyReason && <p className="text-xs text-warn mt-0.5">{verifyReason}</p>}
          <p className="text-xs text-warn mt-1">{t("codeMismatchHint")}</p>
        </Card>
      )}
      {verifyStatus === "policy" && (
        <Card padding="compact">
          <p className="text-sm text-foreground-muted font-medium">{t("policyError")}</p>
          <p className="text-xs text-foreground-faint mt-0.5">{t("policyErrorHint")}</p>
        </Card>
      )}

      {!hasPrefilledCode && (
        <Input
          label={t("controlCode")}
          hint={t("controlCodeHint")}
          type="text"
          value={kontrollCode}
          onChange={(e) => setKontrollCode(e.target.value.replace(/\D/g, "").slice(0, 8))}
          maxLength={8}
          placeholder="–"
          className="font-mono tracking-widest text-inspect font-bold text-xl"
        />
      )}

      <Textarea
        label={tc("noteOptional")}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={3}
      />

      <FormError message={error} />

      <div className="flex flex-col-reverse sm:flex-row gap-3 pt-1">
        {onCancel && (
          <Button type="button" variant="secondary" fullWidth onClick={onCancel}>
            {tc("cancel")}
          </Button>
        )}
        <Button
          type="submit"
          variant={submitVariant}
          semantic={submitVariant === "semantic" ? "inspect" : undefined}
          fullWidth
          loading={saving || uploading}
          icon={submitVariant === "primary" ? <ClipboardCheck size={16} /> : undefined}
        >
          {submitLabel ?? defaultLabel}
        </Button>
      </div>
    </form>
  );
}
