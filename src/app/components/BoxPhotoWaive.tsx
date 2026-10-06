"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import Button from "@/app/components/Button";
import FormError from "@/app/components/FormError";
import { useActionPatch } from "@/app/hooks/useActionPatch";
import { useApiError } from "@/app/hooks/useApiError";
import { parseApiErrorCode } from "@/lib/apiClient";

/**
 * Die Keyholderin erlässt das fällige Box-Foto — der Notausgang, wenn es nicht zu beschaffen ist
 * (`boxPhotoDue.ts`). `info` nennt, seit wann es aussteht; der Verschluss bleibt in jedem Fall gültig.
 */
export default function BoxPhotoWaive({ userId, info }: { userId: string; info: string }) {
  const t = useTranslations("admin");
  const apiError = useApiError();
  const { saving, run } = useActionPatch();
  const [error, setError] = useState<string | null>(null);

  async function waive() {
    setError(null);
    const res = await run("/api/admin/box-photo", { userId }, "POST");
    if (!res?.ok) setError(apiError(res ? await parseApiErrorCode(res) : null));
  }

  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-neben text-foreground-muted">{info}</p>
      <p className="text-neben text-foreground-faint">{t("boxPhotoWaiveHint")}</p>
      <FormError message={error} />
      <Button type="button" variant="secondary" size="sm" className="self-start" onClick={waive} loading={saving}>
        {t("boxPhotoWaive")}
      </Button>
    </div>
  );
}
