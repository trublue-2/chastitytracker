"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import Toggle from "@/app/components/Toggle";

interface NotifyFlags {
  notifyVerschluss: boolean;
  notifyOeffnungImmer: boolean;
  notifyOeffnungVerboten: boolean;
  notifyOrgasmus: boolean;
  notifyKontrolleFreiwillig: boolean;
  notifyKontrolleAngefordert: boolean;
}

const FLAG_KEYS: (keyof NotifyFlags)[] = [
  "notifyVerschluss",
  "notifyOeffnungImmer",
  "notifyOeffnungVerboten",
  "notifyOrgasmus",
  "notifyKontrolleFreiwillig",
  "notifyKontrolleAngefordert",
];

export default function NotificationToggles({
  userId,
  initial,
}: {
  userId: string;
  initial: NotifyFlags;
}) {
  const t = useTranslations("admin");
  const [flags, setFlags] = useState<NotifyFlags>(initial);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  async function handleToggle(key: keyof NotifyFlags, checked: boolean) {
    setFlags((prev) => ({ ...prev, [key]: checked }));
    setSavingKey(key);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: checked }),
      });
      if (!res.ok) setFlags((prev) => ({ ...prev, [key]: !checked }));
    } catch {
      setFlags((prev) => ({ ...prev, [key]: !checked }));
    }
    setSavingKey(null);
  }

  return (
    <div className="divide-y divide-border-subtle">
      {FLAG_KEYS.map((key) => (
        <div key={key} className="px-5 py-3">
          <Toggle
            label={t(key)}
            checked={flags[key]}
            disabled={savingKey === key}
            onChange={(e) => handleToggle(key, e.target.checked)}
          />
        </div>
      ))}
    </div>
  );
}
