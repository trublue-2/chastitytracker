"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";

export default function RoleSelect({ id, currentRole }: { id: string; currentRole: string }) {
  const t = useTranslations("admin");
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    setLoading(true);
    await fetch(`/api/admin/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: e.target.value }),
    });
    router.refresh();
    setLoading(false);
  }

  return (
    <select
      defaultValue={currentRole}
      onChange={handleChange}
      disabled={loading}
      className={`text-xs font-semibold px-2 py-0.5 rounded-full border-0 focus:outline-none focus:ring-2 focus:ring-indigo-400 cursor-pointer transition ${
        currentRole === "admin"
          ? "bg-indigo-100 text-indigo-700"
          : "bg-gray-100 text-gray-500"
      } disabled:opacity-50`}
    >
      <option value="user">{t("roleUser")}</option>
      <option value="admin">{t("roleAdmin")}</option>
    </select>
  );
}
