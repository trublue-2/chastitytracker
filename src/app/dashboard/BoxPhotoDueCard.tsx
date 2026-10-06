"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Camera } from "lucide-react";
import BoxPhotoField from "@/app/components/BoxPhotoField";
import Button from "@/app/components/Button";
import FormError from "@/app/components/FormError";
import Section from "@/app/components/Section";
import { useActionPatch } from "@/app/hooks/useActionPatch";
import { useApiError } from "@/app/hooks/useApiError";
import { usePhotoUpload } from "@/app/hooks/usePhotoUpload";
import { parseApiErrorCode } from "@/lib/apiClient";

/**
 * Die Aufforderung „Box-Bild mit sichtbarem Schlüssel hinterlegen" — fällig, sobald die Box den
 * Riegel als zu gemeldet hat (`boxPhotoDue.ts`). Sie bleibt, bis das Bild da ist oder die
 * Keyholderin es erlässt; wegklicken lässt sie sich nicht. Das Bild landet am Verschluss.
 */
export default function BoxPhotoDueCard({ entryId, mobileDesktopMode }: { entryId: string; mobileDesktopMode?: boolean }) {
  const t = useTranslations("dashboard");
  const tCommon = useTranslations("common");
  const apiError = useApiError();
  const { saving, run } = useActionPatch();
  const [error, setError] = useState<string | null>(null);
  // Eigene Upload-Instanz ohne Siegel-/Geräte-Erkennung: das Urteil („Schlüssel erkannt") fällt
  // server-seitig nach dem Speichern, hier wird bewusst nichts geprüft, was der Client mitschicken könnte.
  const photo = usePhotoUpload({
    startTime: "",
    enableSealDetection: false,
    enableDeviceDetection: false,
    // Die Frische des Fotos hängt an der ECHTEN Aufnahmezeit, nicht an der Dateizeit.
    preferExifTime: true,
    uploadErrorText: () => tCommon("uploadError"),
  });

  async function save() {
    setError(null);
    // Aufnahmezeit mitschicken: der Server vergleicht sie mit „Riegel zu" und markiert ein Foto von
    // davor. Rotation mitschicken: die Vision liest das Foto server-seitig neu, ein gedrehtes Bild sonst
    // anders als die Vorschau, die der Träger gesehen hat.
    const res = await run(`/api/entries/${entryId}/box-photo`, { boxImageUrl: photo.imageUrl, boxImageRotation: photo.rotation, boxImageExifTime: photo.imageExifTime || null }, "POST");
    if (!res?.ok) setError(apiError(res ? await parseApiErrorCode(res) : null));
  }

  return (
    <Section tone="sperrzeit" title={<span className="inline-flex items-center gap-1.5"><Camera size={13} aria-hidden />{t("boxPhotoDueTitle")}</span>}>
      <p className="text-neben text-foreground-muted">{t("boxPhotoDueText")}</p>
      <BoxPhotoField photo={photo} mobileDesktopMode={mobileDesktopMode} required />
      <FormError message={error} />
      <Button
        type="button"
        variant="semantic"
        semantic="sperrzeit"
        className="self-start"
        onClick={save}
        disabled={!photo.imageUrl || photo.uploading}
        loading={saving}
      >
        {t("boxPhotoDueSave")}
      </Button>
    </Section>
  );
}
