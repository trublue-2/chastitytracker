"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";

export default function WithdrawVerschlussButton({ id }: { id: string }) {
  const t = useTranslations("admin");
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handle() {
    setLoading(true);
    await fetch(`/api/admin/verschluss-anforderung/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "withdraw" }),
    });
    router.refresh();
    setLoading(false);
  }

  return (
    <button
      onClick={handle}
      disabled={loading}
      title={t("withdrawLockTitle")}
      className="p-0 flex items-center text-[var(--color-sperrzeit)] hover:opacity-80 disabled:opacity-50 transition"
    >
      <X size={13} />
    </button>
  );
}
