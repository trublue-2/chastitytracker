"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardList } from "lucide-react";
import { useTranslations } from "next-intl";
import { toDatetimeLocal, fromDatetimeLocal } from "@/lib/utils";
import DateTimePicker from "@/app/components/DateTimePicker";
import FieldTabs from "@/app/components/FieldTabs";
import FormError from "@/app/components/FormError";
import Input from "@/app/components/Input";
import HoursInput from "@/app/components/HoursInput";
import Textarea from "@/app/components/Textarea";
import Button from "@/app/components/Button";
import Checkbox from "@/app/components/Checkbox";
import { parseApiErrorCode } from "@/lib/apiClient";
import { useEntrySubmit } from "@/app/hooks/useEntrySubmit";
import { useApiError } from "@/app/hooks/useApiError";
import { TASK_TITLE_MAX_LENGTH, TASK_DESCRIPTION_MAX_LENGTH } from "@/lib/constants";
import type { TaskRequirementInput } from "@/lib/taskService";
import TaskRequirementPicker, { type PickerCategory } from "./TaskRequirementPicker";

/** Schnellwahl für die Endzeit. Das Modell kennt nur den absoluten Zeitpunkt (EINE Wahrheit); die
 *  Stunden-Knöpfe rechnen ihn nur bequem aus — „trage den Knebel 2 Stunden" ist damit zwei Taps. */
const QUICK_HOURS = [1, 2, 4, 8] as const;

/**
 * Formular „Aufgabe stellen". Aufbau bewusst wie `VerschlussAnforderungFields` (Umschalter, Zeitwahl,
 * Nachricht), damit es sich nicht wie ein Fremdkörper anfühlt.
 */
export default function TaskFields({
  userId,
  categories,
  tz,
  minNow,
  redirectTo,
}: {
  userId: string;
  categories: PickerCategory[];
  /** Zeitzone des Subs — Fristen sind absolute Zeitpunkte, eingegeben wird in SEINER Zone. */
  tz: string;
  /** Server-gerechnetes „jetzt" in der Sub-Zone (hydrations-sicher). */
  minNow: string;
  /** Wohin nach dem Speichern. */
  redirectTo: string;
}) {
  const t = useTranslations("tasks");
  const ta = useTranslations("admin");
  const apiError = useApiError();
  const router = useRouter();

  const nowBaseMs = fromDatetimeLocal(minNow, tz).getTime();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [mode, setMode] = useState<"duration" | "datetime">("duration");
  const [hours, setHours] = useState("2");
  const [holdUntil, setHoldUntil] = useState(() => toDatetimeLocal(new Date(nowBaseMs + 2 * 3600_000), tz));
  const [requirements, setRequirements] = useState<TaskRequirementInput[]>([]);
  const [isPunishment, setIsPunishment] = useState(false);
  const [penaltyReason, setPenaltyReason] = useState("");
  // Absende-Mechanik (saving/error/networkError/finally) über den geteilten Hook — sie war in den
  // Anforderungs-Formularen schon zweimal von Hand geschrieben.
  const { saving, error, setError, submit } = useEntrySubmit<Record<string, unknown>>(
    async (payload) => {
      const res = await fetch("/api/admin/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      return res.ok ? { ok: true } : { ok: false, error: apiError(await parseApiErrorCode(res)) };
    },
    () => router.push(redirectTo),
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const until = mode === "duration"
      ? new Date(Date.now() + (parseFloat(hours) || 2) * 3600_000)
      : fromDatetimeLocal(holdUntil, tz);

    if (until.getTime() <= Date.now()) {
      setError(ta("futureDateRequired"));
      return;
    }

    void submit({
      userId,
      title: title.trim(),
      description: description.trim() || undefined,
      holdUntil: until.toISOString(),
      requirements,
      isPunishment,
      penaltyReason: isPunishment ? penaltyReason.trim() || undefined : undefined,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <Input
        label={t("titleLabel")}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={t("titlePlaceholder")}
        maxLength={TASK_TITLE_MAX_LENGTH}
        required
      />

      <Textarea
        label={t("descriptionLabel")}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder={t("descriptionPlaceholder")}
        maxLength={TASK_DESCRIPTION_MAX_LENGTH}
        rows={3}
      />

      <TaskRequirementPicker
        label={t("requirementsLabel")}
        hint={t("requirementsHint")}
        kgLabel={t("requirementKgLocked")}
        anyDeviceLabel={t("anyDevice")}
        deviceLabel={t("deviceLabel")}
        categories={categories}
        value={requirements}
        onChange={setRequirements}
      />

      <FieldTabs
        label={t("holdUntilLabel")}
        value={mode}
        onChange={setMode}
        options={[
          { value: "duration", label: t("modeDuration") },
          { value: "datetime", label: t("modeDatetime") },
        ]}
      />

      {mode === "duration" ? (
        <div className="flex flex-col gap-2">
          <HoursInput value={hours} onChange={setHours} min={1} step={0.5} unit={t("hoursUnit")} />
          <div className="flex flex-wrap gap-2">
            {QUICK_HOURS.map((h) => (
              <Button key={h} type="button" variant="secondary" size="sm" onClick={() => setHours(String(h))}>
                {t("quickHours", { hours: h })}
              </Button>
            ))}
          </div>
        </div>
      ) : (
        <DateTimePicker
          value={holdUntil}
          onChange={(e) => setHoldUntil(e.target.value)}
          min={minNow}
          hint={t("holdUntilHint", { tz })}
        />
      )}

      <div className="flex flex-col gap-2">
        <Checkbox
          label={t("isPunishmentLabel")}
          checked={isPunishment}
          onChange={(e) => setIsPunishment(e.target.checked)}
        />
        {isPunishment && (
          <Input
            label={t("penaltyReasonLabel")}
            value={penaltyReason}
            onChange={(e) => setPenaltyReason(e.target.value)}
            placeholder={t("penaltyReasonPlaceholder")}
            maxLength={TASK_TITLE_MAX_LENGTH}
          />
        )}
      </div>

      <FormError message={error} variant="compact" />

      <Button type="submit" variant="primary" fullWidth loading={saving} icon={<ClipboardList size={16} />}>
        {saving ? t("submitting") : t("submit")}
      </Button>
    </form>
  );
}
