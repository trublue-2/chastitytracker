"use client";

import { useTranslations } from "next-intl";
import { formatDateTime } from "@/lib/utils";

/**
 * Die Hinweiszeilen, die zu einem hochgeladenen Foto gehören.
 *
 * Ihre Werte kommen alle aus EINER Quelle — `usePhotoUpload` liefert `imageExifTime`,
 * `exifWarning` und `uploadError` —, gerendert wurden sie aber je Formular neu. Der v6-Umbau hat
 * jede Kopie von Hand von `text-xs` auf `text-neben` gezogen: vier gleiche Änderungen in einem
 * Commit. Die Darstellung gehört deshalb neben den Hook, der die Werte erzeugt.
 *
 * Zwei Bauteile statt eines, weil die Zeilen im Formular nicht beieinanderstehen: die EXIF-Angaben
 * gehören zur Vorschau, der Upload-Fehler steht unter dem ganzen Feld.
 *
 * `exifDate` und `uploadError` liegen beide im `common`-Namensraum — die Formulare griffen nur
 * unter verschiedenen Namen darauf zu (`t` bzw. `tc`), die Ausgabe war stets dieselbe.
 */
export function PhotoExifNotes({
  imageExifTime,
  exifWarning,
  uploading,
  dl,
  tz,
}: {
  imageExifTime: string | null;
  exifWarning: string | null;
  /** Während des Hochladens schweigt die Warnung: sie beurteilt ein Bild, das noch nicht steht. */
  uploading: boolean;
  dl: string;
  tz: string;
}) {
  const tc = useTranslations("common");
  return (
    <>
      {imageExifTime && (
        <p className="text-neben text-foreground-faint">
          {tc("exifDate")}: {formatDateTime(imageExifTime, dl, tz)}
        </p>
      )}
      {exifWarning && !uploading && <p className="text-neben text-warn font-medium">{exifWarning}</p>}
    </>
  );
}

/** Der Upload-Fehler unter dem Feld — eigenes Bauteil, weil er nicht bei der Vorschau steht. */
export function PhotoUploadError({ uploadError, uploading }: { uploadError: string | null; uploading: boolean }) {
  if (!uploadError || uploading) return null;
  return <p className="text-neben text-warn font-medium mt-1">{uploadError}</p>;
}
