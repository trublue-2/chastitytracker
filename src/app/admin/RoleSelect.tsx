"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";

export default function RoleSelect({ id, currentRole }: { id: string; currentRole: string }) {
  const t = useTranslations("admin");
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    setSaving(true);
    await fetch(`/api/admin/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: e.target.value }),
    });
    router.refresh();
    setSaving(false);
  }

  return (
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
  );
}
