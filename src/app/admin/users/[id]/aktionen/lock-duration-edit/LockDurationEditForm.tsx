"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";

import ActionModal from "@/app/components/ActionModal";
import Button from "@/app/components/Button";
import FormError from "@/app/components/FormError";
import ConfirmDialog from "@/app/components/ConfirmDialog";
import { useApiError } from "@/app/hooks/useApiError";
import LockPeriodEndForm from "@/app/admin/LockPeriodEndForm";
import { formatDateTime, toDateLocale, APP_TZ } from "@/lib/utils";
import { fetchWithTimeout, parseApiErrorCode } from "@/lib/apiClient";
import { LockClosedIcon } from "@/app/components/lockIcons";

type EndMode = "withdraw" | "replace";
/** Titel/Knopf und Rückfrage je Weg — die beiden Wege unterscheiden sich nur darin. */
const END_TEXTS: Record<EndMode, { label: string; confirm: string }> = {
  withdraw: { label: "withdrawLock", confirm: "withdrawLockPeriodConfirm" },
  replace: { label: "replaceLockDuration", confirm: "replaceLockPeriodConfirm" },
};

interface Props {
  userId: string;
  lockPeriodId: string;
  endsAt: Date | null;
  message: string | null;
  /** Governing timezone of the data owner (sub). Defaults to APP_TZ (Europe/Zurich). */
  tz?: string;
  /** Server-„jetzt" als Wanduhr in der Sub-Zeitzone — `min` der Datetime-Eingabe. */
  minNow: string;
}

/** Edit / withdraw view for an active Sperrzeit. Three paths:
 *  - Ende ändern (in place): {@link LockPeriodEndForm} → PATCH setEnd, bleibt gesperrt
 *  - "Zurückziehen": PATCH withdraw, back to /aktionen
 *  - "Ersetzen": PATCH withdraw, then redirect to verschluss-anforderung form
 *    (which only renders SPERRZEIT mode when no active sperrzeit exists — so the
 *    withdraw must complete first).
 *  Beide beenden die Sperrzeit sofort und laufen deshalb über eine Rückfrage, wie das Aufheben
 *  in der Übersicht. Beim Ersetzen sagt sie, dass ein Abbruch im neuen Formular keine Sperrzeit
 *  hinterlässt — der Rückzug ist zu diesem Zeitpunkt schon geschehen. */
export default function LockDurationEditForm({ userId, lockPeriodId, endsAt, message, tz = APP_TZ, minNow }: Props) {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const router = useRouter();
  const dl = toDateLocale(useLocale());
  const [saving, setSaving] = useState<EndMode | null>(null);
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState<EndMode | null>(null);
  const apiError = useApiError();

  async function withdraw(mode: EndMode) {
    const replace = mode === "replace";
    setConfirming(null);
    setSaving(mode);
    setError("");
    try {
      const res = await fetchWithTimeout(`/api/admin/verschluss-anforderung/${lockPeriodId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "withdraw" }),
      });
      // Eine Absage des Servers ist kein Netzwerkfehler — sie hat einen Grund, und der gehört hin.
      if (!res.ok) {
        setError(apiError(await parseApiErrorCode(res)));
        setSaving(null);
        return;
      }
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
      <div className="flex flex-col">
        <div className="px-5 pt-5 text-sm text-foreground-muted flex flex-col gap-1">
          <p>{endsLabel}</p>
          {message && <p className="italic text-foreground-faint">„{message}"</p>}
        </div>
        {/* Primär: das Ende in der bestehenden Sperrzeit ändern, ohne sie aufzuheben. */}
        <LockPeriodEndForm
          lockPeriodId={lockPeriodId}
          endsAt={endsAt}
          tz={tz}
          minNow={minNow}
          onSuccess={() => { router.refresh(); close(); }}
        />
        {/* Daneben, deutlich abgesetzt: die beiden Wege, die die Sperrzeit BEENDEN. */}
        <div className="flex flex-col gap-2 border-t border-border-subtle px-5 py-4">
          <FormError message={error} />
          <Button
            onClick={() => setConfirming("replace")}
            disabled={saving !== null}
            loading={saving === "replace"}
            variant="secondary"
            fullWidth
          >
            {t("replaceLockDuration")}
          </Button>
          <Button
            onClick={() => setConfirming("withdraw")}
            disabled={saving !== null}
            loading={saving === "withdraw"}
            variant="secondary"
            fullWidth
          >
            {t("withdrawLock")}
          </Button>
        </div>
      </div>
      {confirming && (
        <ConfirmDialog
          open
          title={t(END_TEXTS[confirming].label)}
          // Derselbe Zusatz wie an der Rückfrage der Übersicht (`WithdrawButton`): die Sperrzeit läuft,
          // der Sub kennt sie also und bekommt eine Mitteilung.
          message={`${t(END_TEXTS[confirming].confirm)} ${t("withdrawNotifiesSub")}`}
          confirmLabel={t(END_TEXTS[confirming].label)}
          onConfirm={() => withdraw(confirming)}
          onCancel={() => setConfirming(null)}
        />
      )}
    </ActionModal>
  );
}
