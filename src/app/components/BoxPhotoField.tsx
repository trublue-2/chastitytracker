"use client";

import { useTranslations } from "next-intl";
import type { usePhotoUpload } from "@/app/hooks/usePhotoUpload";
import FormField from "@/app/components/FormField";
import PhotoCapture from "@/app/components/PhotoCapture";
import RotatableImagePreview from "@/app/components/RotatableImagePreview";

/** Die von diesem Feld genutzten Teile einer `usePhotoUpload`-Instanz. Bewusst nur diese: das Feld
 *  braucht weder Siegel- noch Geräte-Erkennung, und ein schmaler Vertrag macht sichtbar, dass hier
 *  NICHTS geprüft wird — das Schlüssel-Urteil fällt server-seitig. */
export type BoxPhotoUpload = Pick<
  ReturnType<typeof usePhotoUpload>,
  "imageUrl" | "imagePreview" | "rotation" | "uploading" | "uploadError" | "rotateLeft" | "rotateRight" | "handleFile" | "clearPhoto"
>;

/**
 * Foto durchs Sichtfenster der Schlüsselbox — identisch im Verschluss- und im Kontroll-Formular.
 * Beim Einschliessen entsteht der Nachweis, bei jeder Kontrolle wird er wiederholt; nur die
 * Wiederholung belegt, dass der Schlüssel drin GEBLIEBEN ist. Deshalb genau ein Feld für beide.
 */
export default function BoxPhotoField({
  photo,
  mobileDesktopMode,
}: {
  photo: BoxPhotoUpload;
  mobileDesktopMode?: boolean;
}) {
  const t = useTranslations("common");
  const tForm = useTranslations("lockForm");

  return (
    <FormField label={tForm("boxPhotoLabel")}>
      {photo.imagePreview ? (
        <div className="flex items-start gap-4">
          <RotatableImagePreview src={photo.imagePreview} rotation={photo.rotation} onRotateLeft={photo.rotateLeft} onRotateRight={photo.rotateRight} />
          <div className="flex flex-col gap-2 flex-1 pt-1">
            <PhotoCapture onFile={photo.handleFile} uploading={photo.uploading} variant="emerald" compact mobileDesktopMode={mobileDesktopMode} />
            <button type="button" onClick={photo.clearPhoto} className="text-xs text-warn hover:opacity-80 w-fit transition">
              {t("removePhoto")}
            </button>
          </div>
        </div>
      ) : (
        <>
          <p className="text-xs text-foreground-faint mb-1.5">{tForm("boxPhotoHint")}</p>
          <PhotoCapture onFile={photo.handleFile} uploading={photo.uploading} variant="emerald" mobileDesktopMode={mobileDesktopMode} />
          {photo.uploadError && !photo.uploading && <p className="text-xs text-warn font-medium mt-1">{photo.uploadError}</p>}
        </>
      )}
    </FormField>
  );
}
