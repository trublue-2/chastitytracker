"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";

import ActionModal from "@/app/components/ActionModal";
import Button from "@/app/components/Button";
import FormError from "@/app/components/FormError";
import { formatDateTime, toDateLocale, APP_TZ } from "@/lib/utils";
import { fetchWithTimeout } from "@/lib/apiClient";
import { LockClosedIcon } from "@/app/components/lockIcons";

interface Props {
  userId: string;
  lockPeriodId: string;
  endsAt: Date | null;
  message: string | null;
  /** Governing timezone of the data owner (sub). Defaults to APP_TZ (Europe/Zurich). */
  tz?: string;
}

/** Edit / withdraw view for an active Sperrzeit. Two paths:
 *  - "Zurückziehen": PATCH withdraw, back to /aktionen
 *  - "Ersetzen": PATCH withdraw, then redirect to verschluss-anforderung form
 *    (which only renders SPERRZEIT mode when no active sperrzeit exists — so the
 *    withdraw must complete first). */
export default function LockDurationEditForm({ userId, lockPeriodId, endsAt, message, tz = APP_TZ }: Props) {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const router = useRouter();
  const dl = toDateLocale(useLocale());
  const [saving, setSaving] = useState<"withdraw" | "replace" | null>(null);
  const [error, setError] = useState("");

  async function withdraw(replace: boolean) {
    setSaving(replace ? "replace" : "withdraw");
    setError("");
    try {
      const res = await fetchWithTimeout(`/api/admin/verschluss-anforderung/${lockPeriodId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "withdraw" }),
      });
      if (!res.ok) throw new Error();
      // `refresh()` VOR dem Wechsel, wie im Hausmuster (`PruefungForm`): das Ziel zeigt den
      // SPERRZEIT-Modus nur, wenn keine aktive Sperrzeit mehr existiert. Danach angestossen,
      // rennt der Anstoss gegen den Abruf der Zielroute — und der Rückzug hat zwar geklappt,
      // die Keyholderin steht aber auf einem Formular ohne diese Wahl.
      router.refresh();
      router.push(
        replace
          ? `/admin/users/${userId}/aktionen/verschluss-anforderung`
          : `/admin/users/${userId}/aktionen`,
      );
    } catch {
      setError(tc("networkError"));
      setSaving(null);
    }
  }

  const close = () => router.push(`/admin/users/${userId}/aktionen`);
  const endsLabel = endsAt
    ? t("lockDurationActiveUntil", { date: formatDateTime(endsAt, dl, tz) })
    : t("lockDurationIndefinite");

  return (
    <ActionModal
      open={true}
      onClose={close}
      title={t("editLockDurationTitle")}
      icon={<LockClosedIcon size={20} strokeWidth={2} style={{ color: "var(--color-sperrzeit)" }} />}
      iconBg="var(--color-sperrzeit-bg)"
    >
      <div className="flex flex-col gap-4 p-5">
        <div className="text-sm text-foreground-muted flex flex-col gap-1">
          <p>{endsLabel}</p>
          {message && <p className="italic text-foreground-faint">„{message}"</p>}
        </div>
        <FormError message={error} />
        <div className="flex flex-col gap-2">
          <Button
            onClick={() => withdraw(true)}
            disabled={saving !== null}
            loading={saving === "replace"}
            variant="primary"
            fullWidth
          >
            {t("replaceLockDuration")}
          </Button>
          <Button
            onClick={() => withdraw(false)}
            disabled={saving !== null}
            loading={saving === "withdraw"}
            variant="secondary"
            fullWidth
          >
            {t("withdrawLock")}
          </Button>
        </div>
      </div>
    </ActionModal>
  );
}
