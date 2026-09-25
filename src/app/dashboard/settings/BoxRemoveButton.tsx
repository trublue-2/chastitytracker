"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import Button from "@/app/components/Button";
import ConfirmDialog from "@/app/components/ConfirmDialog";
import FormError from "@/app/components/FormError";
import { useActionPatch } from "@/app/hooks/useActionPatch";
import { useApiError } from "@/app/hooks/useApiError";
import { parseApiErrorCode } from "@/lib/apiClient";

/**
 * „Box entfernen" — der Weg zum Box-Wechsel, denn ein Träger führt genau eine Box (`boxPairing.ts`).
 * Dasselbe Muster wie `DeleteTaskButton`: Rückfrage im eigenen Dialog, der während des Löschens
 * offen bleibt; die Absage des Servers („nur wenn offen und nichts wartet") steht aufgelöst darunter.
 */
export default function BoxRemoveButton({ boxId }: { boxId: string }) {
  const t = useTranslations("boxStatus");
  const tc = useTranslations("common");
  const apiError = useApiError();
  const { saving, run } = useActionPatch();
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState("");

  async function handle() {
    setError("");
    const res = await run(`/api/box/${encodeURIComponent(boxId)}`, undefined, "DELETE");
    if (!res) setError(tc("networkError"));
    else if (!res.ok) setError(apiError(await parseApiErrorCode(res)));
    setAsking(false);
  }

  return (
    <>
      <Button variant="secondary" size="sm" disabled={saving} onClick={() => setAsking(true)} icon={<Trash2 size={16} />}>
        {t("remove")}
      </Button>
      <ConfirmDialog
        open={asking}
        title={t("remove")}
        message={t("removeConfirm")}
        icon={<Trash2 size={20} style={{ color: "var(--color-warn)" }} />}
        confirmLabel={t("remove")}
        danger
        loading={saving}
        onConfirm={handle}
        onCancel={() => setAsking(false)}
      />
      <FormError message={error} />
    </>
  );
}
