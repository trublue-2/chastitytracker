"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import Toggle from "@/app/components/Toggle";

// ---------------------------------------------------------------------------
// Native (Capacitor) push helpers — loaded dynamically so the import never
// runs on the server or in a plain browser context without the bridge.
// ---------------------------------------------------------------------------

async function registerNativePush(): Promise<boolean> {
  const { PushNotifications } = await import("@capacitor/push-notifications");
  const { Capacitor } = await import("@capacitor/core");
  if (!Capacitor.isNativePlatform()) return false;

  let permStatus = await PushNotifications.checkPermissions();
  if (permStatus.receive === "prompt") {
    permStatus = await PushNotifications.requestPermissions();
  }
  if (permStatus.receive !== "granted") return false;

  await PushNotifications.register();

  return new Promise((resolve) => {
    PushNotifications.addListener("registration", async (tokenData) => {
      await fetch("/api/push/native-subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: tokenData.value, platform: Capacitor.getPlatform() }),
      });
      resolve(true);
    });
    PushNotifications.addListener("registrationError", () => resolve(false));
  });
}

async function unregisterNativePush(): Promise<void> {
  const { PushNotifications } = await import("@capacitor/push-notifications");
  const result = await PushNotifications.getDeliveredNotifications();
  await PushNotifications.removeAllDeliveredNotifications();
  // Best-effort: tell the server to remove the token.
  // We can't read the token back easily, so we rely on the server to clean up
  // stale tokens when delivery fails (analogous to web push 410 handling).
  void result;
}

async function isNativePlatform(): Promise<boolean> {
  const { Capacitor } = await import("@capacitor/core");
  return Capacitor.isNativePlatform();
}

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
  | "native"            // Running inside Capacitor native app
  | "supported"         // PushManager available, ready to toggle (web/PWA)
  | "denied"            // User blocked notifications
  | "ios-not-installed" // iOS Safari but not installed as PWA
  | "ios-old"           // iOS standalone but too old for push (< 16.4)
  | "unsupported";      // Browser doesn't support push at all

function detectWebPushState(): Exclude<PushState, "loading" | "native"> {
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isStandalone = window.matchMedia("(display-mode: standalone)").matches
    || ("standalone" in navigator && (navigator as { standalone?: boolean }).standalone === true);

  if (isIOS) {
    if (!isStandalone) return "ios-not-installed";
    if (!("PushManager" in window)) return "ios-old";
  }

  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return "unsupported";
  if (Notification.permission === "denied") return "denied";

  return "supported";
}

export default function PushManager() {
  const t = useTranslations("settings");
  const [pushState, setPushState] = useState<PushState>("loading");
  const [subscribed, setSubscribed] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // Check native platform first (async), fall back to web push detection.
    isNativePlatform().then((native) => {
      if (native) {
        setPushState("native");
        // Native: treat as subscribed if we can register — we'll attempt on toggle.
        // For initial state, assume not subscribed (no way to query token without triggering).
        setSubscribed(false);
      } else {
        const state = detectWebPushState();
        setPushState(state);
        if (state === "supported") {
          navigator.serviceWorker.ready
            .then((reg) => reg.pushManager.getSubscription())
            .then((sub) => setSubscribed(!!sub));
        }
      }
    });
  }, []);

  async function toggle(enable: boolean) {
    if (pushState !== "supported" && pushState !== "native") return;
    setSaving(true);
    try {
      if (pushState === "native") {
        // --- Native Capacitor push ---
        if (enable) {
          const ok = await registerNativePush();
          setSubscribed(ok);
        } else {
          await unregisterNativePush();
          setSubscribed(false);
        }
        return;
      }

      // --- Web Push (PWA) ---
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
      if (pushState === "supported") {
        // Re-sync state with actual subscription status
        try {
          const reg = await navigator.serviceWorker.ready;
          const sub = await reg.pushManager.getSubscription();
          setSubscribed(!!sub);
        } catch { /* ignore */ }
      }
    } finally {
      setSaving(false);
    }
  }

  // Loading state — don't render anything yet
  if (pushState === "loading") return null;

  // Native Capacitor app — show toggle (same UI as web push supported state)
  if (pushState === "native") {
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
