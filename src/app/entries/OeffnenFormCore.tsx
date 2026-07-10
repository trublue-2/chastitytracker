"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { AlertCircle, Lock, LockOpen } from "lucide-react";
import { toDatetimeLocal, fromDatetimeLocal, toDateLocale } from "@/lib/utils";
import { type OeffnenGrund } from "@/lib/constants";
import type { ResolvedReason } from "@/lib/reasonsService";
import { useEntrySubmit } from "@/app/hooks/useEntrySubmit";
import FormError from "@/app/components/FormError";
import RequiredHint from "@/app/components/RequiredHint";
import DateTimePicker from "@/app/components/DateTimePicker";
import Select from "@/app/components/Select";
import Textarea from "@/app/components/Textarea";
import Button from "@/app/components/Button";
import Card from "@/app/components/Card";
import Sheet from "@/app/components/Sheet";
import type { OeffnenPayload, ReinigungConfig, SperrzeitState, SubmitResult } from "./types";
import type { BoxHold } from "@/lib/boxOpenOutlook";

interface Props {
  initial?: { startTime: string; note?: string | null; oeffnenGrund?: string | null };
  /** Owner-scoped, display-ready opening reasons (built-in defaults when the owner has no custom config).
   *  REINIGUNG is always present (its code is frozen); only its label may be customized. */
  grundOptions: ResolvedReason[];
  maxTime?: string;
  tz: string;
  nowDefault: string;
  sperrzeit?: SperrzeitState;
  reinigung?: ReinigungConfig;
  /** Serverseitig gefälltes Urteil: hält die Box? null = der Riegel folgt (oder es gibt keine Box). */
  boxHold?: BoxHold | null;
  isEdit?: boolean;
  submitFn: (payload: OeffnenPayload) => Promise<SubmitResult>;
  onSuccess?: () => void;
  onCancel?: () => void;
  submitVariant?: "semantic" | "primary";
  submitLabel?: string;
  defaultGrund?: OeffnenGrund;
}

export default function OeffnenFormCore({
  initial, grundOptions, maxTime, tz, nowDefault, sperrzeit, reinigung, boxHold,
  isEdit = false, submitFn, onSuccess, onCancel, submitVariant = "semantic", submitLabel, defaultGrund,
}: Props) {
  const t = useTranslations("openForm");
  const tCommon = useTranslations("common");
  const dl = toDateLocale(useLocale());

  const sperrzeitEndetAt = sperrzeit?.endetAt ?? null;
  const sperrzeitUnbefristet = sperrzeit?.unbefristet ?? false;
  const sperrzeitReinigungErlaubt = sperrzeit?.reinigungErlaubt ?? false;
  const reinigungErlaubt = reinigung?.erlaubt ?? false;
  const reinigungMaxMinuten = reinigung?.maxMinuten ?? 15;
  const reinigungMaxProTag = reinigung?.maxProTag ?? 0;
  const reinigungHeuteAnzahl = reinigung?.heuteAnzahl ?? 0;
  // Ohne `reinigung`-Prop (Admin-Formular) gibt es keine Fenster-Schranke — dort greifen die
  // Sub-Warnungen ohnehin nicht, und ein `false` würde jede Reinigungsöffnung als Bruch anzeigen.
  const reinigungWindowOpen = reinigung?.windowOpen ?? true;

  const [startTime, setStartTime] = useState(toDatetimeLocal(initial?.startTime, tz) || nowDefault);
  const [grund, setGrund] = useState<OeffnenGrund | "">((initial?.oeffnenGrund as OeffnenGrund) ?? defaultGrund ?? "");
  const [note, setNote] = useState(initial?.note ?? "");
  const [showWarning, setShowWarning] = useState(false);
  const [showReinigungLimitWarning, setShowReinigungLimitWarning] = useState(false);
  const [forcedReinigung, setForcedReinigung] = useState(false);
  const { saving, error, setError, submit } = useEntrySubmit<OeffnenPayload>(submitFn, onSuccess);

  const isReinigungLimitReached = !initial && reinigungMaxProTag > 0 && grund === "REINIGUNG" && reinigungHeuteAnzahl >= reinigungMaxProTag;
  const isGesperrt = sperrzeitUnbefristet || !!(sperrzeitEndetAt && new Date(sperrzeitEndetAt) > new Date());
  // Eine REINIGUNG-Öffnung verletzt die Sperre NICHT, wenn User und DIESE Sperrzeit Reinigung
  // erlauben UND ein Fenster offen ist (spiegelt `isAllowedCleaningOpen` in lib/queries.ts, die
  // serverseitige Entscheidung). Ausserhalb eines konfigurierten Fensters ist die Öffnung ein
  // Bruch: Sperrzeit fällt, Strafbuch bucht, Box bleibt zu.
  const istErlaubteReinigungsOeffnung =
    grund === "REINIGUNG" && reinigungErlaubt && sperrzeitReinigungErlaubt && reinigungWindowOpen;
  const isGesperrtBlockiert = isGesperrt && !istErlaubteReinigungsOeffnung;

  // Hält die Box? Das Urteil kommt fertig vom Server (eine Uhr, Sub-Zeitzone). Bei einer erlaubten
  // Reinigungsöffnung folgt der Riegel trotz laufender Sperrzeit (der Tracker setzt den Dauerauftrag
  // in Heimdall aus) — dann wäre die Halte-Warnung falsch. Der Bruch-Fall gehört `isGesperrtBlockiert`
  // und wird von der Sperrzeit-Karte plus dem Absende-Sheet abgedeckt.
  const zeigeBoxHalt = !initial && !!boxHold && !isGesperrtBlockiert && !istErlaubteReinigungsOeffnung;

  async function doSave(forced = false) {
    const payload: OeffnenPayload = {
      type: "OEFFNEN",
      startTime: fromDatetimeLocal(startTime, tz).toISOString(),
      oeffnenGrund: grund,
      note: note.trim() || null,
    };
    if (forced) payload.forcedReinigung = true;
    await submit(payload);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!grund) { setError(t("grundRequired")); return; }
    if (!note.trim()) { setError(t("commentRequired")); return; }
    if (isReinigungLimitReached) { setShowReinigungLimitWarning(true); return; }
    if (isGesperrtBlockiert) { setShowWarning(true); return; }
    await doSave();
  }

  function handleReinigungLimitConfirm() {
    setShowReinigungLimitWarning(false);
    setForcedReinigung(true);
    if (isGesperrtBlockiert) setShowWarning(true);
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
      <Sheet open={showReinigungLimitWarning} onClose={() => setShowReinigungLimitWarning(false)} title="">
        <div className="flex flex-col gap-5">
          <div className="flex items-start gap-3">
            <AlertCircle size={28} className="flex-shrink-0 text-warn mt-0.5" />
            <div className="flex flex-col gap-1.5">
              <p className="font-bold text-foreground text-base leading-snug">{t("reinigungLimitTitle")}</p>
              <p className="text-sm text-foreground-muted">
                {t("reinigungLimitSubtext", { count: reinigungHeuteAnzahl, max: reinigungMaxProTag })}
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Button variant="primary" fullWidth onClick={() => setShowReinigungLimitWarning(false)}>
              {t("reinigungLimitStay")}
            </Button>
            <Button variant="secondary" fullWidth loading={saving} onClick={handleReinigungLimitConfirm}>
              {t("reinigungLimitOpenAnyway")}
            </Button>
          </div>
        </div>
      </Sheet>

      <Sheet open={showWarning} onClose={() => setShowWarning(false)} title="">
        <div className="flex flex-col gap-5">
          <div className="flex items-start gap-3">
            <AlertCircle size={28} className="flex-shrink-0 text-warn mt-0.5" />
            <div className="flex flex-col gap-1.5">
              <p className="font-bold text-foreground text-base leading-snug">
                {grund === "REINIGUNG" ? t("modalTitleReinigung") : t("modalTitle")}
              </p>
              <p className="text-sm text-foreground-muted">
                {grund === "REINIGUNG" && reinigungErlaubt
                  ? t("modalSubtextReinigung", { minutes: reinigungMaxMinuten })
                  : grund === "REINIGUNG"
                    ? t("reinigungHintNoConfig")
                    : t("modalSubtext")}
              </p>
              <p className="text-xs text-sperrzeit font-semibold mt-1">
                {sperrzeitUnbefristet
                  ? t("modalLockedIndefinite")
                  : sperrzeitEndetAt
                    ? t("modalLockedUntil", { date: new Date(sperrzeitEndetAt).toLocaleString(dl, { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: tz }) })
                    : null}
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Button variant="primary" fullWidth onClick={() => setShowWarning(false)}>
              {t("modalStay")}
            </Button>
            <Button variant="secondary" fullWidth loading={saving} onClick={() => { setShowWarning(false); doSave(forcedReinigung); }}>
              {t("modalOpenAnyway")}
            </Button>
          </div>
        </div>
      </Sheet>

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <RequiredHint />

        {isGesperrtBlockiert && (
          <Card variant="semantic" semantic="sperrzeit">
            <div className="flex items-start gap-2.5">
              <Lock size={16} className="flex-shrink-0 text-sperrzeit mt-0.5" />
              <div>
                <p className="text-sm font-bold text-sperrzeit-text">{t("lockedWarningTitle")}</p>
                <p className="text-xs text-sperrzeit mt-0.5">
                  {sperrzeitUnbefristet
                    ? t("lockedWarningTextIndefinite")
                    : t("lockedWarningText", { date: new Date(sperrzeitEndetAt!).toLocaleString(dl, { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: tz }) })}
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
              <Lock size={15} className="text-warn shrink-0 mt-0.5" />
              <div className="flex flex-col gap-1">
                <p className="text-xs font-bold text-warn-text">{t("boxWontOpenTitle")}</p>
                <p className="text-xs text-warn-text">
                  {boxHold!.until
                    ? t("boxHoldsUntil", { date: new Date(boxHold!.until).toLocaleString(dl, { hour: "2-digit", minute: "2-digit", timeZone: tz }) })
                    : t("boxHoldsIndefinitely")}
                  {reinigung?.nextWindow ? " " + t("boxNextWindow", { start: reinigung.nextWindow.start, end: reinigung.nextWindow.end }) : ""}
                </p>
                <p className="text-xs text-warn-text">
                  {grund === "REINIGUNG" ? t("boxStillCountsCleaning") : t("boxStillCounts")}
                </p>
              </div>
            </div>
          </Card>
        )}

        {grund === "REINIGUNG" && (
          <Card variant="semantic" semantic={isReinigungLimitReached ? "warn" : "inspect"} padding="compact">
            <div className="flex flex-col gap-1">
              <p className="text-xs text-inspect-text">
                {reinigungErlaubt
                  ? t("modalSubtextReinigung", { minutes: reinigungMaxMinuten })
                  : t("reinigungHintNoConfig")}
              </p>
              {reinigungMaxProTag > 0 && (
                <p className={`text-xs font-semibold ${isReinigungLimitReached ? "text-warn" : "text-inspect-text"}`}>
                  {t("reinigungLimitHint", { count: reinigungHeuteAnzahl, max: reinigungMaxProTag })}
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

        <div className="flex flex-col-reverse sm:flex-row gap-3 pt-1">
          {onCancel && (
            <Button type="button" variant="secondary" fullWidth onClick={onCancel}>
              {tCommon("cancel")}
            </Button>
          )}
          <Button
            type="submit"
            variant={submitVariant}
            semantic={submitVariant === "semantic" ? "unlock" : undefined}
            fullWidth
            loading={saving}
            icon={submitVariant === "primary" ? <LockOpen size={16} /> : undefined}
          >
            {submitLabel ?? defaultLabel}
          </Button>
        </div>
      </form>
    </>
  );
}
