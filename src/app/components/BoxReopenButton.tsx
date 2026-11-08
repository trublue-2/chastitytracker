"use client";

import { useState } from "react";
import { LockOpen } from "lucide-react";
import { useTranslations } from "next-intl";
import Button from "@/app/components/Button";
import FormError from "@/app/components/FormError";
import { useActionPatch } from "@/app/hooks/useActionPatch";
import { useApiError } from "@/app/hooks/useApiError";
import { parseApiErrorCode } from "@/lib/client/apiClient";

/**
 * „Box nochmals öffnen" — der Reparaturweg für den Zustand, in dem der Tracker auf OFFEN steht, die
 * Box den Riegel aber zu meldet (`boxReopenService.ts`). Setzt nur den Befehl; ausgeführt wird er wie
 * jeder andere: sobald sich das Handy des Trägers an der LockMeBox verbindet. Nur in der Sicht des
 * Trägers, und nur für die LockMeBox (`boxNeedsReopen`).
 */
export default function BoxReopenButton() {
  const t = useTranslations("boxStatus");
  const tc = useTranslations("common");
  const apiError = useApiError();
  const { saving, run } = useActionPatch();
  const [error, setError] = useState("");

  async function handle() {
    setError("");
    const res = await run("/api/box/reopen", undefined, "POST");
    if (!res) setError(tc("networkError"));
    else if (!res.ok) setError(apiError(await parseApiErrorCode(res)));
  }

  return (
    <div className="flex flex-col gap-2 pt-2">
      <Button variant="secondary" size="sm" onClick={handle} loading={saving} icon={<LockOpen size={16} />}>
        {t("reopen")}
      </Button>
      <FormError message={error} />
    </div>
  );
}
