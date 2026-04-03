"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";

export default function WithdrawKontrolleButton({ id }: { id: string }) {
  const t = useTranslations("admin");
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  async function handle() {
    setSaving(true);
    await fetch(`/api/admin/kontrollen/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "withdraw" }),
    });
    router.refresh();
    setSaving(false);
  }

  return (
    <button
      onClick={handle}
      disabled={saving}
      title={t("withdrawKontrolleTitle")}
      className="p-0 flex items-center text-[var(--color-inspect)] hover:opacity-80 disabled:opacity-50 transition"
    >
      <X size={13} />
    </button>
  );
}
