"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toDatetimeLocal } from "@/lib/utils";
import { ORGASMUS_ARTEN } from "@/lib/constants";
import FormError from "@/app/components/FormError";
import RequiredHint from "@/app/components/RequiredHint";
import DateTimePicker from "@/app/components/DateTimePicker";
import Select from "@/app/components/Select";
import Textarea from "@/app/components/Textarea";
import Button from "@/app/components/Button";
import { Droplets } from "lucide-react";

export interface OrgasmusPayload {
  type: "ORGASMUS";
  startTime: string;
  orgasmusArt: string;
  note: string | null;
}

/**
 * Result contract for submitFn callers:
 *   { ok: true }       → Core navigates away (caller can also show toast).
 *   { ok: false, ... } → Core displays the error inline.
 *   { offline: true }  → Caller handled queuing; Core navigates away silently.
 */
export type SubmitResult =
  | { ok: true }
  | { ok: false; error: string }
  | { offline: true };

const SUB_ARTEN: Record<string, string[]> = {
  "Orgasmus": ["Masturbation", "Geschlechtsverkehr", "durch andere Person", "durch Technik"],
  "ruinierter Orgasmus": ["Verschlossen", "Anal"],
};

function parseArt(stored: string | null | undefined): { art: string; subArt: string } {
  if (!stored) return { art: ORGASMUS_ARTEN[0], subArt: "" };
  const sep = stored.indexOf(" – ");
  if (sep === -1) return { art: stored, subArt: "" };
  return { art: stored.slice(0, sep), subArt: stored.slice(sep + 3) };
}

interface Props {
  initial?: { startTime: string; note?: string | null; orgasmusArt?: string | null };
  maxTime?: string;
  isEdit?: boolean;
  /** Called when the form is submitted. Core manages saving/error state internally. */
  submitFn: (payload: OrgasmusPayload) => Promise<SubmitResult>;
  /** Optional "Cancel" button — hidden when omitted (admin shell provides a back-link). */
  onCancel?: () => void;
  /** Submit-button variant — "semantic" with orgasm color in user context, "primary" in admin. */
  submitVariant?: "semantic" | "primary";
  /** Overrides default submit label. Defaults to orgasmForm.saveBtn / common.update. */
  submitLabel?: string;
}

export default function OrgasmusFormCore({
  initial, maxTime, isEdit = false, submitFn, onCancel, submitVariant = "semantic", submitLabel,
}: Props) {
  const t = useTranslations("orgasmForm");
  const tc = useTranslations("common");
  const parsed = parseArt(initial?.orgasmusArt);

  const [startTime, setStartTime] = useState(toDatetimeLocal(initial?.startTime) || toDatetimeLocal(new Date()));
  const [art, setArt] = useState(parsed.art);
  const [subArt, setSubArt] = useState(parsed.subArt);
  const [note, setNote] = useState(initial?.note ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const ARTEN_LABELS: Record<string, string> = {
    "Orgasmus": t("artOrgasmus"),
    "ruinierter Orgasmus": t("artRuiniert"),
    "feuchter Traum": t("artTraum"),
  };
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
    setSaving(true);
    setError("");
    try {
      const result = await submitFn({
        type: "ORGASMUS",
        startTime: new Date(startTime).toISOString(),
        orgasmusArt: subArt ? `${art} – ${subArt}` : art,
        note: note.trim() || null,
      });
      if ("error" in result && !result.ok) setError(result.error);
    } catch {
      setError(tc("networkError"));
    } finally {
      setSaving(false);
    }
  }

  const artOptions = ORGASMUS_ARTEN.map((a) => ({ value: a, label: ARTEN_LABELS[a] ?? a }));
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
        options={artOptions}
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
