"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";

export default function WithdrawVerschlussButton({ id }: { id: string }) {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handle() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/verschluss-anforderung/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "withdraw" }),
      });
      if (!res.ok) throw new Error(tc("savingError"));
      router.refresh();
    } catch {
      setError(tc("networkError"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button
        onClick={handle}
        disabled={saving}
        title={t("withdrawLockTitle")}
        className="p-0 flex items-center text-[var(--color-sperrzeit)] hover:opacity-80 disabled:opacity-50 transition"
      >
        <X size={13} />
      </button>
      {error && (
        <p className="text-sm text-warn bg-warn-bg border border-[var(--color-warn-border)] rounded-xl px-4 py-3">
          {error}
        </p>
      )}
    </>
  );
}
