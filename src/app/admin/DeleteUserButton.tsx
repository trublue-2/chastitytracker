"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

export default function DeleteUserButton({ id, username, isSelf }: { id: string; username: string; isSelf?: boolean }) {
  const t = useTranslations("admin");
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    if (!confirm(t("deleteConfirm", { name: username }))) return;
    setLoading(true);
    await fetch(`/api/admin/users/${id}`, { method: "DELETE" });
    router.refresh();
    setLoading(false);
  }

  if (isSelf) {
    return (
      <button
        disabled
        title={t("cannotDeleteSelf")}
        className="text-xs font-medium text-white bg-red-300 rounded-lg px-2.5 py-1 cursor-not-allowed opacity-50"
      >
        {t("deleteUser")}
      </button>
    );
  }

  return (
    <button
      onClick={handleDelete}
      disabled={loading}
      className="text-xs font-medium text-white bg-red-500 hover:bg-red-600 rounded-lg px-2.5 py-1 transition disabled:opacity-50"
    >
      {loading ? "…" : t("deleteUser")}
    </button>
  );
}
