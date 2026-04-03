"use client";

import { useRef, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toDatetimeLocal, toDateLocale } from "@/lib/utils";
import { usePhotoUpload } from "@/app/hooks/usePhotoUpload";
import PhotoCapture from "@/app/components/PhotoCapture";
import ImageViewer from "@/app/components/ImageViewer";
import { useTranslations, useLocale } from "next-intl";
import FormError from "@/app/components/FormError";
import FormField from "@/app/components/FormField";
import DateTimePicker from "@/app/components/DateTimePicker";
import Input from "@/app/components/Input";
import Textarea from "@/app/components/Textarea";
import Button from "@/app/components/Button";
import Card from "@/app/components/Card";
import Badge from "@/app/components/Badge";
import Spinner from "@/app/components/Spinner";
import useToast from "@/app/hooks/useToast";

interface Props {
  initial?: {
    id: string;
    startTime: string;
    imageUrl?: string | null;
    imageExifTime?: string | null;
    note?: string | null;
    kontrollCode?: string | null;
    verifikationStatus?: string | null;
  };
  initialCode?: string;
  initialKommentar?: string;
  mobileDesktopMode?: boolean;
  redirectTo?: string;
}

export default function PruefungForm({ initial, initialCode, initialKommentar, mobileDesktopMode, redirectTo }: Props) {
  const t = useTranslations("inspectionForm");
  const tCommon = useTranslations("common");
  const tDash = useTranslations("dashboard");
  const dl = toDateLocale(useLocale());
  const router = useRouter();
  const toast = useToast();

  const [startTime, setStartTime] = useState(
    toDatetimeLocal(initial?.startTime) || toDatetimeLocal(new Date())
  );
  const [note, setNote] = useState(initial?.note ?? "");
  const [kontrollCode, setKontrollCode] = useState(initial?.kontrollCode ?? initialCode ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [verifyStatus, setVerifyStatus] = useState<"pending" | "match" | "mismatch" | "error" | "policy" | null>(null);
  const [verifyReason, setVerifyReason] = useState<string | null>(null);
  const [aiMatch, setAiMatch] = useState<boolean | null>(null);
  const lastVerifiedKey = useRef<string>("");

  const {
    imageUrl, imageExifTime, imagePreview, uploading, exifWarning,
    handleFile: uploadFile,
  } = usePhotoUpload({
    startTime,
    exifWarningText: (type, hours) =>
      type === "deviation" ? tCommon("exifDeviation", { hours: hours ?? 0 }) : tCommon("exifMissing"),
    initial,
  });

  function handleFile(file: File) {
    setError("");
    setVerifyStatus(null);
    setVerifyReason(null);
    setAiMatch(null);
    uploadFile(file);
  }

  // Auto-verify when code + image are ready
  useEffect(() => {
    const key = `${kontrollCode}|${imageUrl}`;
    if (kontrollCode.length >= 5 && imageUrl && key !== lastVerifiedKey.current) {
      lastVerifiedKey.current = key;
      setVerifyStatus("pending");
      setVerifyReason(null);
      setAiMatch(null);
      const controller = new AbortController();
      fetch("/api/verify-kontrolle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl, expectedCode: kontrollCode }),
        signal: controller.signal,
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
        .catch((err) => { if (err.name !== "AbortError") setVerifyStatus("error"); });
      return () => controller.abort();
    }
  }, [kontrollCode, imageUrl]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!imageUrl) { setError(t("photoRequired")); return; }
    setSaving(true);
    setError("");

    try {
      const res = await fetch(
        initial ? `/api/entries/${initial.id}` : "/api/entries",
        {
          method: initial ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "PRUEFUNG",
            startTime: new Date(startTime).toISOString(),
            imageUrl: imageUrl || null,
            imageExifTime: imageExifTime || null,
            note: note || null,
            kontrollCode: kontrollCode || null,
            verifikationStatus: aiMatch === true ? "ai" : null,
          }),
        }
      );

      setSaving(false);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setError(err.error || tCommon("savingError"));
        return;
      }
      toast.success(initial ? tDash("entryUpdated") : tDash("entrySaved"));
      router.push(redirectTo ?? "/dashboard");
    } catch {
      setSaving(false);
      setError(tCommon("networkError"));
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      {/* Instruction from admin */}
      {initialKommentar && (
        <Card variant="semantic" semantic="warn">
          <p className="text-xs font-semibold text-warn-text uppercase tracking-wider mb-1">{t("instruction")}</p>
          <p className="text-sm text-warn-text">{initialKommentar}</p>
        </Card>
      )}

      {/* Control code display */}
      {(initialCode || initial?.kontrollCode) && (
        <Card padding="compact">
          <div className="flex items-center gap-3">
            <Badge variant="inspect" label={t("controlCode")} size="sm" />
            <span className="font-mono font-bold text-xl text-inspect tracking-widest">
              {kontrollCode || "–"}
            </span>
          </div>
        </Card>
      )}

      <DateTimePicker
        label={tCommon("dateTimeRequired")}
        value={startTime}
        onChange={(e) => setStartTime(e.target.value)}
        required
      />

      {/* Photo (required) */}
      <FormField label={`${tCommon("photoRequired")} *`}>
        {imagePreview ? (
          <div className="flex items-start gap-4">
            <ImageViewer
              src={imagePreview}
              alt=""
              width={80}
              height={80}
              className="w-20 h-20 rounded-xl object-cover flex-shrink-0"
            />
            <div className="flex flex-col gap-2 flex-1 pt-1">
              {imageExifTime && <p className="text-xs text-foreground-faint">{tCommon("exifDate")}: {new Date(imageExifTime).toLocaleString(dl)}</p>}
              {exifWarning && !uploading && <p className="text-xs text-warn font-medium">{exifWarning}</p>}
              <PhotoCapture onFile={handleFile} uploading={uploading} variant="orange" compact mobileDesktopMode={mobileDesktopMode} />
            </div>
          </div>
        ) : (
          <PhotoCapture onFile={handleFile} uploading={uploading} variant="orange" mobileDesktopMode={mobileDesktopMode} />
        )}
      </FormField>

      {/* Verification status */}
      {verifyStatus === "pending" && (
        <div className="flex items-center gap-2 text-sm text-foreground-muted">
          <Spinner size="sm" /> {t("verifying")}
        </div>
      )}
      {verifyStatus === "match" && (
        <Badge variant="ok" label={t("codeMatch")} />
      )}
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

      {/* Code input (only if not pre-filled from request) */}
      {!initialCode && !initial?.kontrollCode && (
        <Input
          label={t("controlCode")}
          hint={t("controlCodeHint")}
          type="text"
          value={kontrollCode}
          onChange={(e) => setKontrollCode(e.target.value.slice(0, 8))}
          maxLength={8}
          placeholder="–"
          className="font-mono tracking-widest text-inspect font-bold text-xl"
        />
      )}

      <Textarea
        label={tCommon("noteOptional")}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={3}
      />

      <FormError message={error} />

      <div className="flex flex-col-reverse sm:flex-row gap-3 pt-1">
        <Button type="button" variant="secondary" fullWidth onClick={() => router.push("/dashboard")}>
          {tCommon("cancel")}
        </Button>
        <Button type="submit" variant="semantic" semantic="inspect" fullWidth loading={saving || uploading}>
          {initial ? tCommon("update") : t("saveBtn")}
        </Button>
      </div>
    </form>
  );
}
