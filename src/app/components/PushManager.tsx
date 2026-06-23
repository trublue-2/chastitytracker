"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import Toggle from "@/app/components/Toggle";
import useToast from "@/app/hooks/useToast";

// ---------------------------------------------------------------------------
// Native (Capacitor) push helpers — loaded dynamically so the import never
// runs on the server or in a plain browser context without the bridge.
// ---------------------------------------------------------------------------

type RegisterResult = { ok: boolean; reason?: "denied" | "timeout" | "error" | "subscribe-failed" | "not-native" };

async function registerNativePush(): Promise<RegisterResult> {
  const { PushNotifications } = await import("@capacitor/push-notifications");
  const { Capacitor } = await import("@capacitor/core");
  if (!Capacitor.isNativePlatform()) return { ok: false, reason: "not-native" };

  let permStatus = await PushNotifications.checkPermissions();
  if (permStatus.receive === "prompt") {
    permStatus = await PushNotifications.requestPermissions();
  }
  if (permStatus.receive !== "granted") return { ok: false, reason: "denied" };

  // EINMALIGE Auflösung garantieren: der frühere Code löschte den Timeout, sobald das
  // registration-Event feuerte — hing danach der fetch, wurde das Promise NIE aufgelöst und der
  // Toggle blieb dauerhaft disabled (saving=true). `finish` löst genau einmal auf, räumt Timeout +
  // Listener auf; ein Gesamt-Timeout deckt Registrierung UND Subscribe ab, der fetch hat zusätzlich
  // ein eigenes Limit. Listener werden gezielt entfernt (nicht removeAllListeners → würde den
  // Tap-Handler aus NativePushRouter killen).
  let settled = false;
  let resolveFn: (r: RegisterResult) => void;
  const done = new Promise<RegisterResult>((res) => { resolveFn = res; });

  const regHandle = await PushNotifications.addListener("registration", async (tokenData) => {
    try {
      const res = await fetch("/api/push/native-subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: tokenData.value, platform: Capacitor.getPlatform() }),
        signal: AbortSignal.timeout(8_000),
      });
      if (res.ok) {
        await setNativeToken(tokenData.value); // merken, um beim Ausschalten serverseitig zu löschen
        finish({ ok: true });
      } else {
        console.error("[PushManager] native-subscribe failed", res.status);
        finish({ ok: false, reason: "subscribe-failed" });
      }
    } catch (err) {
      console.error("[PushManager] native-subscribe error", err);
      finish({ ok: false, reason: "subscribe-failed" });
    }
  });
  const errHandle = await PushNotifications.addListener("registrationError", (err) => {
    console.error("[PushManager] APNs registration error", err);
    finish({ ok: false, reason: "error" });
  });
  const timeout = setTimeout(() => finish({ ok: false, reason: "timeout" }), 15_000);

  function finish(r: RegisterResult) {
    if (settled) return;
    settled = true;
    clearTimeout(timeout);
    regHandle.remove();
    errHandle.remove();
    resolveFn(r);
  }

  await PushNotifications.register();
  return done;
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
  const toast = useToast();
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
          const result = await registerNativePush();
          await setNativePushFlag(result.ok);
          setSubscribed(result.ok);
          if (!result.ok) {
            toast.error(result.reason === "denied" ? t("pushDenied") : t("pushRegisterFailed"));
          }
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
