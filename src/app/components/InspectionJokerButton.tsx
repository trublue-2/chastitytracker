"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Hourglass } from "lucide-react";

import ActionModal from "@/app/components/ActionModal";
import Button from "@/app/components/Button";
import Input from "@/app/components/Input";
import FormError from "@/app/components/FormError";
import { cardActionCls, quietLinkCls } from "@/app/components/inputStyles";
import { parseApiErrorCode } from "@/lib/apiClient";
import { useApiError } from "@/app/hooks/useApiError";
import { useActionPatch } from "@/app/hooks/useActionPatch";
import { INSPECTION_JOKER_REASON_MAX_LENGTH } from "@/lib/constants";
import { formatDayTimeDual, toDateLocale } from "@/lib/utils";
// Nur der Typ: das Modul selbst zieht Prisma nach sich.
import type { InspectionJokerOffer } from "@/lib/inspectionJoker";

interface Props {
  inspectionId: string;
  offer: InspectionJokerOffer;
  /** Zeitzone des Trägers. */
  tz: string;
  /** Neben dem Erfassen-Knopf als Knopf, in der kompakten Zeile als Link-Zeile. */
  variant: "button" | "link";
}

/**
 * Der Fristen-Joker des Trägers: verschiebt eine laufende Kontrollfrist, bevor sie abläuft.
 *
 * Bewusst die SCHWÄCHERE Handlung neben „Jetzt erfassen": der Normalweg ist die Kontrolle, nicht ihr
 * Aufschub. Der Einsatz kostet einen Joker und wird der Keyholderin gemeldet, deshalb erst nach
 * einer Rückfrage mit der neuen Frist.
 */
export default function InspectionJokerButton({ inspectionId, offer, tz, variant }: Props) {
  const t = useTranslations("kontrolleBanner");
  const [open, setOpen] = useState(false);
  const label = t("jokerUse", { minutes: offer.minutes, balance: offer.balance });

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        className={`${variant === "button" ? cardActionCls("inspect") : quietLinkCls} self-start`}
      >
        {variant === "button" && <Hourglass size={16} aria-hidden />}
        {label}
      </button>
      <ActionModal
        open={open}
        onClose={() => setOpen(false)}
        title={t("jokerTitle")}
        icon={<Hourglass size={20} strokeWidth={2} style={{ color: "var(--color-inspect)" }} />}
        iconBg="var(--color-inspect-bg)"
      >
        {/* Erst beim Öffnen mounten: der Grund beginnt jedes Mal leer. */}
        {open && <JokerForm inspectionId={inspectionId} offer={offer} tz={tz} onDone={() => setOpen(false)} />}
      </ActionModal>
    </>
  );
}

function JokerForm({ inspectionId, offer, tz, onDone }: Omit<Props, "variant"> & { onDone: () => void }) {
  const t = useTranslations("kontrolleBanner");
  const dl = toDateLocale(useLocale());
  const apiError = useApiError();
  const { saving, run } = useActionPatch();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submitJoker() {
    setError(null);
    const res = await run(`/api/kontrollen/${inspectionId}/joker`, { reason }, "POST");
    if (res?.ok) onDone();
    else setError(apiError(res ? await parseApiErrorCode(res) : null));
  }

  return (
    <div className="flex flex-col gap-4 p-5">
      <p className="text-fliess">
        {t("jokerConfirm", { date: formatDayTimeDual(new Date(offer.newDeadline), dl, undefined, tz, t("subTimePrefix")) })}
      </p>
      <p className="text-neben text-foreground-muted">{t("jokerConfirmHint", { remaining: offer.balance - 1 })}</p>
      <Input
        label={t("jokerReasonLabel")}
        hint={t("jokerReasonHint")}
        value={reason}
        maxLength={INSPECTION_JOKER_REASON_MAX_LENGTH}
        onChange={(e) => setReason(e.target.value)}
      />
      <FormError message={error} />
      <Button onClick={submitJoker} loading={saving} variant="primary" fullWidth>
        {t("jokerSubmit")}
      </Button>
    </div>
  );
}
