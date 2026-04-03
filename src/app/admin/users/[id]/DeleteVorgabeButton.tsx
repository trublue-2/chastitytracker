"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

export default function DeleteVorgabeButton({ id }: { id: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const t = useTranslations("admin");

  async function handle() {
    if (!confirm(t("vorgabeDeleteConfirm"))) return;
    setLoading(true);
    await fetch(`/api/admin/vorgaben/${id}`, { method: "DELETE" });
    router.refresh();
    setLoading(false);
  }

  return (
    <button onClick={handle} disabled={loading}
      className="text-xs font-medium text-warn-text bg-warn-bg border border-warn-border hover:opacity-80 rounded-lg px-2 py-1 transition disabled:opacity-50">
      {loading ? "…" : t("vorgabeDelete")}
    </button>
  );
}
