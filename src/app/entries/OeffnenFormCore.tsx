"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import { toDatetimeLocal, fromDatetimeLocal, toDateLocale } from "@/lib/utils";
import { buildWeekdayLabels } from "@/lib/statsBuilders";
import { type OeffnenGrund } from "@/lib/constants";
import type { ResolvedReason } from "@/lib/reasonsService";
import useTaskHoldGate from "@/app/hooks/useTaskHoldGate";
import type { TaskWarning } from "@/lib/taskIntervals";
import { useEntrySubmit } from "@/app/hooks/useEntrySubmit";
import FormError from "@/app/components/FormError";
import RequiredHint from "@/app/components/RequiredHint";
import DateTimePicker from "@/app/components/DateTimePicker";
import Select from "@/app/components/Select";
import Textarea from "@/app/components/Textarea";
import Button from "@/app/components/Button";
import EntryFormShell from "@/app/components/EntryFormShell";
import Card from "@/app/components/Card";
import RiskConfirmSheet from "@/app/components/RiskConfirmSheet";
import type { OeffnenPayload, CleaningConfig, LockPeriodState, SubmitResult } from "./types";
import type { BoxHold } from "@/lib/boxOpenOutlook";
import { LockClosedIcon, LockOpenIcon } from "@/app/components/lockIcons";

interface Props {
  initial?: { startTime: string; note?: string | null; oeffnenGrund?: string | null };
  /** Owner-scoped, display-ready opening reasons (built-in defaults when the owner has no custom config).
   *  REINIGUNG is always present (its code is frozen); only its label may be customized. */
  grundOptions: ResolvedReason[];
  maxTime?: string;
  tz: string;
  nowDefault: string;
  lockPeriod?: LockPeriodState;
  cleaning?: CleaningConfig;
  /** Serverseitig gefälltes Urteil: hält die Box? null = der Riegel folgt (oder es gibt keine Box). */
  boxHold?: BoxHold | null;
  /** Hat der Sub überhaupt eine Box? `boxHold` taugt dafür nicht: es ist auch `null`, wenn eine Box
   *  existiert und folgt. Entscheidet, ob das Warn-Sheet sagt, dass der Riegel zubleibt. */
  hasBox?: boolean;
  isEdit?: boolean;
  submitFn: (payload: OeffnenPayload) => Promise<SubmitResult>;
  onSuccess?: () => void;
  onCancel?: () => void;
  submitVariant?: "semantic" | "primary";
  submitLabel?: string;
  defaultGrund?: OeffnenGrund;
  /** Laufende Aufgaben, die den KG noch verschlossen verlangen. Öffnen bricht sie ab. */
  taskWarnings?: TaskWarning[];
}

export default function OeffnenFormCore({
  initial, grundOptions, maxTime, tz, nowDefault, lockPeriod, cleaning, boxHold, hasBox = false,
  isEdit = false, submitFn, onSuccess, onCancel, submitVariant = "semantic", submitLabel, defaultGrund,
  taskWarnings = [],
}: Props) {
  const t = useTranslations("openForm");
  const tCommon = useTranslations("common");
  const dl = toDateLocale(useLocale());

  const lockPeriodEndsAt = lockPeriod?.endsAt ?? null;
  const lockPeriodIndefinite = lockPeriod?.indefinite ?? false;
  const cleaningMaxMinutes = cleaning?.maxMinutes ?? 15;
  const cleaningMaxPerDay = cleaning?.maxPerDay ?? 0;
  const cleaningTodayCount = cleaning?.usedToday ?? 0;
  // Ohne `cleaning`-Prop (Admin-Formular, Edit-Seite) gibt es keine Schranke — dort greifen die
  // Sub-Warnungen ohnehin nicht, und ein Grund würde jede Reinigungsöffnung als Bruch anzeigen.
  const cleaningBlock = cleaning?.cleaningBlock ?? null;

  const [startTime, setStartTime] = useState(toDatetimeLocal(initial?.startTime, tz) || nowDefault);
  const [grund, setGrund] = useState<OeffnenGrund | "">((initial?.oeffnenGrund as OeffnenGrund) ?? defaultGrund ?? "");
  const [note, setNote] = useState(initial?.note ?? "");
  const [showWarning, setShowWarning] = useState(false);
  const [showCleaningLimitWarning, setShowCleaningLimitWarning] = useState(false);
  const [forcedCleaning, setForcedCleaning] = useState(false);
  const { saving, error, setError, submit } = useEntrySubmit<OeffnenPayload>(submitFn, onSuccess);

  const isCleaningLimitReached = !initial && cleaningMaxPerDay > 0 && grund === "REINIGUNG" && cleaningTodayCount >= cleaningMaxPerDay;
  const hasActiveLockPeriod = lockPeriodIndefinite || !!(lockPeriodEndsAt && new Date(lockPeriodEndsAt) > new Date());
  // Das Urteil kommt fertig vom Server (`cleaningBlockReason`) — dieselbe Regel, die über den
  // Sperrzeit-Bruch entscheidet. Hier nachzurechnen (User-Flag, Sperr-Flag, Fenster) hiesse, sie ein
  // viertes Mal zu formulieren; genau so ist die Fenster-Prüfung anderswo verlorengegangen.
  const isPermittedCleaningOpening = grund === "REINIGUNG" && cleaningBlock === null;
  const openingBlockedByLockPeriod = hasActiveLockPeriod && !isPermittedCleaningOpening;

  /** Warum steht bei Grund „Reinigung" kein „max. X Minuten" da? Der Server nennt den Grund. */
  const cleaningHintKey =
    cleaningBlock === "lockPeriodForbids" ? "reinigungHintLockPeriod"
    : cleaningBlock === "outsideWindow" ? "reinigungHintOutsideWindow"
    : cleaningBlock === "userNotAllowed" ? "reinigungHintNoConfig"
    : null;
  /** „Nächstes Reinigungsfenster: …" — EIN Satz für beide Stellen, die ihn anhängen (Hinweistext
   *  und Box-Halte-Karte). Der Wochentag steht nur dabei, wenn das Fenster NICHT mehr heute kommt:
   *  „Mo 19:00–20:00" wäre am Montagmittag eine Irreführung. Leerer String = nichts anzuhängen. */
  const nextWindowText = (() => {
    const next = cleaning?.nextWindow;
    if (!next) return "";
    const values = { start: next.start, end: next.end };
    if (next.inDays === 0) return " " + t("boxNextWindow", values);
    return " " + t("boxNextWindowOn", { ...values, day: buildWeekdayLabels(dl)[next.isoDay - 1] });
  })();

  /** Der Reinigungs-Hinweistext (Sheet + Inline-Karte teilen ihn). Ist die Öffnung ausserhalb des
   *  Fensters, hängt „Nächstes Reinigungsfenster …" an — sonst weiss der Sub nicht, wann es wieder
   *  geht. `nextWindow` ist dieselbe Quelle wie die Box-Karte auf der Übersicht. */
  const cleaningHintText =
    (cleaningHintKey ? t(cleaningHintKey) : t("modalSubtextReinigung", { minutes: cleaningMaxMinutes })) +
    (cleaningBlock === "outsideWindow" ? nextWindowText : "");

  // Hält die Box? Das Urteil kommt fertig vom Server (eine Uhr, Sub-Zeitzone). Bei einer erlaubten
  // Reinigungsöffnung folgt der Riegel trotz laufender Sperrzeit (der Tracker setzt den Dauerauftrag
  // in Heimdall aus) — dann wäre die Halte-Warnung falsch. Der Bruch-Fall gehört `openingBlockedByLockPeriod`
  // und wird von der Sperrzeit-Karte plus dem Absende-Sheet abgedeckt.
  const zeigeBoxHalt = !initial && !!boxHold && !openingBlockedByLockPeriod && !isPermittedCleaningOpening;

  async function doSave(forced = false) {
    const payload: OeffnenPayload = {
      type: "OEFFNEN",
      startTime: fromDatetimeLocal(startTime, tz).toISOString(),
      oeffnenGrund: grund,
      note: note.trim() || null,
    };
    if (forced) payload.forcedCleaning = true;
    await submit(payload);
  }

  const taskGate = useTaskHoldGate({ warnings: taskWarnings, tz, onConfirm: () => { void doSave(); } });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!grund) { setError(t("grundRequired")); return; }
    if (!note.trim()) { setError(t("commentRequired")); return; }
    if (isCleaningLimitReached) { setShowCleaningLimitWarning(true); return; }
    if (openingBlockedByLockPeriod) { setShowWarning(true); return; }
    // Zuletzt die Aufgaben-Rückfrage: die anderen Warnungen betreffen das Öffnen selbst, diese die
    // Folge für eine laufende Aufgabe.
    if (taskGate.armed()) return;
    await doSave();
  }

  function handleCleaningLimitConfirm() {
    setShowCleaningLimitWarning(false);
    setForcedCleaning(true);
    if (openingBlockedByLockPeriod) setShowWarning(true);
    else doSave(true);
  }

  const grundSelectOptions = grundOptions.map((r) => ({ value: r.code, label: r.label }));
  // Bestandswert erhalten: ein entfernter/umbenannter Grund (nicht mehr in der Liste) wird als Option
  // ergänzt, damit ein reiner Zeit-Edit nicht an einem fehlenden Match scheitert.
  if (initial?.oeffnenGrund && !grundSelectOptions.some((o) => o.value === initial.oeffnenGrund)) {
    grundSelectOptions.push({ value: initial.oeffnenGrund, label: initial.oeffnenGrund });
  }

  const defaultLabel = isEdit ? tCommon("update") : t("saveBtn");

  return (
    <>
      <RiskConfirmSheet
        open={showCleaningLimitWarning}
        onClose={() => setShowCleaningLimitWarning(false)}
        title={t("reinigungLimitTitle")}
        stayLabel={t("reinigungLimitStay")}
        proceedLabel={t("reinigungLimitOpenAnyway")}
        onProceed={handleCleaningLimitConfirm}
        proceeding={saving}
      >
        <p className="text-fliess text-foreground-muted">
          {t("reinigungLimitSubtext", { count: cleaningTodayCount, max: cleaningMaxPerDay })}
        </p>
      </RiskConfirmSheet>

      <RiskConfirmSheet
        open={showWarning}
        onClose={() => setShowWarning(false)}
        title={grund === "REINIGUNG" ? t("modalTitleReinigung") : t("modalTitle")}
        stayLabel={t("modalStay")}
        // Mit Box trägt der Knopf nur ein — er öffnet nichts. Ohne Box ist der Eintrag die ganze
        // Wahrheit, dort bleibt „Trotzdem öffnen" richtig.
        proceedLabel={t(hasBox ? "modalRecordAnyway" : "modalOpenAnyway")}
        onProceed={() => { setShowWarning(false); doSave(forcedCleaning); }}
        proceeding={saving}
      >
        <p className="text-fliess text-foreground-muted">
          {grund !== "REINIGUNG" ? t("modalSubtext") : cleaningHintText}
        </p>
        {/* Der Eintrag dokumentiert die Öffnung — er vollzieht sie nicht. Bei einem VERBOTENEN
            Öffnen sendet der Server bewusst kein Box-Kommando (sonst vollstreckte das
            Dokumentieren des Verstosses den Verstoss). Ohne diesen Satz liest der Sub
            „Konsequenzen" und denkt ans Strafbuch, nicht an den Notschlüssel. */}
        {hasBox && (
          <p className="text-fliess font-semibold text-warn mt-1">{t("modalBoxStaysLocked")}</p>
        )}
        <p className="text-neben text-sperrzeit font-semibold mt-1">
          {lockPeriodIndefinite
            ? t("modalLockedIndefinite")
            : lockPeriodEndsAt
              ? t("modalLockedUntil", { date: new Date(lockPeriodEndsAt).toLocaleString(dl, { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: tz }) })
              : null}
        </p>
      </RiskConfirmSheet>

      <EntryFormShell
        onSubmit={handleSubmit}
        onCancel={onCancel}
        cancelLabel={tCommon("cancel")}
        actions={
          <Button
            type="submit"
            variant={submitVariant}
            semantic={submitVariant === "semantic" ? "unlock" : undefined}
            fullWidth
            loading={saving}
            icon={submitVariant === "primary" ? <LockOpenIcon size={16} /> : undefined}
          >
            {submitLabel ?? defaultLabel}
          </Button>
        }
      >
        <RequiredHint />

        {taskGate.warningCard}
        {taskGate.modal}

        {openingBlockedByLockPeriod && (
          <Card variant="semantic" semantic="sperrzeit">
            <div className="flex items-start gap-2.5">
              <LockClosedIcon size={16} className="flex-shrink-0 text-sperrzeit mt-0.5" />
              <div>
                <p className="text-fliess font-bold text-sperrzeit-text">{t("lockedWarningTitle")}</p>
                <p className="text-neben text-sperrzeit mt-0.5">
                  {lockPeriodIndefinite
                    ? t("lockedWarningTextIndefinite")
                    : t("lockedWarningText", { date: new Date(lockPeriodEndsAt!).toLocaleString(dl, { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: tz }) })}
                </p>
              </div>
            </div>
          </Card>
        )}

        <DateTimePicker
          label={tCommon("dateTime")}
          value={startTime}
          onChange={(e) => setStartTime(e.target.value)}
          required
          {...(maxTime && { max: maxTime })}
        />

        <Select
          label={t("grundLabel")}
          value={grund}
          onChange={(e) => { setGrund(e.target.value as OeffnenGrund | ""); if (e.target.value) setError(""); }}
          required
          placeholder="–"
          options={grundSelectOptions}
        />

        {zeigeBoxHalt && (
          <Card variant="semantic" semantic="warn" padding="compact">
            <div className="flex items-start gap-2">
              <LockClosedIcon size={15} className="text-warn shrink-0 mt-0.5" />
              <div className="flex flex-col gap-1">
                <p className="text-neben font-bold text-warn-text">{t("boxWontOpenTitle")}</p>
                <p className="text-neben text-warn-text">
                  {boxHold!.until
                    ? t("boxHoldsUntil", { date: new Date(boxHold!.until).toLocaleString(dl, { hour: "2-digit", minute: "2-digit", timeZone: tz }) })
                    : t("boxHoldsIndefinitely")}
                  {nextWindowText}
                </p>
                <p className="text-neben text-warn-text">
                  {grund === "REINIGUNG" ? t("boxStillCountsCleaning") : t("boxStillCounts")}
                </p>
              </div>
            </div>
          </Card>
        )}

        {grund === "REINIGUNG" && (
          <Card variant="semantic" semantic={isCleaningLimitReached ? "warn" : "inspect"} padding="compact">
            <div className="flex flex-col gap-1">
              <p className="text-neben text-inspect-text">{cleaningHintText}</p>
              {cleaningMaxPerDay > 0 && (
                <p className={`text-neben font-semibold ${isCleaningLimitReached ? "text-warn" : "text-inspect-text"}`}>
                  {t("reinigungLimitHint", { count: cleaningTodayCount, max: cleaningMaxPerDay })}
                </p>
              )}
            </div>
          </Card>
        )}

        <Textarea
          label={tCommon("comment")}
          value={note}
          onChange={(e) => { setNote(e.target.value); if (e.target.value.trim()) setError(""); }}
          rows={4}
          required
          placeholder={t("commentPlaceholder")}
        />

        <FormError message={error} />
      </EntryFormShell>
    </>
  );
}
