"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import Button from "@/app/components/Button";
import ConfirmDialog from "@/app/components/ConfirmDialog";
import FormError from "@/app/components/FormError";
import { useApiError } from "@/app/hooks/useApiError";
import { parseApiErrorCode } from "@/lib/client/apiClient";

export default function DeleteUserButton({ id, username, isSelf }: { id: string; username: string; isSelf?: boolean }) {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const apiError = useApiError();
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);

  async function handleDelete() {
    setConfirmOpen(false);
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/users/${id}`, { method: "DELETE" });
      // Die Absage aufgelöst zeigen — „Box könnte zu sein" ist keine Netzwerkstörung.
      if (!res.ok) { setError(apiError(await parseApiErrorCode(res))); return; }
      router.refresh();
    } catch {
      setError(tc("networkError"));
    } finally {
      setSaving(false);
    }
  }

  if (isSelf) {
    return (
      <Button variant="danger" size="sm" disabled title={t("cannotDeleteSelf")}>
        {t("deleteUser")}
      </Button>
    );
  }

  return (
    <>
      <Button variant="danger" size="sm" loading={saving} onClick={() => setConfirmOpen(true)}>
        {t("deleteUser")}
      </Button>
      {/* Vor dem Abruf schliessen, ohne `loading`: die Fehlerzeile steht direkt unter dem Knopf. */}
      <ConfirmDialog
        open={confirmOpen}
        danger
        title={t("deleteUser")}
        message={t("deleteConfirm", { name: username })}
        confirmLabel={t("deleteUser")}
        onConfirm={handleDelete}
        onCancel={() => setConfirmOpen(false)}
      />
      <FormError message={error} />
    </>
  );
}
