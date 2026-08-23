"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Scale } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { fromDatetimeLocal, round1 } from "@/lib/utils";
import { RELEASE_AVERAGE_DAYS_RANGE, RELEASE_WINDOW_HOURS_RANGE } from "@/lib/constants";
import { parseDecimalInput, weightForDisplay, weightInputToKg, weightText, type UnitSystem } from "@/lib/weight";
import AdminActionFormShell from "@/app/components/AdminActionFormShell";
import DateTimePicker from "@/app/components/DateTimePicker";
import FieldTabs from "@/app/components/FieldTabs";
import UnderweightNote from "@/app/components/UnderweightNote";
import FormError from "@/app/components/FormError";
import Input from "@/app/components/Input";
import Button from "@/app/components/Button";
import { parseApiErrorCode } from "@/lib/apiClient";
import { useApiError } from "@/app/hooks/useApiError";

/**
 * Die Freigabe-Vorgabe: welches Gewicht den nächsten Orgasmus öffnet
 * (docs/gewicht-freigabe-konzept.md).
 *
 * **Drei Felder, und das ist die vollständige Liste** (Entscheidung trublue, 23.08.2026): das
 * Gewicht, ab wann frühestens, und wie lange er dann Zeit hat. Die erste Fassung stellte neun Felder
 * nebeneinander, jedes mit einer Zeile Erklärung darunter — genau der Befund aus
 * `docs/ux-konsistenz.md` §3.2: nicht zu lange Texte, sondern zu viele davon auf einmal.
 *
 * Was hier NICHT mehr steht, steht weiter im Modell und im MCP: Richtung (hier immer „darunter"),
 * Breite des Mittels, geforderte Messungen, Tagesanstieg, Begleittext. Die Oberfläche trifft die
 * Entscheidung, die Keyholderin täglich fällt; die KI kann über `set_weight_release` das ganze
 * Register spielen. Ein Feld, das in neun von zehn Fällen auf seiner Vorgabe stehen bleibt, kostet
 * jedes Mal Aufmerksamkeit und bringt sie einmal ein.
 *
 * **Der Stand steht daneben, während sie tippt.** „Unter 74 kg" ist für einen, der bei 74,2 steht,
 * etwas ganz anderes als für einen bei 82 — ohne sein aktuelles Mittel im Blick setzt sie die
 * Schwelle blind. Die Zahl rechnet der Server mit demselben Fenster, das später auch entscheidet
 * (`currentWeightAverage`) — ein im Client aus allen vorhandenen Punkten gebildetes Mittel stünde
 * als „heute" da, während der Träger seit einer Woche nicht auf der Waage war.
 */
export default function WeightReleaseForm({
  userId, subName, tz, nowDefault, unitSystem, subHeightCm, hasOpen, averageKg,
}: {
  userId: string;
  /** Der Träger beim Namen — die Regel handelt von ihm, nicht von „dem Benutzer". */
  subName: string;
  tz: string;
  nowDefault: string;
  /** Anzeige-Einheit DER KEYHOLDERIN — sie tippt die Schwelle. */
  unitSystem: UnitSystem;
  /** Körpergrösse DES TRÄGERS für die Untergewichts-Warnung. */
  subHeightCm: number | null;
  /** Steht schon eine Vorgabe? Dann ersetzt das Absenden sie — und das gehört gesagt. */
  hasOpen: boolean;
  /** Sein aktuelles Mittel in KILOGRAMM; `null`, wenn die letzten Tage keine Wiegung tragen. */
  averageKg: number | null;
}) {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const locale = useLocale();
  const apiError = useApiError();
  const router = useRouter();
  const target = `/admin/users/${userId}/aktionen`;

  const [threshold, setThreshold] = useState("");
  const [startIn, setStartIn] = useState<StartChoice>("7");
  const [customStart, setCustomStart] = useState(nowDefault);
  const [windowHours, setWindowHours] = useState(String(RELEASE_WINDOW_HOURS_RANGE.fallback));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const unitLabel = unitSystem === "imperial" ? tc("unitLbs") : tc("unitKg");
  const parsedThreshold = parseDecimalInput(threshold);
  const days = RELEASE_AVERAGE_DAYS_RANGE.fallback;

  /**
   * Sein Mittel in IHRER Einheit. Der Server liefert Kilogramm, die getippte Schwelle steht in der
   * Einheit der Keyholderin — ohne diese Umrechnung stünde bei einer Keyholderin in Pfund „sein
   * Schnitt liegt bei 74 lbs", und der Abstand wäre die Differenz aus Kilogramm und Pfund.
   */
  const average = averageKg === null ? null : weightForDisplay(averageKg, unitSystem);

  const gap = average !== null && parsedThreshold !== null
    ? round1(Math.abs(average - parsedThreshold))
    : null;
  const alreadyMet = average !== null && parsedThreshold !== null && average < parsedThreshold;
  /** Die Zahlen der Vorschau in seiner Schreibweise — daneben steht ein Feld, in das man „73,5"
   *  tippt; „74.1" darunter wäre derselbe Bildschirm mit zwei Dezimaltrennern. `average` und `gap`
   *  stehen bereits in SEINER Einheit, deshalb hier `"metric"`: umzurechnen ist nichts mehr, zu
   *  formatieren schon — und zwar mit derselben Regel wie überall (`weightText`). */
  const num = (v: number) => weightText(v, "metric", locale);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (parsedThreshold === null) { setError(t("releaseThresholdMissing")); return; }
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/admin/weight-release", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          // Die Schwelle geht IMMER metrisch an den Server — dieselbe Regel wie beim Zielgewicht:
          // gerechnet und gespeichert wird in Kilogramm, die Einheit ist eine Anzeige-Eigenschaft.
          thresholdKg: weightInputToKg(parsedThreshold, unitSystem),
          notBeforeAt: startAt(startIn, customStart, tz),
          windowHours: Number(windowHours),
          // Öffnen ist erlaubt, ohne dass jemand danach gefragt wird: eine Freigabe, die er nicht
          // einlösen kann, weil das Gerät zu bleibt, ist keine. Die Ausnahme davon setzt die
          // Keyholderin bei einer Anweisung von Hand — dort ist das Fenster ihre Entscheidung, hier
          // ist es sein Verdienst.
          openingAllowed: true,
        }),
      });
      if (!res.ok) { setError(apiError(await parseApiErrorCode(res))); return; }
      router.push(target);
    } catch {
      setError(tc("networkError"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminActionFormShell
      userId={userId}
      backLabel={tc("back")}
      icon={<Scale size={20} strokeWidth={2} />}
      iconBg="var(--color-surface-raised)"
      iconColor="var(--color-foreground-muted)"
      title={t("releaseTitle")}
    >
      <form onSubmit={submit} className="flex flex-col gap-5">
        {/* Die Regel in einem Satz, mit seinem Namen: was hier eingestellt wird, ist keine
            Einstellung, sondern eine Bedingung über eine bestimmte Person. */}
        <p className="text-sm text-foreground">{t("releaseLead", { name: subName, days })}</p>
        {hasOpen && <p className="text-sm text-warn">{t("releaseReplacesOpen")}</p>}

        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-semibold uppercase tracking-wider text-foreground-muted">
            {t("releaseThreshold")}<span className="text-warn ml-0.5">*</span>
          </p>
          <div className="flex items-center gap-2">
            {/* Ein TEXT-Feld, kein Zahlenfeld: `type="number"` bringt Pfeilchen mit, verstellt sich
                beim Scrollen über dem Feld und lehnt in manchen Browsern das Komma ab — für „73,5"
                also durchweg im Weg. `inputMode="decimal"` holt trotzdem die Ziffern-Tastatur, und
                `parseDecimalInput` nimmt Komma wie Punkt. */}
            <Input
              type="text"
              inputMode="decimal"
              required
              autoFocus
              aria-label={t("releaseThreshold")}
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              className="flex-1"
            />
            <span className="text-sm text-foreground-faint flex-shrink-0">{unitLabel}</span>
          </div>

          {/* Wo er HEUTE steht — die Zahl, ohne die eine Schwelle geraten ist. */}
          <p className="text-xs text-foreground-faint">
            {average === null
              ? t("releaseNoAverage")
              : gap === null
                ? t("releaseAverageOnly", { value: `${num(average)} ${unitLabel}`, days })
                : alreadyMet
                  ? t("releaseAlreadyMet", { value: `${num(average)} ${unitLabel}` })
                  : t("releaseGap", { value: `${num(average)} ${unitLabel}`, gap: `${num(gap)} ${unitLabel}` })}
          </p>
        </div>

        <UnderweightNote
          input={threshold}
          unit={unitSystem}
          heightCm={subHeightCm}
          message={t("releaseUnderweightWarning")}
        />

        <FieldTabs
          label={t("releaseNotBefore")}
          ariaLabel={t("releaseNotBefore")}
          value={startIn}
          onChange={setStartIn}
          options={START_CHOICES.map((c) => ({ value: c, label: t(`releaseStart_${c}`) }))}
        />
        {startIn === "custom" && (
          <DateTimePicker
            value={customStart}
            onChange={(e) => setCustomStart(e.target.value)}
            required
            aria-label={t("releaseNotBefore")}
          />
        )}

        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-semibold uppercase tracking-wider text-foreground-muted">
            {t("releaseWindowHours")}
          </p>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={RELEASE_WINDOW_HOURS_RANGE.min}
              max={RELEASE_WINDOW_HOURS_RANGE.max}
              required
              aria-label={t("releaseWindowHours")}
              value={windowHours}
              onChange={(e) => setWindowHours(e.target.value)}
              className="flex-1"
            />
            <span className="text-sm text-foreground-faint flex-shrink-0">{tc("hoursUnit")}</span>
          </div>
        </div>

        {error && <FormError message={error} />}
        <Button type="submit" loading={saving}>{t("releaseSubmit")}</Button>
      </form>
    </AdminActionFormShell>
  );
}

/** Die Mindestlaufzeit als GRIFFE statt als Datumsfeld: „in einer Woche" ist die Form, in der man
 *  darüber nachdenkt. Wer einen bestimmten Tag meint, bekommt ihn über „anderes Datum". */
const START_CHOICES = ["3", "7", "14", "custom"] as const;
type StartChoice = (typeof START_CHOICES)[number];

function startAt(choice: StartChoice, custom: string, tz: string): string {
  if (choice === "custom") return fromDatetimeLocal(custom, tz).toISOString();
  // Ganze Tage ab jetzt. Bewusst nicht auf Mitternacht gelegt: die Frist ist eine SPANNE („eine
  // Woche noch"), und ein auf 00:00 gezogener Zeitpunkt verschenkt oder schenkt bis zu einen Tag.
  return new Date(Date.now() + Number(choice) * 86_400_000).toISOString();
}
