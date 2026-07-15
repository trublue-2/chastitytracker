"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ClipboardCheck, WifiOff } from "lucide-react";
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
import Card from "@/app/components/Card";
import Badge from "@/app/components/Badge";
import Spinner from "@/app/components/Spinner";
import type { PruefungPayload, SubmitResult } from "./types";
import { formatVerifyReason, type VerifyReason } from "@/lib/verifyReason";

/** Ruhezeit (ms) nach Tippen/Rotieren, bevor ein Live-Code-Check gefeuert wird (entprellt Abbruch-Stürme). */
const LIVE_CHECK_DEBOUNCE_MS = 600;

/** Titel/Hint-i18n-Keys für die zwei strukturgleichen Hinweis-Cards (Policy-Block bzw. Prüf-Fehler). */
const HINT_CARDS = {
  policy: { title: "policyError", hint: "policyErrorHint" },
  error: { title: "verifyError", hint: "verifyErrorHint" },
} as const;

/** Titel/Hint-i18n-Keys für die zwei strukturgleichen Mismatch-Cards (Code bzw. Siegel-Nummer). */
const MISMATCH_CARDS = {
  mismatch: { title: "codeMismatch", hint: "codeMismatchHint" },
  sealMismatch: { title: "sealMismatch", hint: "sealMismatchHint" },
} as const;

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
  /** Aktives Siegel: die Siegel-Nummer muss zusätzlich zum Code auf dem Foto lesbar sein. */
  sealRequired?: boolean;
  mobileDesktopMode?: boolean;
  isEdit?: boolean;
  submitFn: (payload: PruefungPayload) => Promise<SubmitResult>;
  onSuccess?: () => void;
  onCancel?: () => void;
  submitVariant?: "semantic" | "primary";
  submitLabel?: string;
}

export default function PruefungFormCore({
  initial, minTime, tz, nowDefault, initialCode, initialKommentar, sealRequired, mobileDesktopMode,
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
  const [verifyStatus, setVerifyStatus] = useState<"pending" | "match" | "mismatch" | "sealMismatch" | "error" | "policy" | null>(null);
  const [verifyReason, setVerifyReason] = useState<{ code: VerifyReason; detected?: string } | null>(null);
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
            // Dual-Prüfung: schlägt speziell die Siegel-Nummer fehl (Code passt oder nicht), einen
            // siegel-spezifischen Status zeigen statt des generischen „Code nicht erkannt".
            setVerifyStatus(v.match ? "match" : (v.sealMatch === false ? "sealMismatch" : "mismatch"));
            // Für die „falsch erkannt"-Gründe die passende erkannte Nummer mitgeben (Siegel bzw. Code).
            const detected = v.reason === "sealWrong" ? v.sealDetected : v.detected;
            setVerifyReason(v.reason ? { code: v.reason, detected: detected ?? undefined } : null);
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
    <EntryFormShell
      onSubmit={handleSubmit}
      onCancel={onCancel}
      cancelLabel={tc("cancel")}
      actions={
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
      }
    >
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
          {sealRequired && (
            <p className="text-xs text-foreground-muted mt-2">{t("sealAlsoRequired")}</p>
          )}
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
              {imageExifTime && <p className="text-xs text-foreground-faint">{tc("exifDate")}: {formatDateTime(imageExifTime, dl, tz)}</p>}
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
      {(verifyStatus === "mismatch" || verifyStatus === "sealMismatch") && (
        <Card variant="semantic" semantic="warn">
          <p className="text-sm text-warn-text font-medium">{t(MISMATCH_CARDS[verifyStatus].title)}</p>
          {verifyReason && <p className="text-xs text-warn mt-0.5">{formatVerifyReason(verifyReason.code, verifyReason.detected, t)}</p>}
          <p className="text-xs text-warn mt-1">{t(MISMATCH_CARDS[verifyStatus].hint)}</p>
        </Card>
      )}
      {(verifyStatus === "policy" || verifyStatus === "error") && (
        <Card padding="compact">
          <p className="text-sm text-foreground-muted font-medium">{t(HINT_CARDS[verifyStatus].title)}</p>
          <p className="text-xs text-foreground-faint mt-0.5">{t(HINT_CARDS[verifyStatus].hint)}</p>
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
    </EntryFormShell>
  );
}
