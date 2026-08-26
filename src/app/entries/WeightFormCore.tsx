"use client";

import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Scale } from "lucide-react";
import { toDateLocale, formatDateTime, fromDatetimeLocal, round1 } from "@/lib/utils";
import {
  bmi, parseDecimalInput, plausibleDetection, weightForDisplay, weightText, weightInputToKg,
  WEIGHT_JUMP_CONFIRM_KG,
  type UnitSystem,
} from "@/lib/weight";
import FormError from "@/app/components/FormError";
import FormField from "@/app/components/FormField";
import RequiredHint from "@/app/components/RequiredHint";
import DateTimePicker from "@/app/components/DateTimePicker";
import Input from "@/app/components/Input";
import Textarea from "@/app/components/Textarea";
import Button from "@/app/components/Button";
import Card from "@/app/components/Card";
import ConfirmDialog from "@/app/components/ConfirmDialog";
import PhotoCapture from "@/app/components/PhotoCapture";
import RotatableImagePreview from "@/app/components/RotatableImagePreview";
import EntryFormShell from "@/app/components/EntryFormShell";
import { usePhotoUpload } from "@/app/hooks/usePhotoUpload";
import { useEntrySubmit } from "@/app/hooks/useEntrySubmit";
import type { SubmitResult } from "./types";

export interface WeightPayload {
  /** IMMER metrisch — die Anzeige-Einheit bleibt in der Oberfläche. */
  weightKg: number;
  measuredAt: string;
  imageUrl: string | null;
  imageExifTime: string | null;
  note: string | null;
  /** Was die Waagen-Erkennung gelesen hat, ungeachtet dessen, was der Mensch daraus gemacht hat.
   *  Getrennt gespeichert — nur so ist später sichtbar, ob korrigiert wurde. */
  detectedKg: number | null;
}

interface Props {
  tz: string;
  nowDefault: string;
  /** Anzeige-Einheit dessen, der das Formular ausfüllt. */
  unitSystem: UnitSystem;
  /** Körpergrösse für den mitlaufenden BMI — null, solange keine hinterlegt ist. */
  heightCm: number | null;
  /** Zuletzt gemessener Wert (kg) für die Sprung-Nachfrage; null bei der ersten Messung. */
  lastWeightKg: number | null;
  /**
   * Braucht diese Meldung einen Beleg? Auf dem Träger-Pfad ja — Foto ODER Notiz. Die Keyholderin
   * und die KI tragen ohne Beleg nach: sie stehen nicht vor seiner Waage.
   */
  proofRequired: boolean;
  /** Fenster-Hinweis: „läuft bis 08:00" bzw. „nächstes ab 18:00". Leer = keine Fensterpflicht. */
  windowHint?: string | null;
  mobileDesktopMode?: boolean;
  submitFn: (payload: WeightPayload) => Promise<SubmitResult>;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export default function WeightFormCore({
  tz, nowDefault, unitSystem, heightCm, lastWeightKg, proofRequired, windowHint,
  mobileDesktopMode = false, submitFn, onSuccess, onCancel,
}: Props) {
  const t = useTranslations("weightForm");
  const tc = useTranslations("common");
  const dl = toDateLocale(useLocale());

  const [measuredAt, setMeasuredAt] = useState(nowDefault);
  const [weight, setWeight] = useState("");
  const [note, setNote] = useState("");
  const [jumpAsk, setJumpAsk] = useState<WeightPayload | null>(null);
  // Der fehlende Beleg wird erst nach einem Speicher-Versuch gemeldet. Ein leeres Formular, das
  // sofort mit einer Warnung begrüsst, liest sich wie ein Fehler, den der Nutzer schon gemacht hat.
  const [attempted, setAttempted] = useState(false);

  const {
    imageUrl, imageExifTime, imagePreview, uploading, exifWarning, uploadError,
    rotation, rotateLeft, rotateRight, handleFile, scaleKg, scaleState,
  } = usePhotoUpload({
    startTime: measuredAt,
    exifWarningText: (type, hours) => (type === "missing" ? tc("exifMissing") : tc("exifDeviation", { hours: hours ?? 0 })),
    uploadErrorText: () => tc("uploadError"),
    enableScaleDetection: true,
    scaleUnitSystem: unitSystem,
  });

  /**
   * Die gelesene Zahl, sofern sie überhaupt sein Gewicht sein kann — gemessen an der letzten
   * Messung. Viele Waagen zeigen nach dem Gewicht noch BMI, Fett und Wasseranteil; wer den Moment
   * verpasst, fotografiert eine dieser Zahlen. Sie als Vorschlag ins Feld zu schreiben hiesse, ihn
   * jedes Mal eine falsche Zahl überschreiben zu lassen — und beim Speichern stünde sie als
   * „Widerspruch" in der Liste.
   */
  const detected = plausibleDetection(scaleKg, lastWeightKg);

  // Die gelesene Zahl füllt das leere Feld — sie überschreibt NICHTS, was der Mensch getippt hat.
  // Ein Vorschlag, der eine Korrektur wieder wegräumt, wäre schlimmer als gar keiner.
  const [detectionApplied, setDetectionApplied] = useState<number | null>(null);
  if (detected !== null && detected !== detectionApplied && weight.trim() === "") {
    setDetectionApplied(detected);
    setWeight(String(weightForDisplay(detected, unitSystem)));
  }

  const { saving, error, setError, submit } = useEntrySubmit<WeightPayload>(submitFn, onSuccess);

  const unitLabel = unitSystem === "imperial" ? tc("unitLbs") : tc("unitKg");
  const typed = parseDecimalInput(weight);
  const kg = typed === null ? null : weightInputToKg(typed, unitSystem);
  const liveBmi = kg === null ? null : bmi(kg, heightCm);
  // Beleg fehlt: weder Foto noch Notiz. Der Server prüft dasselbe (`WEIGHT_PROOF_REQUIRED`) — hier
  // steht es nur, damit der Träger es sieht, BEVOR er auf Speichern drückt.
  const proofMissing = proofRequired && !imageUrl && !note.trim();

  function payloadOf(weightKg: number): WeightPayload {
    return {
      weightKg,
      measuredAt: fromDatetimeLocal(measuredAt, tz).toISOString(),
      imageUrl: imageUrl || null,
      imageExifTime: imageExifTime || null,
      note: note.trim() || null,
      detectedKg: detected,
    };
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setAttempted(true);
    if (kg === null) { setError(t("weightMissing")); return; }
    // Fehlt der Beleg, gar nicht erst senden: der Server lehnt mit demselben Grund ab, und ein
    // Rundweg nur für eine Meldung, die schon feststeht, lässt den Knopf grundlos hängen.
    if (proofMissing) return;
    const payload = payloadOf(kg);
    // Sprung-Nachfrage: fängt den Zahlendreher (87,5 statt 78,5) und die falsch abgelesene Anzeige.
    // Eine Frage, keine Schranke — wer wirklich vier Kilo zugenommen hat, bestätigt und ist durch.
    if (lastWeightKg !== null && Math.abs(kg - lastWeightKg) > WEIGHT_JUMP_CONFIRM_KG) {
      setJumpAsk(payload);
      return;
    }
    await submit(payload);
  }

  return (
    <>
      <EntryFormShell
        onSubmit={handleSubmit}
        onCancel={onCancel}
        cancelLabel={tc("cancel")}
        actions={
          <Button type="submit" variant="primary" fullWidth loading={saving} disabled={uploading} icon={<Scale size={16} />}>
            {t("saveBtn")}
          </Button>
        }
      >
        <RequiredHint />

        {windowHint && (
          <Card padding="compact">
            <p className="text-fliess text-foreground-muted">{windowHint}</p>
          </Card>
        )}

        <DateTimePicker
          label={tc("dateTime")}
          value={measuredAt}
          onChange={(e) => setMeasuredAt(e.target.value)}
          required
          max={nowDefault}
        />

        <Input
          label={`${t("weight")} (${unitLabel})`}
          type="number"
          inputMode="decimal"
          step="0.1"
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
          required
          hint={liveBmi !== null ? t("bmiHint", { bmi: round1(liveBmi) }) : undefined}
        />

        <FormField label={tc("photo")} required={proofRequired}>
          {imagePreview ? (
            <div className="flex items-start gap-4">
              <RotatableImagePreview src={imagePreview} rotation={rotation} onRotateLeft={rotateLeft} onRotateRight={rotateRight} />
              <div className="flex flex-col gap-2 flex-1 pt-1">
                {imageExifTime && <p className="text-neben text-foreground-faint">{tc("exifDate")}: {formatDateTime(imageExifTime, dl, tz)}</p>}
                {exifWarning && !uploading && <p className="text-neben text-warn font-medium">{exifWarning}</p>}
                <PhotoCapture onFile={handleFile} uploading={uploading} compact mobileDesktopMode={mobileDesktopMode} />
              </div>
            </div>
          ) : (
            <>
              <PhotoCapture onFile={handleFile} uploading={uploading} mobileDesktopMode={mobileDesktopMode} />
              {uploadError && !uploading && <p className="text-neben text-warn font-medium mt-1">{uploadError}</p>}
              {proofRequired && <p className="text-neben text-foreground-faint mt-1">{t("photoOrNote")}</p>}
            </>
          )}
        </FormField>

        {scaleState === "detecting" && (
          <p className="text-neben text-foreground-muted">{t("detecting")}</p>
        )}
        {/* „Gelesen: X" nur, wenn X auch als Gewicht durchgeht. Sonst gilt dieselbe Meldung wie bei
            einem unscharfen Foto — die Anzeige war nicht lesbar, und er trägt von Hand ein. */}
        {scaleState === "detected" && detected !== null && (
          <p className="text-neben text-foreground-muted">
            {t("detected", { value: `${weightText(detected, unitSystem, dl)} ${unitLabel}` })}
          </p>
        )}
        {(scaleState === "not-detected" || (scaleState === "detected" && detected === null)) && (
          <p className="text-neben text-foreground-faint">{t("notDetected")}</p>
        )}

        <Textarea
          label={tc("commentOptional")}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
        />

        {attempted && proofMissing && <p className="text-neben text-warn font-medium">{t("proofMissing")}</p>}

        <FormError message={error} />
      </EntryFormShell>

      <ConfirmDialog
        open={jumpAsk !== null}
        title={t("jumpTitle")}
        message={
          lastWeightKg !== null && jumpAsk
            // Die Differenz in SEINER Einheit — wer in Pfund wiegt, liest „6,6 lbs", nicht „3 kg".
            ? t("jumpMessage", {
                diff: weightText(Math.abs(jumpAsk.weightKg - lastWeightKg), unitSystem, dl),
                unit: unitLabel,
              })
            : ""
        }
        confirmLabel={t("jumpConfirm")}
        loading={saving}
        onConfirm={() => { const p = jumpAsk; setJumpAsk(null); if (p) submit(p); }}
        onCancel={() => setJumpAsk(null)}
      />
    </>
  );
}
