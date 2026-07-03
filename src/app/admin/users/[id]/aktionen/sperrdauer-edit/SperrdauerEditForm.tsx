"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { Lock } from "lucide-react";
import ActionModal from "@/app/components/ActionModal";
import Button from "@/app/components/Button";
import FormError from "@/app/components/FormError";
import { formatDateTime, toDateLocale, APP_TZ } from "@/lib/utils";

interface Props {
  userId: string;
  sperrzeitId: string;
  endetAt: Date | null;
  nachricht: string | null;
  /** Governing timezone of the data owner (sub). Defaults to APP_TZ (Europe/Zurich). */
  tz?: string;
}

/** Edit / withdraw view for an active Sperrzeit. Two paths:
 *  - "Zurückziehen": PATCH withdraw, back to /aktionen
 *  - "Ersetzen": PATCH withdraw, then redirect to verschluss-anforderung form
 *    (which only renders SPERRZEIT mode when no active sperrzeit exists — so the
 *    withdraw must complete first). */
export default function SperrdauerEditForm({ userId, sperrzeitId, endetAt, nachricht, tz = APP_TZ }: Props) {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const router = useRouter();
  const dl = toDateLocale(useLocale());
  const [busy, setBusy] = useState<"withdraw" | "replace" | null>(null);
  const [error, setError] = useState("");

  async function withdraw(replace: boolean) {
    setBusy(replace ? "replace" : "withdraw");
    setError("");
    try {
      const res = await fetch(`/api/admin/verschluss-anforderung/${sperrzeitId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "withdraw" }),
      });
      if (!res.ok) throw new Error();
      router.push(
        replace
          ? `/admin/users/${userId}/aktionen/verschluss-anforderung`
          : `/admin/users/${userId}/aktionen`,
      );
      router.refresh();
    } catch {
      setError(tc("networkError"));
      setBusy(null);
    }
  }

  const close = () => router.push(`/admin/users/${userId}/aktionen`);
  const endsLabel = endetAt
    ? t("lockDurationActiveUntil", { date: formatDateTime(endetAt, dl, tz) })
    : t("lockDurationIndefinite");

  return (
    <ActionModal
      open={true}
      onClose={close}
      title={t("editLockDurationTitle")}
      icon={<Lock size={20} strokeWidth={2} style={{ color: "var(--color-sperrzeit)" }} />}
      iconBg="var(--color-sperrzeit-bg)"
    >
      <div className="flex flex-col gap-4 p-5">
        <div className="text-sm text-foreground-muted flex flex-col gap-1">
          <p>{endsLabel}</p>
          {nachricht && <p className="italic text-foreground-faint">„{nachricht}"</p>}
        </div>
        <FormError message={error} />
        <div className="flex flex-col gap-2">
          <Button
            onClick={() => withdraw(true)}
            disabled={busy !== null}
            loading={busy === "replace"}
            variant="primary"
            fullWidth
          >
            {t("replaceLockDuration")}
          </Button>
          <Button
            onClick={() => withdraw(false)}
            disabled={busy !== null}
            loading={busy === "withdraw"}
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
