"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import Sheet from "./Sheet";
import Button from "./Button";
import useToast from "@/app/hooks/useToast";
import { useActionPatch } from "@/app/hooks/useActionPatch";
import { useApiError } from "@/app/hooks/useApiError";
import { parseApiErrorCode } from "@/lib/apiClient";
import type { JournalVisibility } from "@/lib/constants";
import JournalVisibilityOptions from "./JournalVisibilityOptions";
import { asVisibility } from "@/lib/journal/journal";

/**
 * Das Sichtbarkeits-Etikett eines eigenen Tagebuch-Eintrags — und zugleich der Weg, es zu ändern.
 *
 * Ein TEXT-Knopf („Nur für mich"), kein Symbol und keine Farbe allein: wer die Stufe nicht sieht oder
 * Farben nicht unterscheidet, muss sie trotzdem lesen können. Er öffnet ein Blatt mit den drei Stufen
 * als Radiogruppe; unter jeder steht im Klartext, was die Keyholderin dann sieht. Gespeichert wird
 * erst mit „Fertig" — ein versehentlicher Tipp auf „Mit Keyholder teilen" teilt also noch nichts.
 * Zurücknehmen geht auf demselben Weg, ohne Rückfrage nach dem Grund.
 */
export default function JournalVisibilityButton({ id, visibility }: { id: string; visibility: string }) {
  const t = useTranslations("journal");
  const tc = useTranslations("common");
  const toast = useToast();
  const apiError = useApiError();
  const { saving, run } = useActionPatch();
  const current = asVisibility(visibility);
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<JournalVisibility>(current);

  const label = t(`vis${current}`);

  function openSheet() {
    setChoice(current);
    setOpen(true);
  }

  async function save() {
    if (choice === current) {
      setOpen(false);
      return;
    }
    const res = await run(`/api/journal/${id}`, { visibility: choice });
    if (!res) return toast.error(tc("networkError"));
    if (!res.ok) return toast.error(apiError(await parseApiErrorCode(res)));
    toast.success(t("visibilityChanged", { value: t(`vis${choice}`) }));
    setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={openSheet}
        aria-haspopup="dialog"
        aria-label={t("visibilityChange", { value: label })}
        className={`${journalPillCls} hover:text-foreground hover:bg-surface-raised transition`}
      >
        {label}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={t("visibilitySheetTitle")} busy={saving}>
        <JournalVisibilityOptions value={choice} onChange={setChoice} />
        <div className="mt-4">
          <Button variant="primary" fullWidth loading={saving} onClick={save}>
            {t("done")}
          </Button>
        </div>
      </Sheet>
    </>
  );
}

/** Die Pille der Sichtbarkeit — als Knopf beim Sub, als blosses Etikett bei der Keyholderin. */
export const journalPillCls = "text-neben px-2 py-0.5 rounded-full border border-border text-foreground-muted whitespace-nowrap";
