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
  late,
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
  /**
   * Die eigene Fälligkeit dieses Nachweises ist bereits verstrichen — eingereicht werden darf
   * trotzdem, bis die Aufgabe endet, aber nur die Keyholderin entscheidet, ob es noch zählt.
   *
   * Als PROP und nicht aus `dueAt` gegen eine Uhr im Browser erschlossen: die Seite hat den
   * Zeitpunkt bereits gegen die Server-Uhr geprüft, um überhaupt hierher zu leiten. Ein zweiter
   * Vergleich im Client gäbe zwei Antworten auf dieselbe Frage — und beim Hydrieren womöglich zwei
   * verschiedene.
   */
  late: boolean;
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
        <p className="text-fliess font-semibold text-foreground break-words">{taskTitle}</p>
        <p className="text-fliess text-foreground break-words mt-1">{description}</p>
        {code && (
          <p className="text-fliess mt-2">
            <span className="text-foreground-muted">{t("proofCodeLabel")}: </span>
            <span className="font-mono tracking-widest text-[var(--color-inspect)] font-semibold">{code}</span>
          </p>
        )}
        {/* Im Normalfall ruhig und nicht in Warnfarbe — die Frist läuft ja noch, und ein Alarm für
            den Regelfall stumpft ab. Ist sie VERSTRICHEN, kommt der Träger seit dem 16.08.2026
            trotzdem hierher (verspätet einreichen ist erlaubt), und dann ist die Warnfarbe die
            ehrliche: die Zeile ist keine Ankündigung mehr, sondern der Grund für den Satz darunter. */}
        {dueAt && (
          <p className={`text-neben font-medium mt-2 tabular-nums ${late ? "text-warn-text" : "text-foreground-muted"}`}>
            {t("proofDueLine", { value: formatDateTime(dueAt, toDateLocale(locale), tz) })}
          </p>
        )}
        {/* Vor dem Auslöser und nicht erst danach: er soll wissen, worauf er sich einlässt, BEVOR er
            fotografiert — sein Nachweis hängt jetzt an einem Urteil, nicht mehr an der Uhr. */}
        {late && <p className="text-neben font-medium text-warn-text mt-1">{t("proofLateHint")}</p>}
        <p className="text-neben text-foreground-faint mt-2">
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
              <p className="text-neben text-warn font-medium mt-1">{photo.uploadError}</p>
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
          <p className="text-fliess text-warn-text">{t("proofNoExifWarning")}</p>
        </Card>
      )}

      <FormError message={error} variant="compact" />
    </EntryFormShell>
  );
}
