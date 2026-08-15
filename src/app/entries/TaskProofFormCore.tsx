"use client";

import { useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { Camera } from "lucide-react";
import { usePhotoUpload } from "@/app/hooks/usePhotoUpload";
import { useEntrySubmit } from "@/app/hooks/useEntrySubmit";
import { parseApiErrorCode } from "@/lib/apiClient";
import { useApiError } from "@/app/hooks/useApiError";
import PhotoCapture from "@/app/components/PhotoCapture";
import RotatableImagePreview from "@/app/components/RotatableImagePreview";
import FormField from "@/app/components/FormField";
import FormError from "@/app/components/FormError";
import Button from "@/app/components/Button";
import Card from "@/app/components/Card";
import EntryFormShell from "@/app/components/EntryFormShell";
import { formatDateTime, toDateLocale } from "@/lib/utils";

/**
 * Der Sub reicht EIN gefordertes Nachweis-Foto ein (Issue #39, Etappe 3).
 *
 * Bewusst viel schlanker als `PruefungFormCore`: kein Zeitpunkt (die Aufnahmezeit kommt aus den
 * EXIF-Daten und ist gerade NICHT vom Sub setzbar — sonst wäre die Reihenfolge-Prüfung wertlos),
 * keine Notiz, kein Live-Check. Ein Foto, ein Knopf.
 *
 * Der Code wird ANGEZEIGT, nicht eingegeben: er ist die Vorgabe, die der Sub handschriftlich ins
 * Bild bringen muss. Ein Eingabefeld dafür wäre sinnlos — die Prüfung liest ihn aus dem Foto.
 */
export default function TaskProofFormCore({
  proofId,
  description,
  code,
  taskTitle,
  orderMatters,
  dueAt,
  tz,
  mobileDesktopMode,
}: {
  proofId: string;
  description: string;
  /** Null ohne Code-Pflicht — dann legt die Keyholderin den Nachweis selbst vor. */
  code: string | null;
  taskTitle: string;
  /**
   * EIGENE Fälligkeit dieses Nachweises (ISO) — null, wo er bis zum Ende der Aufgabe offen ist.
   *
   * Sie MUSS hier stehen: sie ist strenger als die Frist der Aufgabe, und der Träger kommt mit der
   * Frist im Kopf hierher, die auf der Karte stand. Eine Frist, die man nicht sieht und deren
   * Verstreichen ein Versäumnis erzeugt, ist genau die Sorte, die es nicht geben darf.
   */
  dueAt: string | null;
  /** Zeitzone des Trägers — Fristen sind absolute Zeitpunkte, angezeigt wird in SEINER Zone. */
  tz: string;
  /** Fordert die Aufgabe eine Reihenfolge der Aufnahmen (`Task.proofOrderMatters`)? Nur dann zählt
   *  die Aufnahmezeit, und nur dann ist ein Bild ohne sie ein Fall für die Keyholderin — sonst
   *  verspräche das Formular eine Regel, gegen die der Träger gar nicht gemessen wird. */
  orderMatters: boolean;
  mobileDesktopMode?: boolean;
}) {
  const t = useTranslations("tasks");
  const tc = useTranslations("common");
  const locale = useLocale();
  const apiError = useApiError();
  const router = useRouter();

  // `startTime` steuert nur die EXIF-Abweichungs-Warnung des Hooks; die gibt es hier nicht, weil
  // eine abweichende Aufnahmezeit kein Fehler ist, sondern der geprüfte Sachverhalt.
  const photo = usePhotoUpload({ startTime: new Date().toISOString() });

  const { saving, error, submit } = useEntrySubmit<{ imageUrl: string; imageExifTime: string | null }>(
    async (payload) => {
      const res = await fetch(`/api/tasks/proofs/${proofId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      return res.ok ? { ok: true } : { ok: false, error: apiError(await parseApiErrorCode(res)) };
    },
    () => router.push("/dashboard"),
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!photo.imageUrl) return;
    void submit({ imageUrl: photo.imageUrl, imageExifTime: photo.imageExifTime ?? null });
  }

  return (
    <EntryFormShell
      onSubmit={handleSubmit}
      onCancel={() => router.push("/dashboard")}
      cancelLabel={tc("cancel")}
      actions={
        <Button type="submit" variant="primary" fullWidth loading={saving} disabled={!photo.imageUrl} icon={<Camera size={16} />}>
          {saving ? tc("saving") : t("proofSubmit")}
        </Button>
      }
    >
      <Card variant="semantic" semantic="inspect">
        <p className="text-sm font-semibold text-foreground break-words">{taskTitle}</p>
        <p className="text-sm text-foreground break-words mt-1">{description}</p>
        {code && (
          <p className="text-sm mt-2">
            <span className="text-foreground-muted">{t("proofCodeLabel")}: </span>
            <span className="font-mono tracking-widest text-[var(--color-inspect)] font-semibold">{code}</span>
          </p>
        )}
        {/* Ruhig und nicht in Warnfarbe: hierher kommt der Träger nur, SOLANGE die Frist läuft — ist
            sie um, leitet die Seite ihn gar nicht erst auf dieses Formular (siehe
            `proofSubmitBlockedReason`). Die Warnfarbe trägt die Karte, wenn die Frist verstrichen
            ist; hier wäre sie ein Alarm für den Normalfall. */}
        {dueAt && (
          <p className="text-xs font-medium text-foreground-muted mt-2 tabular-nums">
            {t("proofDueLine", { value: formatDateTime(dueAt, toDateLocale(locale), tz) })}
          </p>
        )}
        <p className="text-xs text-foreground-faint mt-2">
          {orderMatters
            ? t(code ? "proofCaptureHintCode" : "proofCaptureHint")
            : t(code ? "proofCaptureHintCodeNoOrder" : "proofCaptureHintNoOrder")}
        </p>
      </Card>

      <FormField label={t("proofPhotoLabel")} required>
        {photo.imagePreview ? (
          <RotatableImagePreview
            src={photo.imagePreview}
            rotation={photo.rotation}
            onRotateLeft={photo.rotateLeft}
            onRotateRight={photo.rotateRight}
          />
        ) : (
          <>
            <PhotoCapture
              onFile={photo.handleFile}
              uploading={photo.uploading}
              variant="orange"
              mobileDesktopMode={mobileDesktopMode}
            />
            {photo.uploadError && !photo.uploading && (
              <p className="text-xs text-warn font-medium mt-1">{photo.uploadError}</p>
            )}
          </>
        )}
      </FormField>

      {/* Ohne Aufnahmezeit im Bild ist die Reihenfolge nicht belegbar — dann entscheidet die
          Keyholderin. Das gehört gesagt, BEVOR er absendet, nicht erst im Ergebnis.
          Verlangt die Aufgabe gar keine Reihenfolge, gibt es nichts zu belegen: die Warnung entfällt,
          genau wie die Sichtung, vor der sie warnt (`evaluateProofs`). */}
      {orderMatters && photo.imageUrl && !photo.imageExifTime && (
        <Card variant="semantic" semantic="warn">
          <p className="text-sm text-warn-text">{t("proofNoExifWarning")}</p>
        </Card>
      )}

      <FormError message={error} variant="compact" />
    </EntryFormShell>
  );
}
