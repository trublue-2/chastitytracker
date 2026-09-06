"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import DateTimePicker from "@/app/components/DateTimePicker";
import Checkbox from "@/app/components/Checkbox";
import Button from "@/app/components/Button";
import FormError from "@/app/components/FormError";
import { fetchWithTimeout, parseApiErrorCode } from "@/lib/apiClient";
import { useApiError } from "@/app/hooks/useApiError";
import { toDatetimeLocal, fromDatetimeLocal } from "@/lib/utils";

interface Props {
  /** Id der aktiven bzw. geplanten Sperrzeit (VerschlussAnforderung, art=SPERRZEIT). */
  lockPeriodId: string;
  /** Aktuelles Ende oder `null` = unbefristet — Vorbelegung der Felder. */
  endsAt: Date | null;
  /** Zeitzone des Subs (Datenbesitzer) — formatiert die Vorbelegung und den Submit-Wert. */
  tz: string;
  /** Server-„jetzt" als Wanduhr in der Sub-Zeitzone — `min` der Datetime-Eingabe (hydrationssicher). */
  minNow: string;
  /** Nach erfolgreichem Speichern — der Aufrufer schliesst das Modal / lädt neu. */
  onSuccess: () => void;
}

/**
 * Bearbeitet NUR das Ende einer bestehenden Sperrzeit (`action: "setEnd"`) — deckungsgleich mit dem
 * MCP-Werkzeug `edit_lock_period`. Reinigung o. Ä. ändert man weiterhin über „Ersetzen". Geteilt vom
 * Bleistift-Knopf der Übersicht ({@link EditLockPeriodButton}) und dem Aktionen-Modal
 * (`LockDurationEditForm`), damit die Setz-Logik an EINER Stelle steht.
 */
export default function LockPeriodEndForm({ lockPeriodId, endsAt, tz, minNow, onSuccess }: Props) {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const apiError = useApiError();
  const nowBaseMs = fromDatetimeLocal(minNow, tz).getTime();

  const [indefinite, setIndefinite] = useState(endsAt === null);
  // Bei „unbefristet" beim Öffnen: ein sinnvoller Vorschlag (jetzt + 24 h), falls die Keyholderin
  // doch ein Datum setzt — sonst stünde das Feld leer und der erste Klick liefe ins Leere.
  const [localEnd, setLocalEnd] = useState(() =>
    endsAt ? toDatetimeLocal(endsAt, tz) : toDatetimeLocal(new Date(nowBaseMs + 24 * 60 * 60 * 1000), tz),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    // Leeres Feld: der Picker lässt sich leeren, und `fromDatetimeLocal("")` wäre ein Invalid Date,
    // dessen `toISOString()` würfe. Denselben Code liefert der Server bei ungültigem Datum zurück.
    if (!indefinite && !localEnd) {
      setError(apiError("INVALID_DATETIME"));
      return;
    }
    setSaving(true);
    setError(null);
    // Die Zukunfts-Regel setzt der Service durch (LOCK_PERIOD_END_MUST_BE_FUTURE); der Picker-`min`
    // hält die grobe Vergangenheit ab. Kein zweiter Client-Check, der irgendwann davonläuft.
    try {
      const body = indefinite
        ? { action: "setEnd", indefinite: true }
        : { action: "setEnd", endsAt: fromDatetimeLocal(localEnd, tz).toISOString() };
      const res = await fetchWithTimeout(`/api/admin/verschluss-anforderung/${lockPeriodId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        setError(apiError(await parseApiErrorCode(res)));
        setSaving(false);
        return;
      }
      onSuccess();
    } catch {
      setError(apiError(null));
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 p-5">
      <Checkbox
        label={t("lockPeriodIndefinite")}
        checked={indefinite}
        onChange={(e) => setIndefinite(e.target.checked)}
      />
      {!indefinite && (
        <DateTimePicker
          label={t("lockedUntil")}
          value={localEnd}
          min={minNow}
          onChange={(e) => setLocalEnd(e.target.value)}
        />
      )}
      <FormError message={error} />
      <Button onClick={save} loading={saving} disabled={saving} variant="primary" fullWidth>
        {tc("save")}
      </Button>
    </div>
  );
}
