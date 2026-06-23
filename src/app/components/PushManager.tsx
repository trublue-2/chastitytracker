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

  // Set up listeners BEFORE calling register() to avoid race condition
  // where the token arrives before the listener is attached.
  const result = await new Promise<boolean>((resolve) => {
    const timeout = setTimeout(() => {
      console.error("[PushManager] APNs registration timed out after 10s");
      resolve(false);
    }, 10_000);

    PushNotifications.addListener("registration", async (tokenData) => {
      clearTimeout(timeout);
      try {
        const res = await fetch("/api/push/native-subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: tokenData.value, platform: Capacitor.getPlatform() }),
        });
        if (!res.ok) {
          console.error("[PushManager] native-subscribe failed", res.status, await res.text());
          resolve(false);
        } else {
          await setNativeToken(tokenData.value); // merken, um beim Ausschalten serverseitig zu löschen
          resolve(true);
        }
      } catch (err) {
        console.error("[PushManager] native-subscribe fetch error", err);
        resolve(false);
      }
    });

    PushNotifications.addListener("registrationError", (err) => {
      clearTimeout(timeout);
      console.error("[PushManager] APNs registration error", err);
      resolve(false);
    });

    PushNotifications.register();
  });

  return result;
}

async function unregisterNativePush(): Promise<void> {
  const { PushNotifications } = await import("@capacitor/push-notifications");
  await PushNotifications.removeAllDeliveredNotifications();
  // Token serverseitig entfernen, damit KEINE Pushes mehr ankommen. Der bei der Registrierung
  // gespeicherte Token wird gezielt abgemeldet; fehlt er (Bestands-Registrierung), entfernt der
  // Server alle Native-Tokens dieses Nutzers (leerer Body).
  const token = await getNativeToken();
  await fetch("/api/push/native-subscribe", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(token ? { token } : {}),
  }).catch((err) => console.error("[PushManager] native-unsubscribe failed", err));
  await clearNativeToken();
}

async function isNativePlatform(): Promise<boolean> {
  const { Capacitor } = await import("@capacitor/core");
  return Capacitor.isNativePlatform();
}

// Native push has no API to query the current registration, so we persist the
// user's choice locally (Capacitor Preferences) and restore the toggle from it
// on mount — otherwise the switch always shows OFF after reopening the app.
const NATIVE_PUSH_FLAG = "pushRegistered";
const NATIVE_PUSH_TOKEN = "pushToken";

// Den APNs/FCM-Token lokal merken, damit beim Ausschalten gezielt DIESES Gerät serverseitig
// abgemeldet werden kann (Capacitor bietet keine API, den Token später zurückzulesen).
async function setNativeToken(token: string): Promise<void> {
  try {
    const { Preferences } = await import("@capacitor/preferences");
    await Preferences.set({ key: NATIVE_PUSH_TOKEN, value: token });
  } catch { /* ignore */ }
}
async function getNativeToken(): Promise<string | null> {
  try {
    const { Preferences } = await import("@capacitor/preferences");
    const { value } = await Preferences.get({ key: NATIVE_PUSH_TOKEN });
    return value ?? null;
  } catch {
    return null;
  }
}
async function clearNativeToken(): Promise<void> {
  try {
    const { Preferences } = await import("@capacitor/preferences");
    await Preferences.remove({ key: NATIVE_PUSH_TOKEN });
  } catch { /* ignore */ }
}

async function getNativePushFlag(): Promise<boolean> {
  try {
    const { Preferences } = await import("@capacitor/preferences");
    const { value } = await Preferences.get({ key: NATIVE_PUSH_FLAG });
    return value === "true";
  } catch {
    return false;
  }
}

async function setNativePushFlag(on: boolean): Promise<void> {
  try {
    const { Preferences } = await import("@capacitor/preferences");
    if (on) await Preferences.set({ key: NATIVE_PUSH_FLAG, value: "true" });
    else await Preferences.remove({ key: NATIVE_PUSH_FLAG });
  } catch { /* ignore — toggle still works, just won't persist visual state */ }
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
        // Native can't query the token, so restore the toggle from the persisted flag.
        getNativePushFlag().then(setSubscribed);
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
          await setNativePushFlag(ok);
          setSubscribed(ok);
        } else {
          await unregisterNativePush();
          await setNativePushFlag(false);
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
