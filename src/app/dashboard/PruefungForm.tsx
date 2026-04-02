"use client";

import { useRef, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toDatetimeLocal, toDateLocale } from "@/lib/utils";
import { usePhotoUpload } from "@/app/hooks/usePhotoUpload";
import { Loader2 } from "lucide-react";
import PhotoCapture from "@/app/components/PhotoCapture";
import { useTranslations, useLocale } from "next-intl";

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

const inputCls = "w-full bg-surface-raised border border-border rounded-xl px-4 py-3.5 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-foreground-muted focus:border-transparent transition";

export default function PruefungForm({ initial, initialCode, initialKommentar, mobileDesktopMode, redirectTo }: Props) {
  const t = useTranslations("inspectionForm");
  const tCommon = useTranslations("common");
  const dl = toDateLocale(useLocale());
  const router = useRouter();

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

  // Reset verification state when a new file is uploaded
  function handleFile(file: File) {
    setError("");
    setVerifyStatus(null);
    setVerifyReason(null);
    setAiMatch(null);
    uploadFile(file);
  }

  // Wenn Code manuell auf 5 Zeichen gesetzt wird und Bild vorhanden → Verifikation auslösen
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
    router.push(redirectTo ?? "/dashboard");
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      {initialKommentar && (
        <div className="bg-warn-bg border border-[var(--color-warn-border)] rounded-xl px-4 py-3">
          <p className="text-xs font-semibold text-[var(--color-warn-text)] uppercase tracking-wider mb-1">{t("instruction")}</p>
          <p className="text-sm text-[var(--color-warn-text)]">{initialKommentar}</p>
        </div>
      )}
      <div>
        <label className="block text-xs font-semibold text-foreground-faint uppercase tracking-wider mb-2">{tCommon("dateTimeRequired")}</label>
        <input type="datetime-local" value={startTime} onChange={(e) => setStartTime(e.target.value)} required className={inputCls} />
      </div>

      <div>
        <label className="block text-xs font-semibold text-foreground-faint uppercase tracking-wider mb-2">
          {tCommon("photoRequired")} <span className="text-warn">*</span> <span className="text-foreground-faint normal-case font-normal">({tCommon("photoMandatory")})</span>
        </label>
        {imagePreview ? (
          <div className="flex items-start gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imagePreview} alt="Vorschau" className="w-20 h-20 rounded-xl object-cover flex-shrink-0" />
            <div className="flex flex-col gap-2 flex-1 pt-1">
              {imageExifTime && <p className="text-xs text-foreground-faint">EXIF: {new Date(imageExifTime).toLocaleString(dl)}</p>}
              {exifWarning && !uploading && <p className="text-xs text-[var(--color-warn)] font-medium">⚠ {exifWarning}</p>}
              <PhotoCapture onFile={handleFile} uploading={uploading} variant="orange" compact mobileDesktopMode={mobileDesktopMode} />
            </div>
          </div>
        ) : (
          <PhotoCapture onFile={handleFile} uploading={uploading} variant="orange" mobileDesktopMode={mobileDesktopMode} />
        )}
      </div>

      {verifyStatus === "pending" && (
        <p className="text-sm text-foreground-muted flex items-center gap-2">
          <Loader2 size={14} className="animate-spin" /> {t("verifying")}
        </p>
      )}
      {verifyStatus === "match" && (
        <p className="text-sm text-[var(--color-ok)] font-medium">{t("codeMatch")}</p>
      )}
      {verifyStatus === "policy" && (
        <div className="bg-surface-raised border border-border rounded-xl px-4 py-3">
          <p className="text-sm text-foreground-muted font-medium">{t("policyError")}</p>
          <p className="text-xs text-foreground-faint mt-0.5">{t("policyErrorHint")}</p>
        </div>
      )}
      {verifyStatus === "mismatch" && (
        <div className="bg-warn-bg border border-[var(--color-warn-border)] rounded-xl px-4 py-3">
          <p className="text-sm text-[var(--color-warn-text)] font-medium">{t("codeMismatch")}</p>
          {verifyReason && <p className="text-xs text-[var(--color-warn)] mt-0.5">{verifyReason}</p>}
          <p className="text-xs text-[var(--color-warn)] mt-1">{t("codeMismatchHint")}</p>
        </div>
      )}

      <div>
        <label className="block text-xs font-semibold text-foreground-faint uppercase tracking-wider mb-2">
          {t("controlCode")} <span className="text-[var(--color-inspect)] normal-case font-normal">({t("controlCodeHint")})</span>
        </label>
        {initial?.kontrollCode ? (
          <div className={`${inputCls} font-mono tracking-widest text-[var(--color-inspect)] font-bold text-xl bg-surface-raised cursor-default`}>
            {kontrollCode || "–"}
          </div>
        ) : (
          <input
            type="text"
            value={kontrollCode}
            onChange={(e) => setKontrollCode(e.target.value.slice(0, 8))}
            maxLength={8}
            placeholder="–"
            className={`${inputCls} font-mono tracking-widest text-[var(--color-inspect)] font-bold text-xl`}
          />
        )}
      </div>

      <div>
        <label className="block text-xs font-semibold text-foreground-faint uppercase tracking-wider mb-2">{tCommon("noteOptional")}</label>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} className={`${inputCls} resize-none`} />
      </div>

      {error && <p className="text-sm text-warn bg-warn-bg border border-[var(--color-warn-border)] rounded-xl px-4 py-3">{error}</p>}

      <div className="flex flex-col-reverse sm:flex-row gap-3 pt-1">
        <button type="button" onClick={() => router.push("/dashboard")}
          className="flex-1 text-sm text-foreground-muted border border-border rounded-xl py-3.5 hover:bg-surface-raised active:scale-[0.98] transition-all">
          {tCommon("cancel")}
        </button>
        <button type="submit" disabled={saving || uploading}
          className="flex-1 bg-[var(--color-inspect)] text-white text-base font-semibold py-3.5 rounded-xl hover:opacity-90 active:scale-[0.98] disabled:opacity-50 transition-all">
          {saving ? tCommon("saving") : initial ? tCommon("update") : t("saveBtn")}
        </button>
      </div>
    </form>
  );
}
