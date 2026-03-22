"use client";

import { useRef, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toDatetimeLocal, toDateLocale } from "@/lib/utils";
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
    aiVerified?: boolean | null;
  };
  initialCode?: string;
  initialKommentar?: string;
}

const inputCls = "w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3.5 text-base text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition";

export default function PruefungForm({ initial, initialCode, initialKommentar }: Props) {
  const t = useTranslations("inspectionForm");
  const tCommon = useTranslations("common");
  const dl = toDateLocale(useLocale());
  const router = useRouter();

  const [startTime, setStartTime] = useState(
    toDatetimeLocal(initial?.startTime) || toDatetimeLocal(new Date())
  );
  const [note, setNote] = useState(initial?.note ?? "");
  const [kontrollCode, setKontrollCode] = useState(initial?.kontrollCode ?? initialCode ?? "");
  const [imageUrl, setImageUrl] = useState(initial?.imageUrl ?? "");
  const [imageExifTime, setImageExifTime] = useState(initial?.imageExifTime ?? "");
  const [imagePreview, setImagePreview] = useState(initial?.imageUrl ?? "");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [exifWarning, setExifWarning] = useState("");
  const [verifyStatus, setVerifyStatus] = useState<"pending" | "match" | "mismatch" | "error" | "policy" | null>(null);
  const [verifyReason, setVerifyReason] = useState<string | null>(null);
  const [aiVerified, setAiVerified] = useState<boolean | null>(initial?.aiVerified ?? null);
  const lastVerifiedKey = useRef<string>("");

  // Wenn Code manuell auf 5 Zeichen gesetzt wird und Bild vorhanden → Verifikation auslösen
  useEffect(() => {
    const key = `${kontrollCode}|${imageUrl}`;
    if (kontrollCode.length === 5 && imageUrl && key !== lastVerifiedKey.current) {
      lastVerifiedKey.current = key;
      setVerifyStatus("pending");
      setVerifyReason(null);
      setAiVerified(null);
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
            setAiVerified(v.match ? true : false);
          }
        })
        .catch(() => setVerifyStatus("error"));
    }
  }, [kontrollCode, imageUrl]);

  async function handleFile(file: File) {
    setUploading(true);
    setExifWarning("");
    setImagePreview(URL.createObjectURL(file));
    setError("");
    setVerifyStatus(null);
    setVerifyReason(null);
    setAiVerified(null);

    // iOS Safari strips EXIF — use file.lastModified as capture time (accurate for camera shots)
    const clientExifTime = file.lastModified ? new Date(file.lastModified).toISOString() : null;

    const fd = new FormData();
    fd.append("file", file);
    if (clientExifTime) fd.append("clientExifTime", clientExifTime);
    const res = await fetch("/api/upload", { method: "POST", body: fd });
    const data = await res.json();

    setImageUrl(data.url);
    setImagePreview(data.url);
    setImageExifTime(data.exifTime ?? "");
    // Verifikation läuft via useEffect sobald imageUrl und kontrollCode gesetzt sind

    if (data.exifTime && startTime) {
      const diff = Math.abs(new Date(data.exifTime).getTime() - new Date(startTime).getTime());
      if (diff > 3600000) setExifWarning(tCommon("exifDeviation", { hours: Math.round(diff / 3600000) }));
    } else if (!data.exifTime) {
      setExifWarning(tCommon("exifMissing"));
    }
    setUploading(false);
  }

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
          aiVerified: aiVerified,
        }),
      }
    );

    setSaving(false);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setError(err.error || tCommon("savingError"));
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      {initialKommentar && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-3">
          <p className="text-xs font-semibold text-yellow-800 uppercase tracking-wider mb-1">{t("instruction")}</p>
          <p className="text-sm text-yellow-900">{initialKommentar}</p>
        </div>
      )}
      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">{tCommon("dateTimeRequired")}</label>
        <input type="datetime-local" value={startTime} onChange={(e) => setStartTime(e.target.value)} required className={inputCls} />
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
          {tCommon("photoRequired")} <span className="text-red-500">*</span> <span className="text-gray-400 normal-case font-normal">({tCommon("photoMandatory")})</span>
        </label>
        {imagePreview ? (
          <div className="flex items-start gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imagePreview} alt="Vorschau" className="w-20 h-20 rounded-xl object-cover flex-shrink-0" />
            <div className="flex flex-col gap-2 flex-1 pt-1">
              {imageExifTime && <p className="text-xs text-gray-400">EXIF: {new Date(imageExifTime).toLocaleString(dl)}</p>}
              {exifWarning && !uploading && <p className="text-xs text-amber-600 font-medium">⚠ {exifWarning}</p>}
              <PhotoCapture onFile={handleFile} uploading={uploading} variant="orange">
                <button type="button" disabled={uploading}
                  className="text-xs text-gray-500 border border-gray-200 rounded-lg px-3 py-2 hover:bg-gray-50 disabled:opacity-50 transition w-fit">
                  {uploading ? tCommon("loading") : tCommon("replacePhoto")}
                </button>
              </PhotoCapture>
            </div>
          </div>
        ) : (
          <PhotoCapture onFile={handleFile} uploading={uploading} variant="orange" />
        )}
      </div>

      {verifyStatus === "pending" && (
        <p className="text-sm text-gray-500 flex items-center gap-2">
          <Loader2 size={14} className="animate-spin" /> {t("verifying")}
        </p>
      )}
      {verifyStatus === "match" && (
        <p className="text-sm text-green-600 font-medium">{t("codeMatch")}</p>
      )}
      {verifyStatus === "policy" && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
          <p className="text-sm text-gray-600 font-medium">{t("policyError")}</p>
          <p className="text-xs text-gray-500 mt-0.5">{t("policyErrorHint")}</p>
        </div>
      )}
      {verifyStatus === "mismatch" && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <p className="text-sm text-amber-700 font-medium">{t("codeMismatch")}</p>
          {verifyReason && <p className="text-xs text-amber-600 mt-0.5">{verifyReason}</p>}
          <p className="text-xs text-amber-500 mt-1">{t("codeMismatchHint")}</p>
        </div>
      )}

      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
          {t("controlCode")} <span className="text-orange-500 normal-case font-normal">({t("controlCodeHint")})</span>
        </label>
        <input
          type="text"
          value={kontrollCode}
          onChange={(e) => setKontrollCode(e.target.value.slice(0, 5))}
          maxLength={5}
          placeholder="–"
          className={`${inputCls} font-mono tracking-widest text-orange-600 font-bold text-xl`}
        />
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">{tCommon("noteOptional")}</label>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} className={`${inputCls} resize-none`} />
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{error}</p>}

      <div className="flex flex-col-reverse sm:flex-row gap-3 pt-1">
        <button type="button" onClick={() => router.push("/dashboard")}
          className="flex-1 text-sm text-gray-600 border border-gray-200 rounded-xl py-3.5 hover:bg-gray-50 active:scale-[0.98] transition-all">
          {tCommon("cancel")}
        </button>
        <button type="submit" disabled={saving || uploading}
          className="flex-1 bg-orange-500 text-white text-base font-semibold py-3.5 rounded-xl hover:bg-orange-400 active:scale-[0.98] disabled:opacity-50 transition-all">
          {saving ? tCommon("saving") : initial ? tCommon("update") : t("saveBtn")}
        </button>
      </div>
    </form>
  );
}
