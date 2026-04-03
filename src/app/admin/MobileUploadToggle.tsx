"use client";

import { useState } from "react";
import Toggle from "@/app/components/Toggle";
import { useTranslations } from "next-intl";

export default function MobileUploadToggle({
  userId,
  initialValue,
}: {
  userId: string;
  initialValue: boolean;
}) {
  const t = useTranslations("admin");
  const [value, setValue] = useState(initialValue);
  const [saving, setSaving] = useState(false);

  async function handleToggle(checked: boolean) {
    setValue(checked);
    setSaving(true);
    await fetch(`/api/admin/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mobileDesktopUpload: checked }),
    });
    setSaving(false);
  }

  return (
    <Toggle
      label={t("mobileUploadAdminTitle")}
      description={t("mobileUploadAdminDesc")}
      checked={value}
      disabled={saving}
      onChange={handleToggle}
    />
  );
}
