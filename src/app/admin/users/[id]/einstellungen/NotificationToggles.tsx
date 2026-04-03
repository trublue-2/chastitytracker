"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import Toggle from "@/app/components/Toggle";
import Card from "@/app/components/Card";
import Spinner from "@/app/components/Spinner";
import { NOTIFICATION_EVENT_TYPES, type NotificationEventType } from "@/lib/constants";
type Channel = "mail" | "push";
type PrefsMap = Record<NotificationEventType, { mail: boolean; push: boolean }>;

const EMPTY_PREFS: PrefsMap = Object.fromEntries(
  NOTIFICATION_EVENT_TYPES.map((et) => [et, { mail: false, push: false }])
) as PrefsMap;

export default function NotificationToggles({ userId }: { userId: string }) {
  const t = useTranslations("admin");
  const [prefs, setPrefs] = useState<PrefsMap>(EMPTY_PREFS);
  const [fetching, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/admin/notifications?userId=${userId}`)
      .then((r) => r.json())
      .then((data) => { setPrefs(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [userId]);

  async function handleToggle(eventType: NotificationEventType, channel: Channel, value: boolean) {
    const prev = prefs[eventType][channel];
    setPrefs((p) => ({ ...p, [eventType]: { ...p[eventType], [channel]: value } }));
    setSavingKey(`${eventType}.${channel}`);
    try {
      const res = await fetch("/api/admin/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, eventType, channel, value }),
      });
      if (!res.ok) setPrefs((p) => ({ ...p, [eventType]: { ...p[eventType], [channel]: prev } }));
    } catch {
      setPrefs((p) => ({ ...p, [eventType]: { ...p[eventType], [channel]: prev } }));
    }
    setSavingKey(null);
  }

  if (fetching) {
    return (
      <div className="flex items-center justify-center py-8">
        <Spinner />
      </div>
    );
  }

  const i18nKey: Record<NotificationEventType, string> = {
    VERSCHLUSS: "notifyVerschluss",
    OEFFNUNG_IMMER: "notifyOeffnungImmer",
    OEFFNUNG_VERBOTEN: "notifyOeffnungVerboten",
    ORGASMUS: "notifyOrgasmus",
    KONTROLLE_FREIWILLIG: "notifyKontrolleFreiwillig",
    KONTROLLE_ANGEFORDERT: "notifyKontrolleAngefordert",
  };

  function renderChannel(channel: Channel, titleKey: string, descKey: string) {
    return (
      <Card padding="none" className="overflow-hidden">
        <div className="px-5 py-3 border-b border-border-subtle">
          <p className="text-xs font-semibold uppercase tracking-wider text-foreground-faint">{t(titleKey)}</p>
          <p className="text-[11px] text-foreground-faint mt-0.5">{t(descKey)}</p>
        </div>
        <div className="divide-y divide-border-subtle">
          {NOTIFICATION_EVENT_TYPES.map((et) => (
            <div key={et} className="px-5 py-3">
              <Toggle
                label={t(i18nKey[et])}
                checked={prefs[et][channel]}
                disabled={savingKey === `${et}.${channel}`}
                onChange={(checked) => handleToggle(et, channel, checked)}
              />
            </div>
          ))}
        </div>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {renderChannel("mail", "notifyMailTitle", "notifyMailDesc")}
      {renderChannel("push", "notifyPushTitle", "notifyPushDesc")}
    </div>
  );
}
