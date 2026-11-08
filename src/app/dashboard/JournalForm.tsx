"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { NotebookPen } from "lucide-react";
import Button from "@/app/components/Button";
import DateTimePicker from "@/app/components/DateTimePicker";
import EntryFormShell from "@/app/components/EntryFormShell";
import FormError from "@/app/components/FormError";
import JournalVisibilityOptions from "@/app/components/JournalVisibilityOptions";
import Textarea from "@/app/components/Textarea";
import { quietLinkCls } from "@/app/components/inputStyles";
import useToast from "@/app/hooks/useToast";
import { useApiError } from "@/app/hooks/useApiError";
import { useEntrySubmit } from "@/app/hooks/useEntrySubmit";
import type { SubmitResult } from "@/app/entries/types";
import { parseApiErrorCode } from "@/lib/client/apiClient";
import { JOURNAL_MOOD_MAX, JOURNAL_MOOD_MIN, JOURNAL_TEXT_MAX, type JournalVisibility } from "@/lib/shared/constants";
import { JOURNAL_HREF } from "@/lib/journal/journal";
import { fromDatetimeLocal } from "@/lib/shared/time";

/** „Keine" und die Stufen 1–5 — die Auswahl, in der Reihenfolge der Knöpfe. */
const MOOD_CHOICES: (number | null)[] = [
  null,
  ...Array.from({ length: JOURNAL_MOOD_MAX - JOURNAL_MOOD_MIN + 1 }, (_, i) => JOURNAL_MOOD_MIN + i),
];

interface Payload {
  entryAt?: string;
  text: string;
  mood: number | null;
  visibility: JournalVisibility;
  prompt?: string | null;
}

/**
 * Einen Tagebuch-Eintrag schreiben oder bearbeiten.
 *
 * Die Leitfrage steht als SICHTBARE Beschriftung über dem Textfeld, nicht als Platzhalter: ein
 * Platzhalter verschwindet beim ersten Buchstaben, und wer den Eintrag später liest, weiss nicht mehr,
 * worauf er antwortete. Gespeichert wird sie als Kopie des Texts. Beim Bearbeiten bleibt sie, wie sie
 * war — sie gehört zum Moment des Schreibens.
 *
 * Die Sichtbarkeit steht als leise Zeile („Wird gespeichert als …") statt als offener Umschalter: der
 * Moment des Schreibens soll nicht mit der Frage beginnen, wer mitliest. Geändert wird sie hier oder
 * später in der Liste.
 */
export default function JournalForm({
  mode, id, tz, nowDefault, initialEntryAt, initialText = "", initialMood = null, initialVisibility, prompts = [], initialPromptIndex = 0,
  fixedPrompt = null,
}: {
  mode: "create" | "edit";
  id?: string;
  tz: string;
  nowDefault: string;
  initialEntryAt: string;
  initialText?: string;
  initialMood?: number | null;
  initialVisibility: JournalVisibility;
  /** Leitfragen zur Auswahl — leer, wenn der Sub sie abgeschaltet hat oder beim Bearbeiten. */
  prompts?: string[];
  initialPromptIndex?: number;
  /** Beim Bearbeiten: die damals gestellte Frage, nur zur Ansicht. */
  fixedPrompt?: string | null;
}) {
  const t = useTranslations("journal");
  const tc = useTranslations("common");
  const router = useRouter();
  const toast = useToast();
  const apiError = useApiError();
  const moodGroup = useId();

  const [entryAt, setEntryAt] = useState(initialEntryAt);
  const [text, setText] = useState(initialText);
  const [mood, setMood] = useState<number | null>(initialMood);
  const [visibility, setVisibility] = useState<JournalVisibility>(initialVisibility);
  const [visibilityOpen, setVisibilityOpen] = useState(false);
  const [promptIndex, setPromptIndex] = useState<number | null>(prompts.length ? initialPromptIndex : null);

  // Beim Bearbeiten ist `prompts` leer und damit `promptIndex` null: dann gilt die damals gestellte Frage.
  const prompt = promptIndex === null ? fixedPrompt : prompts[promptIndex] ?? null;

  function otherPrompt() {
    // Nie dieselbe Frage zweimal hintereinander — sonst wirkt der Knopf, als täte er nichts.
    const next = (Math.floor(Math.random() * (prompts.length - 1)) + 1 + (promptIndex ?? 0)) % prompts.length;
    setPromptIndex(next);
  }

  async function submitFn(payload: Payload): Promise<SubmitResult> {
    const res = await fetch(mode === "create" ? "/api/journal" : `/api/journal/${id}`, {
      method: mode === "create" ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return { ok: false, error: apiError(await parseApiErrorCode(res)) };
    toast.success(t("saved"));
    return { ok: true };
  }

  const { saving, error, submit } = useEntrySubmit(submitFn, () => router.push(JOURNAL_HREF));

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    submit({
      // Beim Bearbeiten nur, wenn er geändert wurde: das Feld kennt nur Minuten, und eine reine
      // Textkorrektur schnitte sonst Sekunden ab und verschöbe den Eintrag in der Reihenfolge.
      ...((mode === "create" || entryAt !== initialEntryAt) && { entryAt: fromDatetimeLocal(entryAt, tz).toISOString() }),
      text,
      mood,
      visibility,
      ...(mode === "create" && { prompt }),
    });
  }

  return (
    <EntryFormShell
      onSubmit={handleSubmit}
      onCancel={() => router.push(JOURNAL_HREF)}
      cancelLabel={tc("cancel")}
      actions={
        <Button type="submit" variant="primary" fullWidth loading={saving} icon={<NotebookPen size={16} />}>
          {tc("save")}
        </Button>
      }
    >
      <DateTimePicker
        label={tc("dateTime")}
        value={entryAt}
        onChange={(e) => setEntryAt(e.target.value)}
        required
        max={nowDefault}
      />

      <div className="flex flex-col gap-2">
        <Textarea
          label={prompt ?? t("textLabel")}
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={7}
          maxLength={JOURNAL_TEXT_MAX}
          required
        />
        {mode === "create" && prompts.length > 0 && (
          <div className="flex gap-4">
            {promptIndex !== null ? (
              <>
                {prompts.length > 1 && (
                  <button type="button" onClick={otherPrompt} className={quietLinkCls}>{t("otherPrompt")}</button>
                )}
                <button type="button" onClick={() => setPromptIndex(null)} className={quietLinkCls}>{t("noPrompt")}</button>
              </>
            ) : (
              <button type="button" onClick={() => setPromptIndex(initialPromptIndex)} className={quietLinkCls}>{t("withPrompt")}</button>
            )}
          </div>
        )}
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium text-foreground mb-1">
          {t("mood")} <span className="font-normal text-foreground-faint">({t("moodOptional")})</span>
        </legend>
        <div className="flex gap-2">
          {MOOD_CHOICES.map((m) => {
            const checked = mood === m;
            return (
              <label
                key={m ?? "none"}
                className={`relative flex-1 min-h-11 flex items-center justify-center rounded-lg border text-fliess cursor-pointer transition-colors focus-within:ring-2 focus-within:ring-foreground ${
                  checked ? "border-foreground bg-surface-raised text-foreground font-medium" : "border-border text-foreground-muted hover:bg-surface-raised"
                }`}
              >
                <input
                  type="radio"
                  name={moodGroup}
                  className="sr-only"
                  checked={checked}
                  onChange={() => setMood(m)}
                  aria-label={m === null ? t("moodClear") : t("moodOption", { value: m })}
                />
                <span aria-hidden="true">{m ?? t("moodClear")}</span>
              </label>
            );
          })}
        </div>
        <div className="flex justify-between text-neben text-foreground-faint px-1" aria-hidden="true">
          <span>1 = {t("moodBad")}</span>
          <span>5 = {t("moodGood")}</span>
        </div>
      </fieldset>

      <div className="flex flex-col gap-2">
        <p className="text-neben text-foreground-muted">
          {t("savedAs", { value: t(`vis${visibility}`) })}{" "}
          <button
            type="button"
            onClick={() => setVisibilityOpen((o) => !o)}
            aria-expanded={visibilityOpen}
            className={`${quietLinkCls} underline underline-offset-2`}
          >
            {t("change")}
          </button>
        </p>
        {visibilityOpen && <JournalVisibilityOptions value={visibility} onChange={setVisibility} />}
      </div>

      <FormError message={error} />
    </EntryFormShell>
  );
}
