"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

export default function DeleteVorgabeButton({ id }: { id: string }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const t = useTranslations("admin");

  async function handle() {
    if (!confirm(t("vorgabeDeleteConfirm"))) return;
    setSaving(true);
    await fetch(`/api/admin/vorgaben/${id}`, { method: "DELETE" });
    router.refresh();
    setSaving(false);
  }

  return (
    <button onClick={handle} disabled={saving}
      className="text-xs font-medium text-warn-text bg-warn-bg border border-warn-border hover:opacity-80 rounded-lg px-2 py-1 transition disabled:opacity-50">
      {saving ? "…" : t("vorgabeDelete")}
    </button>
  );
}
