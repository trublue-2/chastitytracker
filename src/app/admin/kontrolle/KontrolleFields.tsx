"use client";

import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { useTranslations } from "next-intl";
import FormError from "@/app/components/FormError";
import Button from "@/app/components/Button";
import Checkbox from "@/app/components/Checkbox";
import HoursInput from "@/app/components/HoursInput";
import Select from "@/app/components/Select";
import Textarea from "@/app/components/Textarea";
import { parseApiErrorCode } from "@/lib/apiClient";
import { useApiError } from "@/app/hooks/useApiError";
import type { InspectionTargetOption } from "@/lib/inspectionTarget";

/** Der Wert des Ziel-Selects. Das leere Feld IST der KG — `categoryId: null` heisst überall im
 *  Modell „KG", und ein Sentinel-String hier müsste beim Absenden wieder zurückübersetzt werden. */
const KG_VALUE = "";

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
  const [deadlineH, setDeadlineH] = useState("4");
  const [targets, setTargets] = useState<InspectionTargetOption[]>(initialTargets ?? []);
  const [targetValue, setTargetValue] = useState<string>(KG_VALUE);
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
      .then((data: InspectionTargetOption[]) => { if (!cancelled) setTargets(data); })
      .catch(() => { /* Ziel-Auswahl bleibt aus: die Kontrolle geht dann auf den KG wie bisher */ });
    return () => { cancelled = true; };
  }, [userId, initialTargets]);

  const selectedTarget = targets.find((x) => (x.categoryId ?? KG_VALUE) === targetValue) ?? null;

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
          deadlineH: parseFloat(deadlineH) || 4,
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

      <HoursInput label={t("kontrolleHours")} value={deadlineH} onChange={setDeadlineH} min={0.1} step={0.1} unit={t("hoursUnit")} />

      <FormError message={error} variant="compact" />

      <Button type="submit" variant="primary" fullWidth loading={saving} icon={<Bell size={16} />}>
        {t("kontrolleRequest")}
      </Button>
    </form>
  );
}
