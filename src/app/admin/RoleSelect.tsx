"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";

export default function RoleSelect({ id, currentRole }: { id: string; currentRole: string }) {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: e.target.value }),
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
      <select
        defaultValue={currentRole}
        onChange={handleChange}
        disabled={saving}
        className={`text-xs font-semibold px-2 py-0.5 rounded-full border-0 focus:outline-none focus:ring-2 focus:ring-foreground-muted cursor-pointer transition ${
          currentRole === "admin"
            ? "bg-[var(--color-request-bg)] text-[var(--color-request-text)]"
            : "bg-surface-raised text-foreground-faint"
        } disabled:opacity-50`}
      >
        <option value="user">{t("roleUser")}</option>
        <option value="admin">{t("roleAdmin")}</option>
      </select>
      {error && (
        <p className="text-sm text-warn bg-warn-bg border border-[var(--color-warn-border)] rounded-xl px-4 py-3">
          {error}
        </p>
      )}
    </>
  );
}
