"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import useToast from "@/app/hooks/useToast";
import { useApiError } from "@/app/hooks/useApiError";
import { fetchWithTimeout, parseApiErrorCode } from "@/lib/apiClient";
import Button from "@/app/components/Button";

/**
 * Ein wartender AUFRUF unter dem Helden: was jetzt zu tun ist, und „Aufruf zurücknehmen".
 *
 * Geteilt vom offenen Helden (der Verschluss wartet auf „Riegel zu", docs/riegel-konzept.md) und
 * vom verschlossenen (die Öffnung wartet bei der LockMeBox auf „Riegel offen", docs/lockmebox.md).
 *
 * Zurücknehmen = den Eintrag löschen. Kein eigener Endpunkt: „ist nie passiert" IST das Löschen,
 * und die Route räumt dabei auch das noch nicht ausgeführte Box-Kommando ab. Ohne `force`: ein
 * schwebender Aufruf steht nicht in der Kette, die Route nimmt ihn von der Ketten-Prüfung aus.
 */
export default function PendingCallNotice({ entryId, message }: { entryId: string; message: string }) {
  const t = useTranslations("dashboard");
  const router = useRouter();
  const toast = useToast();
  const apiError = useApiError();
  const [saving, setSaving] = useState(false);

  async function withdraw() {
    if (saving) return;
    setSaving(true);
    try {
      const res = await fetchWithTimeout(`/api/entries/${entryId}`, { method: "DELETE" });
      if (!res.ok) { toast.error(apiError(await parseApiErrorCode(res))); return; }
      router.refresh();
    } catch {
      toast.error(t("lockCallWithdrawFailed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="relative mt-4 flex flex-col gap-2">
      <p className="text-sm font-medium text-warn">{message}</p>
      <Button variant="secondary" loading={saving} onClick={withdraw}>
        {t("lockCallWithdraw")}
      </Button>
    </div>
  );
}
