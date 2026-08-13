"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Gavel } from "lucide-react";
import { useTranslations } from "next-intl";
import { fromDatetimeLocal } from "@/lib/utils";
import { MANUAL_OFFENSE_TITLE_MAX_LENGTH, MANUAL_OFFENSE_DESCRIPTION_MAX_LENGTH } from "@/lib/constants";
import AdminActionFormShell from "@/app/components/AdminActionFormShell";
import DateTimePicker from "@/app/components/DateTimePicker";
import FormError from "@/app/components/FormError";
import Input from "@/app/components/Input";
import Textarea from "@/app/components/Textarea";
import Button from "@/app/components/Button";
import { parseApiErrorCode } from "@/lib/apiClient";
import { useApiError } from "@/app/hooks/useApiError";

/** Deutscher Name wie die Geschwister-Formulare (`OrgasmusAnforderungForm`, `VerschlussAnforderungForm`)
 *  und der Routen-Abschnitt `vergehen` wie `aufgabe`/`pruefung` daneben — die Ausnahme der
 *  Englisch-Regel für ein Stück, das ein bestehendes deutsches Muster spiegeln muss. Die
 *  Server-Seite dieses Features ist durchgehend englisch (`manualOffenseService`, `ManualOffense`). */
export default function VergehenForm({ userId, tz, nowDefault }: { userId: string; tz: string; nowDefault: string }) {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const apiError = useApiError();
  const router = useRouter();
  // Zurück ins STRAFBUCH, nicht in den Aktionen-Hub: von dort kommt man, wenn man ein Vergehen
  // notiert, und dort will man das Ergebnis sehen. Der Hub bleibt als zweiter Einstieg bestehen —
  // er listet alle Aktionen, und diese gehört dazu. Der Zurück-Pfeil zeigt aufs selbe Ziel, sonst
  // führte Speichern hierhin und Abbrechen woandershin.
  const target = `/admin/users/${userId}/strafbuch`;

  const [occurredAt, setOccurredAt] = useState(nowDefault);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/admin/offense", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          occurredAt: fromDatetimeLocal(occurredAt, tz).toISOString(),
          title: title.trim(),
          description: description.trim() || undefined,
        }),
      });
      if (res.ok) router.push(target);
      else setError(apiError(await parseApiErrorCode(res)));
    } catch {
      setError(tc("networkError"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminActionFormShell
      userId={userId}
      backLabel={t("strafbuch")}
      backHref={target}
      icon={<Gavel size={20} strokeWidth={2} />}
      iconBg="var(--color-warn-bg)"
      iconColor="var(--color-warn)"
      title={t("recordOffense")}
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {/* `required`: ein geleertes Feld ergäbe `fromDatetimeLocal("")` → Invalid Date, und
            `toISOString()` würfe im `try` — der Nutzer läse „Netzwerkfehler" für ein leeres Feld. */}
        <DateTimePicker
          label={t("offenseOccurredAt")}
          value={occurredAt}
          onChange={(e) => setOccurredAt(e.target.value)}
          hint={t("offenseOccurredAtHint")}
          required
        />
        <Input
          label={t("offenseTitle")}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={MANUAL_OFFENSE_TITLE_MAX_LENGTH}
          placeholder={t("offenseTitlePlaceholder")}
          required
        />
        <Textarea
          label={t("offenseDescription")}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={MANUAL_OFFENSE_DESCRIPTION_MAX_LENGTH}
          rows={3}
          hint={t("offenseDescriptionHint")}
        />

        <FormError message={error} variant="compact" />

        <Button
          type="submit"
          variant="semantic"
          semantic="warn"
          fullWidth
          loading={saving}
          icon={<Gavel size={16} />}
        >
          {saving ? t("sending") : t("recordOffense")}
        </Button>
      </form>
    </AdminActionFormShell>
  );
}
