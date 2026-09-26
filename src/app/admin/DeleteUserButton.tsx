"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import Button from "@/app/components/Button";
import FormError from "@/app/components/FormError";
import { useApiError } from "@/app/hooks/useApiError";
import { parseApiErrorCode } from "@/lib/apiClient";

export default function DeleteUserButton({ id, username, isSelf }: { id: string; username: string; isSelf?: boolean }) {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const apiError = useApiError();
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleDelete() {
    if (!confirm(t("deleteConfirm", { name: username }))) return;
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
      <Button variant="danger" size="sm" loading={saving} onClick={handleDelete}>
        {t("deleteUser")}
      </Button>
      <FormError message={error} />
    </>
  );
}
