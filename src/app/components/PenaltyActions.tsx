"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import Button from "@/app/components/Button";
import FormError from "@/app/components/FormError";
import { parseApiErrorCode } from "@/lib/apiClient";
import { useApiError } from "@/app/hooks/useApiError";
import { useActionPatch } from "@/app/hooks/useActionPatch";

/** Ein Knopf, der die Strafe per PATCH weiterschaltet — die gemeinsame Hülle der beiden
 *  Strafen-Aktionen an der Karte. Der Fehler steht direkt darunter, statt still zu verschwinden. */
function PenaltyActionButton({ label, url, body }: { label: string; url: string; body: unknown }) {
  const { saving, run } = useActionPatch();
  const apiError = useApiError();
  const [error, setError] = useState<string | null>(null);

  async function act() {
    setError(null);
    const res = await run(url, body);
    if (!res) setError(apiError(null));
    else if (!res.ok) setError(apiError(await parseApiErrorCode(res)));
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <Button variant="secondary" size="sm" loading={saving} onClick={() => void act()}>{label}</Button>
      <FormError message={error} variant="compact" />
    </div>
  );
}

/** Der Träger meldet die Strafe als erledigt (`/api/penalty-done`). Abschliessen kann sie weiterhin
 *  nur die Keyholderin — die Meldung sagt ihr Bescheid. */
export function PenaltyReportButton({ refId }: { refId: string }) {
  const t = useTranslations("penalties");
  return <PenaltyActionButton label={t("reportDoneButton")} url="/api/penalty-done" body={{ refId }} />;
}

/** Die Keyholderin schliesst die Strafe ab — dieselbe Route wie „Als erledigt markieren" im
 *  Strafbuch, hier direkt an der Karte ihrer Sub-Übersicht. */
export function PenaltyDoneButton({ refId }: { refId: string }) {
  const t = useTranslations("penalties");
  return <PenaltyActionButton label={t("markDoneButton")} url="/api/admin/strafe" body={{ refId, done: true }} />;
}
