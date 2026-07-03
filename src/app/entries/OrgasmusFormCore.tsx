"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Droplets } from "lucide-react";
import { toDatetimeLocal, fromDatetimeLocal } from "@/lib/utils";
import { splitOrgasmusArt, type OrgasmusOption } from "@/lib/reasonsService";
import FormError from "@/app/components/FormError";
import RequiredHint from "@/app/components/RequiredHint";
import DateTimePicker from "@/app/components/DateTimePicker";
import Select from "@/app/components/Select";
import Textarea from "@/app/components/Textarea";
import Button from "@/app/components/Button";
import { useEntrySubmit } from "@/app/hooks/useEntrySubmit";
import type { OrgasmusPayload, SubmitResult } from "./types";

/** Leitet aus einem gespeicherten Wert (voller Kombi-Code ODER blanke Hauptart) die Auswahl ab. */
function initFromStored(stored: string | null | undefined, options: OrgasmusOption[]): { main: string; subCode: string } {
  const byCode = stored ? options.find((o) => o.code === stored) : undefined;
  if (byCode) return { main: byCode.mainToken, subCode: byCode.subLabel ? byCode.code : "" };
  const main = stored && options.some((o) => o.mainToken === stored) ? stored : (options[0]?.mainToken ?? "");
  return { main, subCode: "" };
}

interface Props {
  initial?: { startTime: string; note?: string | null; orgasmusArt?: string | null };
  /** Owner-scoped Kaskaden-Optionen (Built-in-Defaults, wenn der Owner keine eigene Config hat). */
  artOptions: OrgasmusOption[];
  maxTime?: string;
  tz: string;
  nowDefault: string;
  isEdit?: boolean;
  submitFn: (payload: OrgasmusPayload) => Promise<SubmitResult>;
  onSuccess?: () => void;
  onCancel?: () => void;
  submitVariant?: "semantic" | "primary";
  submitLabel?: string;
}

export default function OrgasmusFormCore({
  initial, artOptions, maxTime, tz, nowDefault, isEdit = false, submitFn, onSuccess, onCancel, submitVariant = "semantic", submitLabel,
}: Props) {
  const t = useTranslations("orgasmForm");
  const tc = useTranslations("common");
  // Bestandswert erhalten: matcht der gespeicherte Wert weder Code noch Hauptart (entfernte/umbenannte/
  // Legacy-Art wie „ruinierter Orgasmus – Verschlossen"), als synthetische Option einschleusen — sonst
  // fiele initFromStored auf die erste Hauptart zurück und Speichern überschriebe den erfassten Wert.
  const options = useMemo(() => {
    const stored = initial?.orgasmusArt;
    if (!stored || artOptions.some((o) => o.code === stored || o.mainToken === stored)) return artOptions;
    const { mainToken, subLabel } = splitOrgasmusArt(stored);
    const mainLabel = artOptions.find((o) => o.mainToken === mainToken)?.mainLabel ?? mainToken;
    return [...artOptions, { code: stored, mainToken, mainLabel, subLabel }];
  }, [artOptions, initial?.orgasmusArt]);
  const init = initFromStored(initial?.orgasmusArt, options);

  const [startTime, setStartTime] = useState(toDatetimeLocal(initial?.startTime, tz) || nowDefault);
  const [art, setArt] = useState(init.main); // Haupt-Token
  const [subCode, setSubCode] = useState(init.subCode); // voller Code der gewählten Unterart, "" = keine Angabe
  const [note, setNote] = useState(initial?.note ?? "");
  const { saving, error, submit } = useEntrySubmit<OrgasmusPayload>(submitFn, onSuccess);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await submit({
      type: "ORGASMUS",
      startTime: fromDatetimeLocal(startTime, tz).toISOString(),
      // Unterart gewählt → deren voller Code; sonst nur die Hauptart (Haupt-Token).
      orgasmusArt: subCode || art,
      note: note.trim() || null,
    });
  }

  // Haupt-Dropdown: eindeutige Hauptarten in Listenreihenfolge.
  const mainOptions = options.reduce<{ value: string; label: string }[]>((acc, o) => {
    if (!acc.some((m) => m.value === o.mainToken)) acc.push({ value: o.mainToken, label: o.mainLabel });
    return acc;
  }, []);
  // Unterart-Dropdown: Einträge der gewählten Hauptart, die eine Unterart haben.
  const subArtOptions = options.filter((o) => o.mainToken === art && o.subLabel).map((o) => ({ value: o.code, label: o.subLabel }));
  const defaultLabel = isEdit ? tc("update") : t("saveBtn");

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <RequiredHint />
      <DateTimePicker
        label={tc("dateTime")}
        value={startTime}
        onChange={(e) => setStartTime(e.target.value)}
        required
        {...(maxTime && { max: maxTime })}
      />

      <Select
        label={t("type")}
        value={art}
        onChange={(e) => { setArt(e.target.value); setSubCode(""); }}
        required
        options={mainOptions}
      />

      {subArtOptions.length > 0 && (
        <Select
          label={t("subType")}
          value={subCode}
          onChange={(e) => setSubCode(e.target.value)}
          placeholder={t("noSubType")}
          options={subArtOptions}
        />
      )}

      <Textarea
        label={tc("commentOptional")}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={3}
      />

      <FormError message={error} />

      <div className="flex flex-col-reverse sm:flex-row gap-3 pt-1">
        {onCancel && (
          <Button type="button" variant="secondary" fullWidth onClick={onCancel}>
            {tc("cancel")}
          </Button>
        )}
        <Button
          type="submit"
          variant={submitVariant}
          semantic={submitVariant === "semantic" ? "orgasm" : undefined}
          fullWidth
          loading={saving}
          icon={submitVariant === "primary" ? <Droplets size={16} /> : undefined}
        >
          {submitLabel ?? defaultLabel}
        </Button>
      </div>
    </form>
  );
}
