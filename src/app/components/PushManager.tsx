"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import Toggle from "@/app/components/Toggle";

function urlBase64ToUint8Array(base64: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr.buffer;
}

export default function PushManager() {
  const t = useTranslations("settings");
  const [supported, setSupported] = useState(false);
  const [denied, setDenied] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    setSupported(true);
    if (Notification.permission === "denied") {
      setDenied(true);
      return;
    }
    navigator.serviceWorker.ready.then((reg) =>
      reg.pushManager.getSubscription()
    ).then((sub) => setSubscribed(!!sub));
  }, []);

  async function toggle(enable: boolean) {
    if (!supported || denied) return;
    setSaving(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      if (enable) {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          setDenied(permission === "denied");
          return;
        }
        const { key } = await fetch("/api/push/vapid-public-key").then((r) => r.json());
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(key),
        });
        await fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(sub.toJSON()),
        });
        setSubscribed(true);
      } else {
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await fetch("/api/push/subscribe", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ endpoint: sub.endpoint }),
          });
          await sub.unsubscribe();
        }
        setSubscribed(false);
      }
    } catch (err) {
      console.error("[PushManager]", err);
      // Re-sync state with actual subscription status
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        setSubscribed(!!sub);
      } catch { /* ignore */ }
    } finally {
      setSaving(false);
    }
  }

  if (!supported) {
    return (
      <p className="text-xs text-foreground-faint px-5 py-4">{t("pushNotSupported")}</p>
    );
  }

  if (denied) {
    return (
      <p className="text-xs text-warn px-5 py-4">{t("pushDenied")}</p>
    );
  }

  return (
    <div className="px-5 py-4">
      <Toggle
        label={t("pushTitle")}
        description={t("pushDesc")}
        checked={subscribed}
        disabled={saving}
        onChange={(checked) => toggle(checked)}
      />
    </div>
  );
}
