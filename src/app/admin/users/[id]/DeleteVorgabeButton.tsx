"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

export default function DeleteVorgabeButton({ id }: { id: string }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const t = useTranslations("admin");
  const tc = useTranslations("common");

  async function handle() {
    if (!confirm(t("vorgabeDeleteConfirm"))) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/vorgaben/${id}`, { method: "DELETE" });
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
      <button onClick={handle} disabled={saving}
        className="text-xs font-medium text-warn-text bg-warn-bg border border-warn-border hover:opacity-80 rounded-lg px-2 py-1 transition disabled:opacity-50">
        {saving ? "…" : t("vorgabeDelete")}
      </button>
      {error && (
        <p className="text-sm text-warn bg-warn-bg border border-[var(--color-warn-border)] rounded-xl px-4 py-3">
          {error}
        </p>
      )}
    </>
  );
}
