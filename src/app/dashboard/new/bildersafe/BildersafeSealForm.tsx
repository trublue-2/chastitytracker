"use client";

import { useState } from "react";
import { KeyRound } from "lucide-react";
import { useTranslations } from "next-intl";
import { usePhotoUpload } from "@/app/hooks/usePhotoUpload";
import Button from "@/app/components/Button";
import EntryFormShell from "@/app/components/EntryFormShell";
import LockboxCodePhotoField from "@/app/components/LockboxCodePhotoField";
import { useLockboxCodePhoto } from "@/app/hooks/useLockboxCodePhoto";
import useToast from "@/app/hooks/useToast";
import { parseApiError } from "@/lib/client/apiClient";

/**
 * Standalone-Aufnahme eines versiegelten Schlüsselbox-Code-Fotos (Bildersafe), die das Foto an den
 * aktuellen Verschluss hängt. Erreichbar aus dem (+)-Menü während verschlossen — deckt das
 * Neu-Versiegeln nach einer Reinigungsöffnung ab. Keine Vorschau; die Zahl bleibt server-seitig.
 */
export default function BildersafeSealForm({ mobileDesktopMode }: { mobileDesktopMode?: boolean }) {
  const tn = useTranslations("newEntry");
  const tc = useTranslations("common");
  const toast = useToast();

  const code = usePhotoUpload({
    startTime: new Date().toISOString(),
    enableSealDetection: false,
    enableDeviceDetection: false,
    uploadErrorText: () => tc("uploadError"),
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const codeUrl = code.imageUrl;
  // Lesbarkeit + Codewechsel (#115) — Urteile, nie Ziffern.
  const check = useLockboxCodePhoto(codeUrl);

  async function submit() {
    if (!codeUrl) return;
    setSaving(true);
    setError("");
    const res = await fetch("/api/bildersafe/seal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ codeImageUrl: codeUrl, codeReadable: check.readable }),
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
    <EntryFormShell
      actions={
        // Blockiert nur bei explizit unlesbar oder bei demselben Code ohne „trotzdem".
        <Button variant="primary" fullWidth loading={saving || code.uploading || check.checking} disabled={!codeUrl || check.blocksSubmit} onClick={submit} icon={<KeyRound size={16} />}>
          {tn("bildersafeSubmit")}
        </Button>
      }
    >
      <LockboxCodePhotoField photo={code} check={check} mobileDesktopMode={mobileDesktopMode} />
      {error && <p className="text-neben text-warn">{error}</p>}
    </EntryFormShell>
  );
}
