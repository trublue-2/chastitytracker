"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Droplets } from "lucide-react";
import { toDatetimeLocal, fromDatetimeLocal } from "@/lib/utils";
import type { ResolvedReason } from "@/lib/reasonsService";
import FormError from "@/app/components/FormError";
import RequiredHint from "@/app/components/RequiredHint";
import DateTimePicker from "@/app/components/DateTimePicker";
import Select from "@/app/components/Select";
import Textarea from "@/app/components/Textarea";
import Button from "@/app/components/Button";
import { useEntrySubmit } from "@/app/hooks/useEntrySubmit";
import type { OrgasmusPayload, SubmitResult } from "./types";

const SUB_ARTEN: Record<string, string[]> = {
  "Orgasmus": ["Masturbation", "Geschlechtsverkehr", "durch andere Person", "durch Technik"],
  "ruinierter Orgasmus": ["Verschlossen", "Anal"],
};

function parseArt(stored: string | null | undefined, fallbackArt: string): { art: string; subArt: string } {
  if (!stored) return { art: fallbackArt, subArt: "" };
  const sep = stored.indexOf(" – ");
  if (sep === -1) return { art: stored, subArt: "" };
  return { art: stored.slice(0, sep), subArt: stored.slice(sep + 3) };
}

interface Props {
  initial?: { startTime: string; note?: string | null; orgasmusArt?: string | null };
  /** Owner-scoped, display-ready orgasm types (built-in defaults when the owner has no custom config). */
  artOptions: ResolvedReason[];
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
  const parsed = parseArt(initial?.orgasmusArt, artOptions[0]?.code ?? "");

  const [startTime, setStartTime] = useState(toDatetimeLocal(initial?.startTime, tz) || nowDefault);
  const [art, setArt] = useState(parsed.art);
  const [subArt, setSubArt] = useState(parsed.subArt);
  const [note, setNote] = useState(initial?.note ?? "");
  const { saving, error, submit } = useEntrySubmit<OrgasmusPayload>(submitFn, onSuccess);

  const SUB_ARTEN_LABELS: Record<string, string> = {
    "Masturbation": t("subMasturbation"),
    "Geschlechtsverkehr": t("subGeschlecht"),
    "durch andere Person": t("subPerson"),
    "durch Technik": t("subTechnik"),
    "Verschlossen": t("subVerschlossen"),
    "Anal": t("subAnal"),
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await submit({
      type: "ORGASMUS",
      startTime: fromDatetimeLocal(startTime, tz).toISOString(),
      orgasmusArt: subArt ? `${art} – ${subArt}` : art,
      note: note.trim() || null,
    });
  }

  const artSelectOptions = artOptions.map((r) => ({ value: r.code, label: r.label }));
  const subArtOptions = (SUB_ARTEN[art] ?? []).map((s) => ({ value: s, label: SUB_ARTEN_LABELS[s] ?? s }));
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
        onChange={(e) => { setArt(e.target.value); setSubArt(""); }}
        required
        options={artSelectOptions}
      />

      {subArtOptions.length > 0 && (
        <Select
          label={t("subType")}
          value={subArt}
          onChange={(e) => setSubArt(e.target.value)}
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
