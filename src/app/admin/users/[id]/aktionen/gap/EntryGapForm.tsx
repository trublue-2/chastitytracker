"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import AdminActionFormShell from "@/app/components/AdminActionFormShell";
import EntryFormShell from "@/app/components/EntryFormShell";
import DateTimePicker from "@/app/components/DateTimePicker";
import Select from "@/app/components/Select";
import Textarea from "@/app/components/Textarea";
import Button from "@/app/components/Button";
import FormError from "@/app/components/FormError";
import RequiredHint from "@/app/components/RequiredHint";
import { fetchWithTimeout, parseApiErrorCode } from "@/lib/client/apiClient";
import { useApiError } from "@/app/hooks/useApiError";
import { fromDatetimeLocal } from "@/lib/shared/utils";
import type { ResolvedReason } from "@/lib/entries/reasonsService";
import { actionSign } from "@/app/entries/actionSign";
import { LockClosedIcon, LockOpenIcon } from "@/app/components/lockIcons";
import type { EntryGapKind } from "@/lib/entries/entryGapService";

/** Beschriftung und Zeichen je Art. Die beiden Zeitpunkte heissen hier „erster" und „zweiter": bei
 *  der Pause ist der erste das Öffnen, bei der Tragezeit der Verschluss — die Reihenfolge am Bildschirm
 *  folgt der Zeit, die API-Felder (`openAt`/`lockAt`) werden erst beim Absenden zugeordnet. */
const COPY = {
  break: { sign: "OEFFNEN", title: "pauseTitle", intro: "pauseIntro", submit: "pauseSubmit", first: "pauseOpenAt", second: "pauseLockAt", Icon: LockOpenIcon },
  session: { sign: "VERSCHLUSS", title: "sessionTitle", intro: "sessionIntro", submit: "sessionSubmit", first: "sessionLockAt", second: "sessionOpenAt", Icon: LockClosedIcon },
} as const;

export default function EntryGapForm({ kind, userId, grundOptions, tz, nowDefault }: {
  kind: EntryGapKind;
  userId: string;
  grundOptions: ResolvedReason[];
  tz: string;
  nowDefault: string;
}) {
  const t = useTranslations("admin");
  const tCommon = useTranslations("common");
  const tOffen = useTranslations("openForm");
  const apiError = useApiError();
  const router = useRouter();
  const target = `/admin/users/${userId}/aktionen`;
  const copy = COPY[kind];

  const [first, setFirst] = useState("");
  const [second, setSecond] = useState("");
  const [grund, setGrund] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const res = await fetchWithTimeout("/api/admin/entries/gap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          userId,
          openAt: fromDatetimeLocal(kind === "session" ? second : first, tz).toISOString(),
          lockAt: fromDatetimeLocal(kind === "session" ? first : second, tz).toISOString(),
          oeffnenGrund: grund,
          note: note.trim(),
        }),
      });
      if (!res.ok) {
        setError(apiError(await parseApiErrorCode(res)));
        setSaving(false);
        return;
      }
      router.push(target);
    } catch {
      setError(tCommon("networkError"));
      setSaving(false);
    }
  }

  return (
    <AdminActionFormShell
      userId={userId}
      backLabel={t("aktionen")}
      {...actionSign(copy.sign)}
      title={t(copy.title)}
    >
      <EntryFormShell
        onSubmit={handleSubmit}
        onCancel={() => router.push(target)}
        cancelLabel={tCommon("cancel")}
        actions={
          <Button type="submit" variant="primary" fullWidth loading={saving} icon={<copy.Icon size={16} />}>
            {t(copy.submit)}
          </Button>
        }
      >
        <RequiredHint />
        <p className="text-fliess text-foreground-muted">{t(copy.intro)}</p>
        <DateTimePicker
          label={t(copy.first)}
          value={first}
          onChange={(e) => setFirst(e.target.value)}
          max={nowDefault}
          required
        />
        <DateTimePicker
          label={t(copy.second)}
          value={second}
          onChange={(e) => setSecond(e.target.value)}
          min={first || undefined}
          max={nowDefault}
          required
        />
        <Select
          label={tOffen("grundLabel")}
          value={grund}
          onChange={(e) => setGrund(e.target.value)}
          required
          placeholder="–"
          options={grundOptions.map((g) => ({ value: g.code, label: g.label }))}
        />
        <Textarea
          label={tCommon("comment")}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          required
          placeholder={tOffen("commentPlaceholder")}
        />
        <FormError message={error} />
      </EntryFormShell>
    </AdminActionFormShell>
  );
}
