"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { Camera, FileText } from "lucide-react";
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
import Textarea from "@/app/components/Textarea";
import EntryFormShell from "@/app/components/EntryFormShell";
import { TASK_PROOF_TEXT_MAX_LENGTH } from "@/lib/constants";
import { formatDateTime, toDateLocale } from "@/lib/utils";

/**
 * Der Sub reicht EINEN geforderten Nachweis ein (Issue #39; Text-Nachweis Issue #108).
 *
 * Ein Nachweis fordert ein Foto UND/ODER einen Text — beide unabhängig, beide gleichzeitig möglich.
 * Das Formular zeigt nur, was verlangt ist: die Aufnahme-Fläche bei Foto-Pflicht, das Textfeld bei
 * Text-Pflicht. Bewusst viel schlanker als `PruefungFormCore`: kein Zeitpunkt (die Aufnahmezeit
 * kommt aus den EXIF-Daten und ist gerade NICHT vom Sub setzbar — sonst wäre die Reihenfolge-Prüfung
 * wertlos), kein Live-Check.
 *
 * Der Code wird ANGEZEIGT, nicht eingegeben: er ist die Vorgabe, die der Sub handschriftlich ins
 * Bild bringen muss. Ein Eingabefeld dafür wäre sinnlos — die Prüfung liest ihn aus dem Foto. Der
 * Text-Nachweis dagegen wird von der Keyholderin beurteilt, nicht maschinell.
 */
export default function TaskProofFormCore({
  proofId,
  description,
  requiresPhoto,
  requiresText,
  code,
  taskTitle,
  orderMatters,
  dueAt,
  dueProvisional,
  late,
  tz,
  initialText,
  rejectionNote,
  mobileDesktopMode,
}: {
  proofId: string;
  description: string;
  /** Fordert dieser Nachweis ein Foto? Dann erscheint die Aufnahme-Fläche und sie ist Pflicht. */
  requiresPhoto: boolean;
  /** Fordert dieser Nachweis einen Text? Dann erscheint das Textfeld und es ist Pflicht. Foto und
   *  Text sind unabhängig — beide gleichzeitig möglich. */
  requiresText: boolean;
  /** Null ohne Code-Pflicht — dann legt die Keyholderin den Nachweis selbst vor. */
  code: string | null;
  taskTitle: string;
  /**
   * Fälligkeit dieses Nachweises (ISO): die eigene, sonst das wirksame Ende der Aufgabe.
   *
   * Sie MUSS hier stehen: eine Frist, die man nicht sieht und deren Verstreichen ein Versäumnis
   * erzeugt, ist genau die Sorte, die es nicht geben darf.
   */
  dueAt: string;
  /** `dueAt` ist das spätestmögliche Ende einer Aufgabe im Dauer-Modus, die noch nicht begonnen hat —
   *  die genaue Frist entsteht erst mit dem Anlegen. */
  dueProvisional: boolean;
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
  /** Bisher eingereichter Text — beim Nachbessern vorbefüllt, damit der Träger ERGÄNZT statt leer
   *  zu beginnen (der Fall „ich schreibe die restlichen 5 dazu"). Leer/undefined bei Erst-Einreichung
   *  und bei reinen Foto-Nachweisen (ein Bild lässt sich nicht vorbefüllen). */
  initialText?: string | null;
  /** Begründung einer vorangegangenen Ablehnung — steht oben, damit der Träger beim Nachbessern
   *  weiss, WORAN es lag. Null, wenn nicht (mehr) abgelehnt. */
  rejectionNote?: string | null;
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
  const [proofText, setProofText] = useState(initialText ?? "");

  const { saving, error, submit } = useEntrySubmit<{ imageUrl: string | null; imageExifTime: string | null; proofText: string | null }>(
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

  // Bereit, wenn jede GEFORDERTE Art vorliegt — dieselbe Regel, die der Dienst als `proofKindError`
  // durchsetzt. Der Knopf bleibt gesperrt, statt ein Absenden anzubieten, das der Server abweist.
  const textOk = proofText.trim().length > 0;
  const ready = (!requiresPhoto || !!photo.imageUrl) && (!requiresText || textOk);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready) return;
    void submit({
      imageUrl: requiresPhoto ? photo.imageUrl : null,
      imageExifTime: requiresPhoto ? (photo.imageExifTime ?? null) : null,
      proofText: requiresText ? proofText.trim() : null,
    });
  }

  return (
    <EntryFormShell
      onSubmit={handleSubmit}
      onCancel={() => router.push("/dashboard")}
      cancelLabel={tc("cancel")}
      actions={
        <Button type="submit" variant="primary" fullWidth loading={saving} disabled={!ready} icon={requiresPhoto ? <Camera size={16} /> : <FileText size={16} />}>
          {saving ? tc("saving") : t("proofSubmit")}
        </Button>
      }
    >
      <Card variant="semantic" semantic="inspect">
        <p className="text-fliess font-semibold text-foreground break-words">{taskTitle}</p>
        <p className="text-fliess text-foreground break-words mt-1">{description}</p>
        {requiresPhoto && code && (
          <p className="text-fliess mt-2">
            <span className="text-foreground-muted">{t("proofCodeLabel")}: </span>
            <span className="font-mono tracking-widest text-[var(--color-inspect)] font-semibold">{code}</span>
          </p>
        )}
        {/* Im Normalfall ruhig und nicht in Warnfarbe — die Frist läuft ja noch, und ein Alarm für
            den Regelfall stumpft ab. Ist sie VERSTRICHEN, kommt der Träger seit dem 16.08.2026
            trotzdem hierher (verspätet einreichen ist erlaubt), und dann ist die Warnfarbe die
            ehrliche: die Zeile ist keine Ankündigung mehr, sondern der Grund für den Satz darunter. */}
        <p className={`text-neben font-medium mt-2 tabular-nums ${late ? "text-warn-text" : "text-foreground-muted"}`}>
          {t(dueProvisional ? "proofDueLineProvisional" : "proofDueLine", { value: formatDateTime(dueAt, toDateLocale(locale), tz) })}
        </p>
        {/* Vor dem Auslöser und nicht erst danach: er soll wissen, worauf er sich einlässt, BEVOR er
            fotografiert — sein Nachweis hängt jetzt an einem Urteil, nicht mehr an der Uhr. */}
        {late && <p className="text-neben font-medium text-warn-text mt-1">{t("proofLateHint")}</p>}
        {/* Der Aufnahme-Hinweis gehört zum FOTO; ohne Foto-Pflicht wäre er gegenstandslos. */}
        {requiresPhoto && (
          <p className="text-neben text-foreground-faint mt-2">
            {orderMatters
              ? t(code ? "proofCaptureHintCode" : "proofCaptureHint")
              : t(code ? "proofCaptureHintCodeNoOrder" : "proofCaptureHintNoOrder")}
          </p>
        )}
      </Card>

      {/* Nachbessern nach Ablehnung: der Grund steht ganz oben, BEVOR er neu schreibt/aufnimmt —
          sonst wiederholt er womöglich denselben Fehler. `rejectionNote != null` heisst „abgelehnt"
          (ein leerer Text = ohne Begründung), `undefined` = kein Nachbessern. */}
      {rejectionNote != null && (
        <Card variant="semantic" semantic="warn">
          <p className="text-fliess font-medium text-warn-text">{t(requiresPhoto ? "proofRejectedRetry" : "proofRejectedEdit")}</p>
          {rejectionNote.trim() && (
            <p className="text-neben text-foreground-muted italic break-words mt-1">{rejectionNote}</p>
          )}
        </Card>
      )}

      {requiresPhoto && (
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
      )}

      {/* Der Text-Nachweis: eine schriftliche Antwort, die die Keyholderin wie ein Foto beurteilt.
          Nur wo verlangt — Foto und Text sind unabhängig. */}
      {requiresText && (
        <Textarea
          label={t("proofTextLabel")}
          required
          value={proofText}
          onChange={(e) => setProofText(e.target.value)}
          placeholder={t("proofTextPlaceholder")}
          maxLength={TASK_PROOF_TEXT_MAX_LENGTH}
          rows={6}
        />
      )}

      {/* Ohne Aufnahmezeit im Bild ist die Reihenfolge nicht belegbar — dann entscheidet die
          Keyholderin. Das gehört gesagt, BEVOR er absendet, nicht erst im Ergebnis.
          Verlangt die Aufgabe gar keine Reihenfolge, gibt es nichts zu belegen: die Warnung entfällt,
          genau wie die Sichtung, vor der sie warnt (`evaluateProofs`). */}
      {requiresPhoto && orderMatters && photo.imageUrl && !photo.imageExifTime && (
        <Card variant="semantic" semantic="warn">
          <p className="text-fliess text-warn-text">{t("proofNoExifWarning")}</p>
        </Card>
      )}

      <FormError message={error} variant="compact" />
    </EntryFormShell>
  );
}
