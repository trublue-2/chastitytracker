"use client";

import { useState } from "react";

export default function MobileUploadToggle({
  userId,
  initialValue,
}: {
  userId: string;
  initialValue: boolean;
}) {
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
    <button
      type="button"
      role="switch"
      aria-checked={value}
      disabled={saving}
      onClick={() => handleToggle(!value)}
      className={`relative flex-shrink-0 w-11 h-6 rounded-full transition-colors duration-200 disabled:opacity-50 ${value ? "bg-foreground" : "bg-border"}`}
    >
      <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-background rounded-full shadow transition-transform duration-200 ${value ? "translate-x-5" : "translate-x-0"}`} />
    </button>
  );
}
