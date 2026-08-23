"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Scale } from "lucide-react";
import { useTranslations } from "next-intl";
import { fromDatetimeLocal } from "@/lib/utils";
import {
  RELEASE_AVERAGE_DAYS_RANGE, RELEASE_MIN_MEASUREMENTS_RANGE,
  RELEASE_STEP_KG_RANGE, RELEASE_WINDOW_HOURS_RANGE,
} from "@/lib/constants";
import { parseDecimalInput, weightInputToKg, type UnitSystem } from "@/lib/weight";
import { RELEASE_DIRECTIONS, type ReleaseDirection } from "@/lib/weightRelease";
import AdminActionFormShell from "@/app/components/AdminActionFormShell";
import DateTimePicker from "@/app/components/DateTimePicker";
import UnderweightNote from "@/app/components/UnderweightNote";
import FormError from "@/app/components/FormError";
import Input from "@/app/components/Input";
import Select from "@/app/components/Select";
import Textarea from "@/app/components/Textarea";
import Checkbox from "@/app/components/Checkbox";
import Button from "@/app/components/Button";
import { parseApiErrorCode } from "@/lib/apiClient";
import { useApiError } from "@/app/hooks/useApiError";

/**
 * Die Freigabe-Vorgabe: welches Gewicht den nächsten Orgasmus öffnet
 * (docs/gewicht-freigabe-konzept.md).
 *
 * Geprüft wird das MITTEL der letzten Tage, nicht der Tageswert — ein einzelnes Wiegen schwankt um
 * ein bis zwei Kilo, und eine Freigabe daran zu hängen hiesse, Kochsalz über den Orgasmus
 * entscheiden zu lassen. Das Formular sagt das in einem Satz, weil sonst niemand versteht, warum
 * die Zahl neben „Mittel" und nicht neben „Gewicht" steht.
 */
export default function WeightReleaseForm({
  userId, tz, nowDefault, unitSystem, subHeightCm, hasOpen,
}: {
  userId: string;
  tz: string;
  nowDefault: string;
  /** Anzeige-Einheit DER KEYHOLDERIN — sie tippt die Schwelle. */
  unitSystem: UnitSystem;
  /** Körpergrösse DES TRÄGERS für die Untergewichts-Warnung. */
  subHeightCm: number | null;
  /** Steht schon eine Vorgabe? Dann ersetzt das Absenden sie — und das gehört gesagt. */
  hasOpen: boolean;
}) {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const apiError = useApiError();
  const router = useRouter();
  const target = `/admin/users/${userId}/aktionen`;

  const [threshold, setThreshold] = useState("");
  const [direction, setDirection] = useState<ReleaseDirection>("below");
  const [averageDays, setAverageDays] = useState(String(RELEASE_AVERAGE_DAYS_RANGE.fallback));
  const [minMeasurements, setMinMeasurements] = useState(String(RELEASE_MIN_MEASUREMENTS_RANGE.fallback));
  const [stepKg, setStepKg] = useState(String(RELEASE_STEP_KG_RANGE.fallback));
  const [notBeforeAt, setNotBeforeAt] = useState(nowDefault);
  const [windowHours, setWindowHours] = useState(String(RELEASE_WINDOW_HOURS_RANGE.fallback));
  const [openingAllowed, setOpeningAllowed] = useState(false);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const unitLabel = unitSystem === "imperial" ? tc("unitLbs") : tc("unitKg");
  const parsedThreshold = parseDecimalInput(threshold);

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
          direction,
          averageDays: Number(averageDays),
          minMeasurements: Number(minMeasurements),
          // Der Anstieg ist eine DIFFERENZ: dieselbe Umrechnung, kein Nullpunkt-Versatz.
          stepKg: weightInputToKg(parseDecimalInput(stepKg) ?? 0, unitSystem),
          notBeforeAt: fromDatetimeLocal(notBeforeAt, tz),
          windowHours: Number(windowHours),
          openingAllowed,
          message,
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
      <form onSubmit={submit} className="flex flex-col gap-4">
        <p className="text-sm text-foreground-muted">{t("releaseIntro")}</p>
        {hasOpen && <p className="text-sm text-warn">{t("releaseReplacesOpen")}</p>}

        <Select
          label={t("releaseDirection")}
          value={direction}
          onChange={(e) => setDirection(e.target.value as ReleaseDirection)}
          options={RELEASE_DIRECTIONS.map((d) => ({ value: d, label: t(`releaseDirection_${d}`) }))}
        />

        <Input
          label={`${t("releaseThreshold")} (${unitLabel})`}
          type="number"
          inputMode="decimal"
          step="any"
          required
          value={threshold}
          onChange={(e) => setThreshold(e.target.value)}
          hint={t("releaseThresholdHint")}
        />
        <UnderweightNote
          input={threshold}
          unit={unitSystem}
          heightCm={subHeightCm}
          message={t("releaseUnderweightWarning")}
        />

        <div className="grid grid-cols-2 gap-3">
          <Input
            label={t("releaseAverageDays")}
            type="number"
            min={RELEASE_AVERAGE_DAYS_RANGE.min}
            max={RELEASE_AVERAGE_DAYS_RANGE.max}
            required
            value={averageDays}
            onChange={(e) => setAverageDays(e.target.value)}
          />
          <Input
            label={t("releaseMinMeasurements")}
            type="number"
            min={RELEASE_MIN_MEASUREMENTS_RANGE.min}
            max={RELEASE_MIN_MEASUREMENTS_RANGE.max}
            required
            value={minMeasurements}
            onChange={(e) => setMinMeasurements(e.target.value)}
            hint={t("releaseMinMeasurementsHint")}
          />
        </div>

        <Input
          label={`${t("releaseStep")} (${unitLabel})`}
          type="number"
          inputMode="decimal"
          step="any"
          min={0}
          value={stepKg}
          onChange={(e) => setStepKg(e.target.value)}
          hint={t("releaseStepHint")}
        />

        <DateTimePicker
          label={t("releaseNotBefore")}
          value={notBeforeAt}
          onChange={(e) => setNotBeforeAt(e.target.value)}
          required
          hint={t("releaseNotBeforeHint")}
        />

        <Input
          label={t("releaseWindowHours")}
          type="number"
          min={RELEASE_WINDOW_HOURS_RANGE.min}
          max={RELEASE_WINDOW_HOURS_RANGE.max}
          required
          value={windowHours}
          onChange={(e) => setWindowHours(e.target.value)}
          hint={t("releaseWindowHoursHint")}
        />

        <Checkbox
          label={t("orgasmReqOpenAllowed")}
          checked={openingAllowed}
          onChange={(e) => setOpeningAllowed(e.target.checked)}
        />

        <Textarea
          label={t("releaseMessage")}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={2}
        />

        {error && <FormError message={error} />}
        <Button type="submit" loading={saving}>{t("releaseSubmit")}</Button>
      </form>
    </AdminActionFormShell>
  );
}
