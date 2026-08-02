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
import type { TaskRequirementInput, TaskProofInput } from "@/lib/taskService";
import TaskRequirementPicker, { type PickerCategory } from "./TaskRequirementPicker";
import TaskProofPicker from "./TaskProofPicker";

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
  offenseRef,
  initialPenaltyReason,
}: {
  userId: string;
  categories: PickerCategory[];
  /** Zeitzone des Subs — Fristen sind absolute Zeitpunkte, eingegeben wird in SEINER Zone. */
  tz: string;
  /** Server-gerechnetes „jetzt" in der Sub-Zone (hydrations-sicher). */
  minNow: string;
  /** Wohin nach dem Speichern. */
  redirectTo: string;
  /** Kommt das Formular aus dem Strafbuch, ist die Aufgabe die STRAFE für dieses Vergehen: die Route
   *  legt dann Aufgabe und Urteil zusammen an. Ohne die ref ist es eine gewöhnliche Aufgabe. */
  offenseRef?: string;
  /** Vorbelegter Anlass — die Zeile des Vergehens, damit sie niemand abtippt. */
  initialPenaltyReason?: string;
}) {
  const t = useTranslations("tasks");
  const apiError = useApiError();
  const router = useRouter();

  const nowBaseMs = fromDatetimeLocal(minNow, tz).getTime();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [mode, setMode] = useState<"duration" | "datetime">("duration");
  const [hours, setHours] = useState("2");
  const [holdUntil, setHoldUntil] = useState(() => toDatetimeLocal(new Date(nowBaseMs + 2 * 3600_000), tz));
  const [requirements, setRequirements] = useState<TaskRequirementInput[]>([]);
  const [proofs, setProofs] = useState<TaskProofInput[]>([]);
  // Aus dem Strafbuch heraus ist beides gesetzt und der Haken bleibt sichtbar: der Keyholder soll
  // sehen, dass er gerade eine Strafe stellt — nicht bloss eine Aufgabe, die zufällig so heisst.
  const [isPunishment, setIsPunishment] = useState(!!offenseRef);
  const [penaltyReason, setPenaltyReason] = useState(initialPenaltyReason ?? "");
  // Absende-Mechanik (saving/error/networkError/finally) über den geteilten Hook — sie war in den
  // Anforderungs-Formularen schon zweimal von Hand geschrieben.
  const { saving, error, submit } = useEntrySubmit<Record<string, unknown>>(
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

    // Keine eigene Frist-Prüfung hier: der Service verlangt mehr als „in der Zukunft" — die Endzeit
    // muss hinter der Kulanzfrist liegen, sonst wäre die Aufgabe gar nicht erst zu beginnen. Eine
    // zweite, schwächere Schranke im Formular liesse genau die Eingaben durch, die der Server danach
    // mit einer anderen Begründung abweist. `TASK_HOLD_UNTIL_TOO_SOON` kommt über
    // `parseApiErrorCode` übersetzt zurück und landet in derselben Fehlerzeile.
    void submit({
      userId,
      title: title.trim(),
      description: description.trim() || undefined,
      holdUntil: until.toISOString(),
      requirements,
      // Leere Zeilen fallen weg: eine angelegte, aber nie ausgefüllte Nachweis-Zeile ist ein
      // Versehen, keine Forderung — der Service wiese sie sonst mit einem Fehler ab.
      proofs: proofs.filter((p) => p.description.trim()),
      isPunishment,
      penaltyReason: isPunishment ? penaltyReason.trim() || undefined : undefined,
      // Trägt die Aufgabe eine Vergehens-ref, schreibt die Route sie samt Urteil — das Vergehen gilt
      // damit als bestraft. Der Haken darf das nicht abschalten: die ref ist der Grund, aus dem
      // dieses Formular überhaupt geöffnet wurde.
      offenseRef,
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

      <TaskProofPicker value={proofs} onChange={setProofs} />

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
          // Aus dem Strafbuch heraus ist das keine Wahl: der Server legt die Aufgabe ohnehin als
          // Strafe an. Abwählbar meldete der Haken einen Zustand, den der Server überschreibt — und
          // verwürfe dabei still den vorbelegten Anlass.
          disabled={!!offenseRef}
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
