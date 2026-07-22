"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useUserSettingsSave } from "@/app/hooks/useUserSettingsSave";

export default function RoleSelect({
  id,
  currentRole,
  isSelf,
}: {
  id: string;
  currentRole: string;
  isSelf: boolean;
}) {
  const t = useTranslations("admin");
  const { saving, save } = useUserSettingsSave(id);
  // Optimistisch, damit die Pille sofort umfärbt; ein abgelehnter Patch setzt zurück.
  const [role, setRole] = useState(currentRole);

  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value;
    // Wer sich selbst degradiert, verliert den Adminbereich sofort — das darf kein Versehen sein.
    if (isSelf && next === "user" && !confirm(t("roleSelfDemoteConfirm"))) return;

    // Auf den zuletzt ANGEZEIGTEN Wert zurücksetzen, nicht auf `currentRole`: das Prop wird erst
    // durch das (nicht abgewartete) router.refresh() im Hook nachgezogen und kann kurz veraltet sein.
    const previous = role;
    setRole(next);
    if (!(await save({ role: next }))) setRole(previous);
  }

  return (
    <select
      value={role}
      onChange={handleChange}
      disabled={saving}
      className={`text-xs font-semibold px-2 py-0.5 rounded-full border-0 focus:outline-none focus:ring-2 focus:ring-foreground-muted cursor-pointer transition ${
        role === "admin"
          ? "bg-[var(--color-request-bg)] text-[var(--color-request-text)]"
          : "bg-surface-raised text-foreground-faint"
      } disabled:opacity-50`}
    >
      <option value="user">{t("roleUser")}</option>
      <option value="admin">{t("roleAdmin")}</option>
    </select>
  );
}
