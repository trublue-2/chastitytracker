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

type PushState =
  | "loading"
  | "supported"        // PushManager available, ready to toggle
  | "denied"           // User blocked notifications
  | "ios-not-installed" // iOS Safari but not installed as PWA
  | "ios-old"          // iOS standalone but too old for push (< 16.4)
  | "unsupported";     // Browser doesn't support push at all

function detectPushState(): PushState {
  if (typeof window === "undefined") return "loading";

  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isStandalone = window.matchMedia("(display-mode: standalone)").matches
    || ("standalone" in navigator && (navigator as { standalone?: boolean }).standalone === true);

  // iOS-specific detection
  if (isIOS) {
    if (!isStandalone) {
      // Safari on iOS — push only works when installed as PWA
      return "ios-not-installed";
    }
    // Standalone iOS — PushManager available means iOS 16.4+
    if (!("PushManager" in window)) {
      return "ios-old";
    }
  }

  // General browser support check
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    return "unsupported";
  }

  if (Notification.permission === "denied") {
    return "denied";
  }

  return "supported";
}

export default function PushManager() {
  const t = useTranslations("settings");
  const [pushState, setPushState] = useState<PushState>("loading");
  const [subscribed, setSubscribed] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const state = detectPushState();
    setPushState(state);

    if (state === "supported") {
      navigator.serviceWorker.ready.then((reg) =>
        reg.pushManager.getSubscription()
      ).then((sub) => setSubscribed(!!sub));
    }
  }, []);

  async function toggle(enable: boolean) {
    if (pushState !== "supported") return;
    setSaving(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      if (enable) {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          if (permission === "denied") setPushState("denied");
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

  // Loading state — don't render anything yet
  if (pushState === "loading") return null;

  // iOS: not installed as PWA
  if (pushState === "ios-not-installed") {
    return (
      <p className="text-xs text-foreground-faint px-5 py-4">{t("pushIosNotInstalled")}</p>
    );
  }

  // iOS: too old for push
  if (pushState === "ios-old") {
    return (
      <p className="text-xs text-foreground-faint px-5 py-4">{t("pushIosOld")}</p>
    );
  }

  // Browser doesn't support push
  if (pushState === "unsupported") {
    return (
      <p className="text-xs text-foreground-faint px-5 py-4">{t("pushNotSupported")}</p>
    );
  }

  // User blocked notifications
  if (pushState === "denied") {
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
