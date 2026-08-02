"use client";

import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { useTranslations } from "next-intl";
import FormError from "@/app/components/FormError";
import Button from "@/app/components/Button";
import Checkbox from "@/app/components/Checkbox";
import HoursInput from "@/app/components/HoursInput";
import FieldTabs from "@/app/components/FieldTabs";
import Select from "@/app/components/Select";
import Textarea from "@/app/components/Textarea";
import { parseApiErrorCode } from "@/lib/apiClient";
import { INSPECTION_DEADLINE_DEFAULT_H } from "@/lib/constants";
import { useApiError } from "@/app/hooks/useApiError";
import type { InspectionTargetOption } from "@/lib/inspectionTarget";

/** Der Wert des Ziel-Selects. Das leere Feld IST der KG — `categoryId: null` heisst überall im
 *  Modell „KG", und ein Sentinel-String hier müsste beim Absenden wieder zurückübersetzt werden. */
const KG_VALUE = "";

/** Das vorausgewählte Ziel: das erste angebotene, NICHT stur der KG. Trägt der Sub etwas, ohne
 *  verschlossen zu sein, ist die Trage-Kategorie das einzige Ziel — und dann fehlt das Select (eine
 *  Option ist keine Wahl). Ein fixer KG-Startwert hiesse hier: das Formular schickt ein Ziel, das
 *  gar nicht angeboten wurde, und die Anfrage scheitert mit „nicht verschlossen". */
const defaultTargetValue = (targets: InspectionTargetOption[]): string =>
  targets[0]?.categoryId ?? KG_VALUE;

/**
 * Die Frist wahlweise in Stunden oder Minuten. Eine Kontrolle ist der Griff zum Handy plus ein
 * Foto — in Stunden gedacht ist das gröber, als die Sache verlangt, deshalb die Umschaltung.
 *
 * `step` ist auch die Rasterung beim Wechsel der Einheit und die HTML-Validierung des Feldes: ein
 * Wert daneben (0.1 h bei step 0.25) liesse das Formular nicht mehr absenden. Darum keine feinere
 * Stufe als hier deklariert — wer feiner will, schaltet auf Minuten.
 */
const FRIST_UNITS = {
  h: { min: 0.25, step: 0.25 },
  min: { min: 5, step: 5 },
} as const;
type FristUnit = keyof typeof FRIST_UNITS;

const toHours = (value: number, unit: FristUnit) => (unit === "min" ? value / 60 : value);

/**
 * Shared form body for "Kontrolle anfordern".
 * Caller wraps this in an ActionModal and provides onSuccess.
 */
export default function KontrolleFields({
  userId,
  onSuccess,
  initialTargets,
}: {
  userId: string;
  onSuccess: () => void;
  /** Vom Server vorberechnete Ziele (Aktions-Seite, die sie ohnehin für ihren Guard lädt). Fehlen
   *  sie, holt das Formular sie selbst — der Modal-Pfad kennt sie beim Rendern noch nicht. */
  initialTargets?: InspectionTargetOption[];
}) {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const apiError = useApiError();
  const [kommentar, setKommentar] = useState("");
  const [frist, setFrist] = useState(String(INSPECTION_DEADLINE_DEFAULT_H));
  const [fristUnit, setFristUnit] = useState<FristUnit>("h");
  const [targets, setTargets] = useState<InspectionTargetOption[]>(initialTargets ?? []);
  const [targetValue, setTargetValue] = useState<string>(defaultTargetValue(initialTargets ?? []));
  const [pinDevice, setPinDevice] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Die möglichen Ziele erst beim Öffnen holen (siehe die Route: sie hängen am Live-Zustand und
  // wären in der Admin-Übersicht sonst eine Abfrage je gelistetem Sub). Kamen sie schon vom
  // Server, entfällt der Roundtrip — und mit ihm das Nachrutschen des Selects nach dem Laden.
  useEffect(() => {
    if (initialTargets) return;
    let cancelled = false;
    fetch(`/api/admin/inspection-targets?userId=${encodeURIComponent(userId)}`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data: InspectionTargetOption[]) => {
        if (cancelled) return;
        setTargets(data);
        setTargetValue(defaultTargetValue(data));
      })
      .catch(() => { /* Ziel-Auswahl bleibt aus: die Kontrolle geht dann auf den KG wie bisher */ });
    return () => { cancelled = true; };
  }, [userId, initialTargets]);

  const selectedTarget = targets.find((x) => (x.categoryId ?? KG_VALUE) === targetValue) ?? null;

  /** Beim Wechsel zieht die DAUER mit, nicht die Zahl: aus 1 h wird 60 min, nicht 1 min. */
  function switchFristUnit(next: FristUnit) {
    if (next === fristUnit) return;
    const hours = toHours(parseFloat(frist) || INSPECTION_DEADLINE_DEFAULT_H, fristUnit);
    const { min, step } = FRIST_UNITS[next];
    // Auf `step` gerastert, sonst weist die HTML-Validierung den Wert als Schrittweiten-Fehler ab.
    const snapped = Math.max(min, Math.round((next === "min" ? hours * 60 : hours) / step) * step);
    setFristUnit(next);
    setFrist(String(snapped));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/admin/kontrolle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          kommentar: kommentar.trim() || undefined,
          deadlineH: toHours(parseFloat(frist) || INSPECTION_DEADLINE_DEFAULT_H, fristUnit),
          categoryId: targetValue || undefined,
          // Nur wenn ausdrücklich verlangt: ohne Pin erfüllt jedes Gerät der Kategorie, mit Pin
          // genau dieses — und ein Gerätewechsel macht die Kontrolle unerfüllbar.
          deviceId: pinDevice ? selectedTarget?.deviceId ?? undefined : undefined,
        }),
      });
      if (res.ok) onSuccess();
      else setError(apiError(await parseApiErrorCode(res)));
    } catch {
      setError(tc("networkError"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {/* Ziel-Auswahl nur, wenn es überhaupt etwas zu wählen gibt — trägt der Sub nichts ausser
          dem KG, wäre ein Select mit einer Option nur Rauschen. */}
      {targets.length > 1 && (
        <Select
          label={t("kontrolleTarget")}
          value={targetValue}
          onChange={(e) => { setTargetValue(e.target.value); setPinDevice(false); }}
          options={targets.map((x) => ({
            value: x.categoryId ?? KG_VALUE,
            label: x.categoryName ?? t("kontrolleTargetKg"),
          }))}
        />
      )}

      {selectedTarget?.deviceName && (
        <Checkbox
          label={t("kontrolleTargetPinDevice", { device: selectedTarget.deviceName })}
          checked={pinDevice}
          onChange={(e) => setPinDevice(e.target.checked)}
        />
      )}

      <Textarea
        label={t("kontrolleInstruction")}
        value={kommentar}
        onChange={(e) => setKommentar(e.target.value)}
        placeholder={t("kontrolleInstruction")}
        rows={2}
      />

      <div className="flex flex-col gap-2">
        <FieldTabs
          label={t("frist")}
          value={fristUnit}
          options={[
            { value: "h", label: t("unitHours") },
            { value: "min", label: t("unitMinutes") },
          ]}
          onChange={switchFristUnit}
        />
        <HoursInput
          value={frist}
          onChange={setFrist}
          ariaLabel={t("frist")}
          min={FRIST_UNITS[fristUnit].min}
          step={FRIST_UNITS[fristUnit].step}
          unit={fristUnit === "min" ? t("minutesUnit") : t("hoursUnit")}
        />
      </div>

      <FormError message={error} variant="compact" />

      <Button type="submit" variant="primary" fullWidth loading={saving} icon={<Bell size={16} />}>
        {t("kontrolleRequest")}
      </Button>
    </form>
  );
}
