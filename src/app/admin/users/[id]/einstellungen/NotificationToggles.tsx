"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Bell, Mail } from "lucide-react";
import Toggle from "@/app/components/Toggle";
import Card from "@/app/components/Card";
import Spinner from "@/app/components/Spinner";
import { NOTIFICATION_EVENT_TYPES, type NotificationEventType } from "@/lib/constants";

type Channel = "mail" | "push";
type PrefsMap = Record<NotificationEventType, { mail: boolean; push: boolean }>;

const EMPTY_PREFS: PrefsMap = Object.fromEntries(
  NOTIFICATION_EVENT_TYPES.map((et) => [et, { mail: false, push: false }])
) as PrefsMap;

const I18N_KEY: Record<NotificationEventType, string> = {
  VERSCHLUSS: "notifyVerschluss",
  OEFFNUNG_IMMER: "notifyOeffnungImmer",
  OEFFNUNG_VERBOTEN: "notifyOeffnungVerboten",
  ORGASMUS: "notifyOrgasmus",
  KONTROLLE_FREIWILLIG: "notifyKontrolleFreiwillig",
  KONTROLLE_ANGEFORDERT: "notifyKontrolleAngefordert",
  WEAR_BEGIN_ANY: "notifyWearBeginAny",
  WEAR_END_ANY: "notifyWearEndAny",
};

/** Visual grouping in the matrix — one section per concept. */
const GROUPS: { titleKey: string; events: readonly NotificationEventType[] }[] = [
  { titleKey: "notifyGroupKg", events: ["VERSCHLUSS", "OEFFNUNG_IMMER", "OEFFNUNG_VERBOTEN", "KONTROLLE_FREIWILLIG", "KONTROLLE_ANGEFORDERT"] },
  { titleKey: "notifyGroupOrgasmus", events: ["ORGASMUS"] },
  { titleKey: "notifyGroupWear", events: ["WEAR_BEGIN_ANY", "WEAR_END_ANY"] },
];

export default function NotificationToggles({ userId }: { userId: string }) {
  const t = useTranslations("admin");
  const [prefs, setPrefs] = useState<PrefsMap>(EMPTY_PREFS);
  const [fetching, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/admin/notifications?userId=${userId}`)
      .then((r) => r.json())
      .then((data) => { setPrefs({ ...EMPTY_PREFS, ...data }); setLoading(false); })
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

  return (
    <Card padding="none" className="overflow-hidden">
      {/* Column header */}
      <div className="px-5 py-3 border-b border-border-subtle flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-foreground-faint">{t("notifyTitle")}</p>
          <p className="text-xs text-foreground-muted mt-1">{t("notifyDesc")}</p>
        </div>
        <div className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-foreground-faint shrink-0">
          <span className="flex items-center gap-1 w-16 justify-center whitespace-nowrap" title={t("notifyPushTitle")}>
            <Bell size={12} aria-hidden /> {t("notifyChannelPush")}
          </span>
          <span className="flex items-center gap-1 w-16 justify-center whitespace-nowrap" title={t("notifyMailTitle")}>
            <Mail size={12} aria-hidden /> {t("notifyChannelMail")}
          </span>
        </div>
      </div>

      {/* Groups */}
      <div className="divide-y divide-border-subtle">
        {GROUPS.map((g) => (
          <div key={g.titleKey}>
            <p className="px-5 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-foreground-faint bg-background-subtle/40">
              {t(g.titleKey)}
            </p>
            <div className="divide-y divide-border-subtle">
              {g.events.map((et) => (
                <div key={et} className="px-5 py-3 flex items-center justify-between gap-3">
                  <span className="text-sm text-foreground truncate">{t(I18N_KEY[et])}</span>
                  <div className="flex items-center gap-1 shrink-0">
                    <div className="w-16 flex justify-center">
                      <Toggle
                        label=""
                        checked={prefs[et].push}
                        disabled={savingKey === `${et}.push`}
                        onChange={(checked) => handleToggle(et, "push", checked)}
                      />
                    </div>
                    <div className="w-16 flex justify-center">
                      <Toggle
                        label=""
                        checked={prefs[et].mail}
                        disabled={savingKey === `${et}.mail`}
                        onChange={(checked) => handleToggle(et, "mail", checked)}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="px-5 py-3 border-t border-border-subtle">
        <p className="text-[11px] text-foreground-faint">{t("notifyPushDesc")}</p>
      </div>
    </Card>
  );
}
