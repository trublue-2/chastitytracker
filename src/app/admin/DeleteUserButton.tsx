"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import Button from "@/app/components/Button";

export default function DeleteUserButton({ id, username, isSelf }: { id: string; username: string; isSelf?: boolean }) {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleDelete() {
    if (!confirm(t("deleteConfirm", { name: username }))) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/users/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(tc("savingError"));
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
      {error && (
        <p className="text-sm text-warn bg-warn-bg border border-[var(--color-warn-border)] rounded-xl px-4 py-3">
          {error}
        </p>
      )}
    </>
  );
}
