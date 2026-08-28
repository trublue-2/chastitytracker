"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ClipboardCheck, WifiOff } from "lucide-react";
import { toDatetimeLocal, fromDatetimeLocal, formatDateTime, toDateLocale } from "@/lib/utils";
import { usePhotoUpload } from "@/app/hooks/usePhotoUpload";
import { useEntrySubmit } from "@/app/hooks/useEntrySubmit";
import PhotoCapture from "@/app/components/PhotoCapture";
import RotatableImagePreview from "@/app/components/RotatableImagePreview";
import FormError from "@/app/components/FormError";
import RequiredHint from "@/app/components/RequiredHint";
import FormField from "@/app/components/FormField";
import DateTimePicker from "@/app/components/DateTimePicker";
import Input from "@/app/components/Input";
import Textarea from "@/app/components/Textarea";
import Button from "@/app/components/Button";
import EntryFormShell from "@/app/components/EntryFormShell";
import ConfirmDialog from "@/app/components/ConfirmDialog";
import BoxPhotoField from "@/app/components/BoxPhotoField";
import Card from "@/app/components/Card";
import Badge from "@/app/components/Badge";
import Spinner from "@/app/components/Spinner";
import InspectionCodePushButton from "@/app/components/InspectionCodePushButton";
import type { PruefungPayload, SubmitResult } from "./types";
import { formatVerifyReason, type VerifyReason } from "@/lib/verifyReason";
import { INSPECTION_CODE_LENGTH, isValidInspectionCode } from "@/lib/constants";
import { fetchWithTimeout, UPLOAD_TIMEOUT_MS } from "@/lib/apiClient";

/** Ruhezeit (ms) nach Tippen/Rotieren, bevor ein Live-Code-Check gefeuert wird (entprellt Abbruch-Stürme). */
const LIVE_CHECK_DEBOUNCE_MS = 600;

/** Titel/Hint-i18n-Keys für die zwei strukturgleichen Hinweis-Cards (Policy-Block bzw. Prüf-Fehler). */
const HINT_CARDS = {
  policy: { title: "policyError", hint: "policyErrorHint" },
  error: { title: "verifyError", hint: "verifyErrorHint" },
} as const;

/** Titel/Hint-i18n-Keys für die zwei strukturgleichen Mismatch-Cards (Code bzw. Siegel-Nummer). */
const MISMATCH_CARDS = {
  mismatch: { title: "codeMismatch", hint: "codeMismatchHint" },
  sealMismatch: { title: "sealMismatch", hint: "sealMismatchHint" },
} as const;

interface Props {
  initial?: {
    startTime: string;
    imageUrl?: string | null;
    imageExifTime?: string | null;
    note?: string | null;
    kontrollCode?: string | null;
    verifikationStatus?: string | null;
  };
  minTime?: string;
  tz: string;
  nowDefault: string;
  initialCode?: string;
  initialKommentar?: string;
  /** Aktives Siegel: die Siegel-Nummer muss zusätzlich zum Code auf dem Foto lesbar sein. */
  sealRequired?: boolean;
  /** Verlangt das getragene Gerät einen Kontroll-Code? false → weder Anzeige noch Eingabefeld, und
   *  es wird keiner mitgeschickt. Default true = Bestandsverhalten. */
  codeRequired?: boolean;
  /** ZIEL der Kontrolle: das kontrollierte Gerät (Trage-Kontrolle). null/weggelassen = KG. */
  targetDeviceId?: string | null;
  /** Name des Ziels für die Anzeige („Kontrolle: Plug") — null beim KG. */
  targetLabel?: string | null;
  /** Id der ANGEFORDERTEN Kontrolle, deren Code hier steht — schaltet den Knopf frei, der den Code
   *  noch einmal als Meldung schickt. Fehlt bewusst in zwei Fällen: bei einer freiwilligen
   *  Selbstkontrolle (der Code entsteht beim Aufbau der Seite und steht nirgends, es gibt nichts
   *  nachzuschicken) und auf dem Keyholder-Pfad (die Meldung ginge an den Sub, und der ist nicht,
   *  wer hier auf den Knopf drückt). */
  codePushControlId?: string | null;
  /**
   * Darf der Code auch OHNE Anforderung als Meldung verschickt werden? — die Selbstkontrolle.
   *
   * Eine eigene Frage und nicht bloss „`codePushControlId` fehlt": die id fehlt in ZWEI Fällen, und
   * nur einer davon darf den Knopf sehen. Auf dem Keyholder-Pfad fehlt sie ebenfalls — dort ginge
   * die Meldung an den, der gerade tippt, also an die Keyholderin statt an den Träger. Aus dem
   * Fehlen allein zu schliessen, es sei eine Selbstkontrolle, wäre genau dieser Fehler.
   */
  selfCodePush?: boolean;
  /** ZIEL der Kontrolle als Kategorie (null = KG) — nur für den Code-Push der Selbstkontrolle: die
   *  Meldung muss auf DASSELBE Formular führen, sonst beantwortet das eingereichte Foto eine andere
   *  Kontrolle als die gemeinte. `targetDeviceId` daneben benennt das Gerät, nicht das Ziel. */
  categoryId?: string | null;
  mobileDesktopMode?: boolean;
  /** Sub hat eine Heimdall-Box: zusätzliches Foto durchs Sichtfenster, das den Schlüssel zeigt.
   *  Nur beim Neuanlegen — beim Bearbeiten wird kein Nachweis nachgereicht. */
  boxConfirm?: boolean;
  isEdit?: boolean;
  submitFn: (payload: PruefungPayload) => Promise<SubmitResult>;
  onSuccess?: () => void;
  onCancel?: () => void;
  submitVariant?: "semantic" | "primary";
  submitLabel?: string;
}

export default function PruefungFormCore({
  initial, minTime, tz, nowDefault, initialCode, initialKommentar, sealRequired, codeRequired = true, mobileDesktopMode,
  targetDeviceId = null, targetLabel = null, codePushControlId = null, selfCodePush = false, categoryId = null,
  boxConfirm = false, isEdit = false, submitFn, onSuccess, onCancel, submitVariant = "semantic", submitLabel,
}: Props) {
  const t = useTranslations("inspectionForm");
  const tc = useTranslations("common");
  const tOffline = useTranslations("offline");
  // Box-Foto + seine Rückfrage teilen die Texte mit dem Verschluss-Formular (lockForm) — es ist
  // derselbe Nachweis, er darf nicht je Formular anders heissen.
  const tLock = useTranslations("lockForm");
  const dl = toDateLocale(useLocale());

  const [isOnline, setIsOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);
  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  const [startTime, setStartTime] = useState(toDatetimeLocal(initial?.startTime, tz) || nowDefault);
  const [note, setNote] = useState(initial?.note ?? "");
  const [kontrollCode, setKontrollCode] = useState(initial?.kontrollCode ?? initialCode ?? "");
  const [verifyStatus, setVerifyStatus] = useState<"pending" | "match" | "mismatch" | "sealMismatch" | "error" | "policy" | null>(null);
  const [verifyReason, setVerifyReason] = useState<{ code: VerifyReason; detected?: string } | null>(null);
  const [aiMatch, setAiMatch] = useState<boolean | null>(null);
  const lastVerifiedKey = useRef<string>("");
  const { saving, error, setError, submit } = useEntrySubmit<PruefungPayload>(submitFn, onSuccess);

  const {
    imageUrl, imageExifTime, imagePreview, uploading, exifWarning, uploadError,
    rotation, rotateLeft, rotateRight, handleFile: uploadFile,
  } = usePhotoUpload({
    startTime,
    exifWarningText: (type, hours) =>
      type === "deviation" ? tc("exifDeviation", { hours: hours ?? 0 }) : tc("exifMissing"),
    uploadErrorText: () => tc("uploadError"),
    initial,
  });

  // ── Box-Foto: Schlüssel im Sichtfenster ──
  // Eigene Upload-Instanz ohne Code-/Siegel-Prüfung: hier wird nichts client-seitig beurteilt,
  // das Schlüssel-Urteil fällt server-seitig nach dem Speichern.
  const boxPhoto = usePhotoUpload({
    startTime,
    enableSealDetection: false,
    enableDeviceDetection: false,
    uploadErrorText: () => tc("uploadError"),
  });
  const [pendingBoxConfirm, setPendingBoxConfirm] = useState(false);

  function handleFile(file: File) {
    setError("");
    setVerifyStatus(null);
    setVerifyReason(null);
    setAiMatch(null);
    uploadFile(file);
  }

  useEffect(() => {
    const key = `${kontrollCode}|${imageUrl}|${rotation}`;
    if (kontrollCode.length < INSPECTION_CODE_LENGTH.min || !imageUrl || key === lastVerifiedKey.current) return;

    // Entprellen: erst nach kurzer Tipp-/Rotier-Ruhe einen Live-Check feuern. Verhindert einen Sturm
    // aus Request-Abbrüchen (AbortError) und unnötiger Vision-Last bei jedem Tastendruck/Re-Render.
    const controller = new AbortController();
    const timer = setTimeout(() => {
      lastVerifiedKey.current = key;
      setVerifyStatus("pending");
      setVerifyReason(null);
      setAiMatch(null);
      // Bild-Frist: dahinter steckt eine Vision-Abfrage. Der eigene Controller bleibt wirksam —
      // `fetchWithTimeout` hängt sein Zeitlimit DANEBEN, statt das Signal zu überschreiben.
      fetchWithTimeout(
        "/api/verify-kontrolle",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageUrl, expectedCode: kontrollCode, rotation }),
          signal: controller.signal,
        },
        UPLOAD_TIMEOUT_MS,
      )
        .then((r) => r.json())
        .then((v) => {
          if (v.error === "policy") setVerifyStatus("policy");
          else if (v.error) setVerifyStatus("error");
          else {
            // Dual-Prüfung: schlägt speziell die Siegel-Nummer fehl (Code passt oder nicht), einen
            // siegel-spezifischen Status zeigen statt des generischen „Code nicht erkannt".
            setVerifyStatus(v.match ? "match" : (v.sealMatch === false ? "sealMismatch" : "mismatch"));
            // Für die „falsch erkannt"-Gründe die passende erkannte Nummer mitgeben (Siegel bzw. Code).
            const detected = v.reason === "sealWrong" ? v.sealDetected : v.detected;
            setVerifyReason(v.reason ? { code: v.reason, detected: detected ?? undefined } : null);
            setAiMatch(!!v.match);
          }
        })
        .catch((err) => { if (err.name !== "AbortError") setVerifyStatus("error"); });
    }, LIVE_CHECK_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
      // Abgebrochenen (noch nicht abgeschlossenen) Check freigeben → erneutes Prüfen bei Rückkehr möglich.
      if (lastVerifiedKey.current === key) lastVerifiedKey.current = "";
    };
  }, [kontrollCode, imageUrl, rotation]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!imageUrl) { setError(t("photoRequired")); return; }
    // Box-Foto fehlt: nachfragen statt blockieren — die Kontrolle selbst ist gültig, nur der
    // Schlüssel-Nachweis fehlt. Dieselbe Rückfrage wie im Verschluss-Formular.
    if (boxConfirm && !boxPhoto.imageUrl) { setPendingBoxConfirm(true); return; }
    await doSubmit();
  }

  async function doSubmit() {
    setPendingBoxConfirm(false);
    await submit({
      type: "PRUEFUNG",
      startTime: fromDatetimeLocal(startTime, tz).toISOString(),
      imageUrl: imageUrl || null,
      imageExifTime: imageExifTime || null,
      note: note.trim() || null,
      // Ohne Code-Pflicht keinen mitschicken: die Anforderung hat keinen, es gäbe nichts zu
      // vergleichen — und ein Wert hier liesse den Server einen Code-Vergleich versuchen.
      kontrollCode: codeRequired ? (kontrollCode || null) : null,
      // Nur bei Trage-Kontrollen gesetzt; beim KG bleibt es weg (dort steht das Gerät am VERSCHLUSS).
      deviceId: targetDeviceId ?? null,
      // KEIN `verifikationStatus`: den setzt ausschliesslich der Server (`initialVerifikationStatus`
      // beim Anlegen, danach `runInspectionVerification` bzw. das Urteil des Keyholders). Beim
      // Anlegen wurde der mitgeschickte Wert ohnehin verworfen — beim BEARBEITEN dagegen schrieb
      // ihn die Entry-Route für einen erhabenen Bearbeiter durch: korrigierte die Keyholderin die
      // Zeit einer bestätigten Kontrolle, war die Bestätigung danach still weg, weil `aiMatch` bei
      // jedem Öffnen des Formulars wieder null ist.
      imageRotation: rotation,
      ...(boxConfirm && boxPhoto.imageUrl ? { boxImageUrl: boxPhoto.imageUrl, boxImageRotation: boxPhoto.rotation } : {}),
    });
  }

  const defaultLabel = isEdit ? tc("update") : t("saveBtn");
  const hasPrefilledCode = !!(initialCode || initial?.kontrollCode);
  // Der Knopf für den selbst gewählten Code: nur auf dem eigenen Weg des Trägers und nur beim
  // Erfassen. Eine BEARBEITUNG holt keinen Code mehr auf die Uhr — das Foto liegt längst vor, und
  // der Code darin ändert sich durch das Nachtragen einer Notiz nicht.
  const canPushOwnCode = selfCodePush && !isEdit;
  // EIN Ausdruck für beide Stellen, an denen ein Code steht (die Karte mit dem gewürfelten und das
  // Eingabefeld für den getippten). Zweimal hingeschrieben könnten die beiden Zweige auseinander
  // laufen — und die Bedingung ist genau die, die den Keyholder-Pfad aussperrt.
  //
  // GESPERRT statt entfernt, solange der Code nicht taugt: ein Knopf, der beim Tippen verschwindet,
  // nimmt seine Sperrfrist mit — und der Druck nach der Korrektur holt sich den 429 vom Server,
  // also genau die Absage, gegen die die Sperre gebaut ist.
  const ownCodePushButton = canPushOwnCode
    ? <InspectionCodePushButton
        code={kontrollCode}
        categoryId={categoryId}
        disabled={!isValidInspectionCode(kontrollCode)}
      />
    : null;

  return (
    <EntryFormShell
      onSubmit={handleSubmit}
      onCancel={onCancel}
      cancelLabel={tc("cancel")}
      actions={
        <Button
          type="submit"
          variant={submitVariant}
          semantic={submitVariant === "semantic" ? "inspect" : undefined}
          fullWidth
          loading={saving || uploading || boxPhoto.uploading}
          icon={submitVariant === "primary" ? <ClipboardCheck size={16} /> : undefined}
        >
          {submitLabel ?? defaultLabel}
        </Button>
      }
    >
      {!isOnline && (
        <Card variant="semantic" semantic="warn">
          <div className="flex items-start gap-2.5">
            <WifiOff size={16} className="flex-shrink-0 text-warn mt-0.5" />
            <p className="text-fliess text-warn-text">{tOffline("photoRequiresConnection")}</p>
          </div>
        </Card>
      )}

      {/* Das ZIEL: bei einer Trage-Kontrolle muss im Foto ein anderes Gerät zu sehen sein als beim
          KG — ohne diese Zeile wüsste der Sub nicht, welche seiner offenen Kontrollen er gerade
          beantwortet. */}
      {targetLabel && (
        <Card padding="compact">
          <div className="flex items-center gap-3">
            <Badge variant="inspect" label={t("target")} size="sm" />
            <span className="font-semibold text-foreground">{targetLabel}</span>
          </div>
        </Card>
      )}

      {initialKommentar && (
        <Card variant="semantic" semantic="warn">
          <p className="text-rubrik font-semibold text-warn-text uppercase tracking-wider mb-1">{t("instruction")}</p>
          <p className="text-fliess text-warn-text">{initialKommentar}</p>
        </Card>
      )}

      {hasPrefilledCode && (
        <Card padding="compact">
          {/* `flex-wrap`, weil die Keyholderin die Codelänge bestimmt: bei acht Ziffern
              (`INSPECTION_CODE_LENGTH.max`) misst die Zeile auf 390 px rund 342 px gegen 334 px
              verfügbare Breite, und die Ziffernkette hat keine Umbruchstelle. Lieber ein Umbruch
              als ein Code, der aus dem Bild läuft — er ist das Einzige, was auf dieses Foto muss. */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <Badge variant="inspect" label={t("controlCode")} size="sm" />
            <span className="font-mono font-bold text-[1.5rem] leading-tight text-inspect tracking-widest">
              {kontrollCode || "–"}
            </span>
            {/* Der Weg, den Code zurück auf die Smartwatch zu holen — hier, weil das Handy gleich
                die Kamera wird und seinen eigenen Bildschirm nicht abfotografieren kann.

                Die SELBSTKONTROLLE hat denselben Bedarf und bis v5.1.3 keinen Knopf: ihr Code wird
                beim Öffnen des Formulars gewürfelt und steht in keiner Anforderung, also gab es
                nichts zu nennen. Sie schickt ihn deshalb selbst mit. Ohne zweite Prüfung auf
                `kontrollCode`: in diesem Block ist er per Konstruktion gesetzt (`hasPrefilledCode`
                liest genau die Werte, aus denen er initialisiert wird). */}
            {codePushControlId
              ? <InspectionCodePushButton controlId={codePushControlId} />
              : ownCodePushButton}
          </div>
          {/* Was mit der Zahl zu tun ist — an der ANZEIGE, nicht am Eingabefeld.
              Der Hinweis hing bisher nur am `Input` darunter, also ausgerechnet im Fall der
              freiwilligen Selbstkontrolle. Kam der Code aus einer Anforderung — mit Frist, mit
              Strafe —, stand er als grosse Zahl ohne ein Wort dazu da, und der einzige Ausweg war
              die FAQ ausserhalb der App, bei laufender Frist und ohne Rückweg. */}
          <p className="text-neben text-foreground-muted mt-2">{t("controlCodeWriteHint")}</p>
          {sealRequired && (
            <p className="text-neben text-foreground-muted mt-1">{t("sealAlsoRequired")}</p>
          )}
        </Card>
      )}

      <RequiredHint />

      <DateTimePicker
        label={tc("dateTime")}
        value={startTime}
        onChange={(e) => setStartTime(e.target.value)}
        required
        {...(minTime && { min: minTime })}
      />

      <FormField label={tc("photo")} required>
        {imagePreview ? (
          <div className="flex items-start gap-4">
            <RotatableImagePreview src={imagePreview} rotation={rotation} onRotateLeft={rotateLeft} onRotateRight={rotateRight} />
            <div className="flex flex-col gap-2 flex-1 pt-1">
              {imageExifTime && <p className="text-neben text-foreground-faint">{tc("exifDate")}: {formatDateTime(imageExifTime, dl, tz)}</p>}
              {exifWarning && !uploading && <p className="text-neben text-warn font-medium">{exifWarning}</p>}
              <PhotoCapture onFile={handleFile} uploading={uploading} variant="orange" compact mobileDesktopMode={mobileDesktopMode} />
            </div>
          </div>
        ) : (
          <>
            <PhotoCapture onFile={handleFile} uploading={uploading} variant="orange" mobileDesktopMode={mobileDesktopMode} />
            {uploadError && !uploading && <p className="text-neben text-warn font-medium mt-1">{uploadError}</p>}
          </>
        )}
      </FormField>

      {verifyStatus === "pending" && (
        <div className="flex items-center gap-2 text-fliess text-foreground-muted">
          <Spinner size="sm" /> {t("verifying")}
        </div>
      )}
      {verifyStatus === "match" && <Badge variant="ok" label={t("codeMatch")} />}
      {(verifyStatus === "mismatch" || verifyStatus === "sealMismatch") && (
        <Card variant="semantic" semantic="warn">
          <p className="text-fliess text-warn-text font-medium">{t(MISMATCH_CARDS[verifyStatus].title)}</p>
          {verifyReason && <p className="text-neben text-warn mt-0.5">{formatVerifyReason(verifyReason.code, verifyReason.detected, t)}</p>}
          <p className="text-neben text-warn mt-1">{t(MISMATCH_CARDS[verifyStatus].hint)}</p>
        </Card>
      )}
      {(verifyStatus === "policy" || verifyStatus === "error") && (
        <Card padding="compact">
          <p className="text-fliess text-foreground-muted font-medium">{t(HINT_CARDS[verifyStatus].title)}</p>
          <p className="text-neben text-foreground-faint mt-0.5">{t(HINT_CARDS[verifyStatus].hint)}</p>
        </Card>
      )}

      {!codeRequired && (
        <p className="text-neben text-foreground-muted">{t("noCodeNeeded")}</p>
      )}

      {!hasPrefilledCode && codeRequired && (
        <div className="flex flex-col gap-2">
          <Input
            label={t("controlCode")}
            hint={t("controlCodeHint")}
            type="text"
            value={kontrollCode}
            onChange={(e) => setKontrollCode(e.target.value.replace(/\D/g, "").slice(0, INSPECTION_CODE_LENGTH.max))}
            maxLength={INSPECTION_CODE_LENGTH.max}
            placeholder="–"
            /* NICHT `text-kennzahl`: das ist `clamp(1.5rem, 6.4vw, 2rem)` und damit ab rund 500 px
               Fensterbreite 32 px — in einem Feld, dem `Input` mit `h-11` feste 44 px gibt, wird
               der Zeichenkörper der Monoschrift dann unten abgeschnitten. Die Skala hat zwischen
               `zeile` (16) und `kennzahl` (24–32) keine Stufe; hier zählt, dass die Ziffern gross
               und STABIL sind, nicht dass sie mitwachsen. */
            className="font-mono tracking-widest text-inspect font-bold text-[1.25rem]"
          />
          {/* Sobald die Zahl als Code taugt, steht der Knopf da — vorher schickte er etwas, das die
              Route ohnehin abweist. Auch hier gilt: das Handy wird gleich die Kamera, der Code
              gehört auf den zweiten Bildschirm. */}
          {ownCodePushButton}
        </div>
      )}

      {/* Zweites Foto: Schlüssel im Sichtfenster. Nur beim Neuanlegen — eine Bearbeitung reicht
          keinen Nachweis nach. */}
      {boxConfirm && !isEdit && <BoxPhotoField photo={boxPhoto} mobileDesktopMode={mobileDesktopMode} />}

      <Textarea
        label={tc("noteOptional")}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={3}
      />

      <FormError message={error} />

      <ConfirmDialog
        open={pendingBoxConfirm}
        title={tLock("confirmNoBoxPhotoTitle")}
        message={tLock("confirmNoBoxPhotoText")}
        confirmLabel={tLock("confirmSaveAnyway")}
        onConfirm={doSubmit}
        onCancel={() => setPendingBoxConfirm(false)}
      />
    </EntryFormShell>
  );
}
