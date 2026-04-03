"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import Button from "@/app/components/Button";

export default function DeleteUserButton({ id, username, isSelf }: { id: string; username: string; isSelf?: boolean }) {
  const t = useTranslations("admin");
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  async function handleDelete() {
    if (!confirm(t("deleteConfirm", { name: username }))) return;
    setSaving(true);
    await fetch(`/api/admin/users/${id}`, { method: "DELETE" });
    router.refresh();
    setSaving(false);
  }

  if (isSelf) {
    return (
      <Button variant="danger" size="sm" disabled title={t("cannotDeleteSelf")}>
        {t("deleteUser")}
      </Button>
    );
  }

  return (
    <Button variant="danger" size="sm" loading={saving} onClick={handleDelete}>
      {t("deleteUser")}
    </Button>
  );
}
