"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import ActionModal from "@/app/components/ActionModal";
import DateTimePicker from "@/app/components/DateTimePicker";
import Button from "@/app/components/Button";
import FormError from "@/app/components/FormError";
import { cardActionCls } from "@/app/components/inputStyles";
import { actionIcon } from "@/app/entries/actionSign";
import { fetchWithTimeout, parseApiErrorCode } from "@/lib/client/apiClient";
import { useApiError } from "@/app/hooks/useApiError";
import { toDatetimeLocal, fromDatetimeLocal } from "@/lib/shared/utils";

const InspectionIcon = actionIcon("PRUEFUNG");

/** Vorschlag der neuen Frist: eine Stunde nach der späteren von alter Frist und „jetzt". */
const SUGGESTED_EXTENSION_MS = 60 * 60 * 1000;

/**
 * Frist einer offenen Kontrolle verlängern — die Handlung, die zur überfälligen Kontrolle passt und
 * bisher nur als „zurückziehen und neu anfordern" ging (`action: "extend"`, deckungsgleich mit dem
 * MCP-Werkzeug `edit_inspection`). Steht als beschrifteter Knopf unter der Kontroll-Zeile.
 */
export default function ExtendInspectionButton({ id, deadline, tz, minNow }: ExtendProps) {
  const t = useTranslations("admin");
  const [open, setOpen] = useState(false);
  const title = t("extendInspectionTitle");

  return (
    <>
      <button onClick={() => setOpen(true)} className={cardActionCls("inspect")}>
        <InspectionIcon size={16} aria-hidden />
        {title}
      </button>
      <ActionModal
        open={open}
        onClose={() => setOpen(false)}
        title={title}
        icon={<InspectionIcon size={20} strokeWidth={2} style={{ color: "var(--color-inspect)" }} />}
        iconBg="var(--color-inspect-bg)"
      >
        {/* Erst beim Öffnen mounten: so startet das Formular jedes Mal frisch aus der aktuellen Frist. */}
        {open && <ExtendInspectionForm id={id} deadline={deadline} tz={tz} minNow={minNow} onDone={() => setOpen(false)} />}
      </ActionModal>
    </>
  );
}

interface ExtendProps {
  id: string;
  deadline: Date;
  /** Zeitzone des Subs (Datenbesitzer). */
  tz: string;
  /** Server-„jetzt" als Wanduhr in der Sub-Zeitzone — `min` der Eingabe (hydrationssicher). */
  minNow: string;
}

function ExtendInspectionForm({ id, deadline, tz, minNow, onDone }: ExtendProps & { onDone: () => void }) {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const apiError = useApiError();
  const router = useRouter();
  const [localEnd, setLocalEnd] = useState(() => {
    const baseMs = Math.max(deadline.getTime(), fromDatetimeLocal(minNow, tz).getTime());
    return toDatetimeLocal(new Date(baseMs + SUGGESTED_EXTENSION_MS), tz);
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!localEnd) {
      setError(apiError("INVALID_DATETIME"));
      return;
    }
    setSaving(true);
    setError(null);
    // „Später als die bisherige Frist und in der Zukunft" setzt der Service durch; kein zweiter
    // Client-Check, der davonläuft.
    try {
      const res = await fetchWithTimeout(`/api/admin/kontrollen/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "extend", deadline: fromDatetimeLocal(localEnd, tz).toISOString() }),
      });
      if (!res.ok) {
        setError(apiError(await parseApiErrorCode(res)));
        setSaving(false);
        return;
      }
      onDone();
      router.refresh();
    } catch {
      setError(apiError(null));
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 p-5">
      <DateTimePicker label={t("extendInspectionUntil")} value={localEnd} min={minNow} onChange={(e) => setLocalEnd(e.target.value)} />
      <FormError message={error} />
      <Button onClick={save} loading={saving} disabled={saving} variant="primary" fullWidth>
        {tc("save")}
      </Button>
    </div>
  );
}
