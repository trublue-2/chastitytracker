"use client";

import { useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Pencil, Trash2 } from "lucide-react";
import Card from "./Card";
import ConfirmDialog from "./ConfirmDialog";
import JournalVisibilityButton, { journalPillCls } from "./JournalVisibilityButton";
import { iconActionCls } from "./inputStyles";
import useToast from "@/app/hooks/useToast";
import { useActionPatch } from "@/app/hooks/useActionPatch";
import { useApiError } from "@/app/hooks/useApiError";
import { parseApiErrorCode } from "@/lib/apiClient";
import { journalEditHref, type JournalCardEntry } from "@/lib/journal/journal";
import { formatDurationMs, formatTime, toDateLocale } from "@/lib/utils";

/**
 * Ein Tagebuch-Eintrag als Karte — für den Sub (`own`: Sichtbarkeit änderbar, Bearbeiten, Löschen)
 * und für die Keyholderin (`keyholder`: nur lesen). EINE Karte für beide Sichten, wie der
 * Posteingang: der Unterschied ist, was bedienbar ist, nicht wie ein Eintrag aussieht.
 *
 * Datum steht in der Tages-Überschrift der Liste (`DayGroups`), hier nur die Uhrzeit.
 */
export default function JournalEntryCard({ entry, tz, mode }: {
  entry: JournalCardEntry;
  tz: string;
  mode: "own" | "keyholder";
}) {
  const t = useTranslations("journal");
  const dl = toDateLocale(useLocale());
  const own = mode === "own";

  return (
    <Card padding="compact" className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-neben text-foreground-muted">
          {formatTime(entry.entryAt, dl, tz)}
          {entry.mood !== null && <> · {t("moodValue", { value: entry.mood })}</>}
        </span>
        <span className="flex items-center gap-1">
          {own ? (
            <>
              <JournalVisibilityButton id={entry.id} visibility={entry.visibility} />
              <JournalEntryActions id={entry.id} />
            </>
          ) : (
            <span className={journalPillCls}>
              {t(`vis${entry.visibility === "FULL" ? "FULL" : "MOOD_ONLY"}`)}
            </span>
          )}
        </span>
      </div>
      {entry.prompt && <p className="text-neben text-foreground-faint">{entry.prompt}</p>}
      {entry.text !== null
        ? <p className="text-fliess text-foreground whitespace-pre-wrap break-words">{entry.text}</p>
        : <p className="text-neben text-foreground-faint italic">{t("sharedNoText")}</p>}
      <p className="text-neben text-foreground-faint border-t border-border-subtle pt-1.5 mt-0.5">
        {entry.lockedMs !== null ? t("locked", { duration: formatDurationMs(entry.lockedMs, dl) }) : t("notLocked")}
        {entry.orgasmFreeMs !== null && <> · {t("orgasmFree", { duration: formatDurationMs(entry.orgasmFreeMs, dl) })}</>}
      </p>
    </Card>
  );
}

/** Bearbeiten und endgültig Löschen eines eigenen Eintrags. Eigenes Bauteil statt `EntryActions`:
 *  jenes kennt Protokoll-Einträge samt Partner-Prüfung und `/api/entries`. */
function JournalEntryActions({ id }: { id: string }) {
  const t = useTranslations("journal");
  const tc = useTranslations("common");
  const toast = useToast();
  const apiError = useApiError();
  const { saving, run } = useActionPatch();
  const [asking, setAsking] = useState(false);

  async function remove() {
    const res = await run(`/api/journal/${id}`, undefined, "DELETE");
    if (!res) return toast.error(tc("networkError"));
    if (!res.ok) return toast.error(apiError(await parseApiErrorCode(res)));
    toast.success(t("deleted"));
    setAsking(false);
  }

  return (
    <>
      <Link href={journalEditHref(id)} aria-label={tc("edit")} className={`${iconActionCls("neutral")} m-0`}>
        <Pencil size={15} />
      </Link>
      <button type="button" onClick={() => setAsking(true)} aria-label={tc("delete")} className={`${iconActionCls("warn")} m-0`}>
        <Trash2 size={15} />
      </button>
      <ConfirmDialog
        open={asking}
        title={t("deleteTitle")}
        message={t("deleteMessage")}
        confirmLabel={tc("delete")}
        danger
        loading={saving}
        onConfirm={remove}
        onCancel={() => setAsking(false)}
      />
    </>
  );
}
