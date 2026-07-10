"use client";

import { useEffect, useState } from "react";
import { Lock, KeyRound } from "lucide-react";
import { useTranslations } from "next-intl";
import { usePhotoUpload } from "@/app/hooks/usePhotoUpload";
import PhotoCapture from "@/app/components/PhotoCapture";
import Card from "@/app/components/Card";
import Button from "@/app/components/Button";
import useToast from "@/app/hooks/useToast";
import { parseApiError } from "@/lib/apiClient";

/**
 * Standalone-Aufnahme eines versiegelten Schlüsselbox-Code-Fotos (Bildersafe), die das Foto an den
 * aktuellen Verschluss hängt. Erreichbar aus dem (+)-Menü während verschlossen — deckt das
 * Neu-Versiegeln nach einer Reinigungsöffnung ab. Keine Vorschau; die Zahl bleibt server-seitig.
 */
export default function BildersafeSealForm({ mobileDesktopMode }: { mobileDesktopMode?: boolean }) {
  const t = useTranslations("lockForm");
  const tn = useTranslations("newEntry");
  const tc = useTranslations("common");
  const toast = useToast();

  const code = usePhotoUpload({
    startTime: new Date().toISOString(),
    enableSealDetection: false,
    enableDeviceDetection: false,
    uploadErrorText: () => tc("uploadError"),
  });
  const [readable, setReadable] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const codeUrl = code.imageUrl;

  useEffect(() => {
    if (!codeUrl) { setReadable(null); return; }
    let cancelled = false;
    setChecking(true);
    fetch("/api/detect-seal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageUrl: codeUrl, readableOnly: true, lockbox: true }),
    })
      .then((r) => (r.ok ? r.json() : { readable: null }))
      // readable: true = lesbar · false = unlesbar · null = nicht geprüft (KI aus) → Versiegeln erlaubt
      .then(({ readable }) => { if (!cancelled) setReadable(typeof readable === "boolean" ? readable : null); })
      .catch(() => { if (!cancelled) setReadable(null); })
      .finally(() => { if (!cancelled) setChecking(false); });
    return () => { cancelled = true; };
  }, [codeUrl]);

  async function submit() {
    if (!codeUrl) return;
    setSaving(true);
    setError("");
    const res = await fetch("/api/bildersafe/seal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ codeImageUrl: codeUrl, codeReadable: readable }),
    });
    setSaving(false);
    if (res.ok) {
      toast.success(tn("bildersafeSealed"));
      window.location.href = "/dashboard";
    } else {
      setError(await parseApiError(res, tc("savingError")));
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {codeUrl ? (
        // Ganze Fläche = neu aufnehmen.
        <button type="button" onClick={code.clearPhoto} className="text-left w-full">
          <Card variant="semantic" semantic={readable === false ? "warn" : "sperrzeit"}>
            <div className="flex items-start gap-2.5">
              <Lock size={16} className={`mt-0.5 shrink-0 ${readable === false ? "text-warn" : "text-sperrzeit"}`} />
              <div className="text-xs flex-1">
                <p className={`font-bold ${readable === false ? "text-warn-text" : "text-sperrzeit-text"}`}>{t("codePhotoSealed")}</p>
                <p className={`mt-0.5 ${readable === false ? "text-warn" : "text-sperrzeit"}`}>
                  {checking ? t("codePhotoChecking") : readable === false ? t("codePhotoUnreadable") : readable === true ? t("codePhotoReadable") : t("codePhotoNoCheck")}
                </p>
                <p className="text-foreground-faint mt-1.5 underline">{t("codePhotoRetake")}</p>
              </div>
            </div>
          </Card>
        </button>
      ) : (
        <>
          <p className="text-xs text-foreground-faint">{t("codePhotoHint")}</p>
          <PhotoCapture onFile={code.handleFile} uploading={code.uploading} variant="emerald" mobileDesktopMode={mobileDesktopMode} />
          {code.uploadError && !code.uploading && <p className="text-xs text-warn mt-1">{code.uploadError}</p>}
        </>
      )}

      {error && <p className="text-xs text-warn">{error}</p>}

      {/* Versiegeln blockiert nur bei explizit unlesbar (KI an). Ohne KI (readable=null) erlaubt. */}
      <Button variant="primary" fullWidth loading={saving || code.uploading || checking} disabled={!codeUrl || readable === false} onClick={submit} icon={<KeyRound size={16} />}>
        {tn("bildersafeSubmit")}
      </Button>
    </div>
  );
}
