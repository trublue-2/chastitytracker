"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import Toggle from "@/app/components/Toggle";
import useToast from "@/app/hooks/useToast";

// ---------------------------------------------------------------------------
// Capacitor Preferences — ein get/set für alle Keys (set(null) = remove).
// Dynamisch importiert, damit nichts auf dem Server / im reinen Browser läuft.
// ---------------------------------------------------------------------------
async function prefGet(key: string): Promise<string | null> {
  try {
    const { Preferences } = await import("@capacitor/preferences");
    return (await Preferences.get({ key })).value ?? null;
  } catch {
    return null;
  }
}
async function prefSet(key: string, value: string | null): Promise<void> {
  try {
    const { Preferences } = await import("@capacitor/preferences");
    if (value === null) await Preferences.remove({ key });
    else await Preferences.set({ key, value });
  } catch {
    /* ignore — Toggle funktioniert weiter, nur ohne Persistenz */
  }
}

// Der gespeicherte Token IST der Registrierungs-Zustand — kein separates Flag (sonst zwei Quellen
// für eine Wahrheit, die auseinanderlaufen können). Vorhanden = Push für dieses Gerät aktiv.
const NATIVE_PUSH_TOKEN = "pushToken";

async function isNativePlatform(): Promise<boolean> {
  try {
    const { Capacitor } = await import("@capacitor/core");
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

type RegisterResult = { ok: boolean; reason?: "denied" | "timeout" | "error" | "subscribe-failed" | "not-native" };

async function registerNativePush(): Promise<RegisterResult> {
  const [{ PushNotifications }, { Capacitor }] = await Promise.all([
    import("@capacitor/push-notifications"),
    import("@capacitor/core"),
  ]);
  if (!Capacitor.isNativePlatform()) return { ok: false, reason: "not-native" };

  let perm = await PushNotifications.checkPermissions();
  if (perm.receive === "prompt") perm = await PushNotifications.requestPermissions();
  if (perm.receive !== "granted") return { ok: false, reason: "denied" };

  // Genau EINE Auflösung garantieren: der Gesamt-Timeout deckt Registrierung UND Subscribe ab, der
  // fetch hat ein eigenes Limit, Listener werden gezielt entfernt (nicht removeAllListeners → würde
  // den Tap-Handler aus NativePushRouter killen). Sonst bliebe der Toggle bei hängendem fetch disabled.
  let settled = false;
  let resolveFn: (r: RegisterResult) => void;
  const done = new Promise<RegisterResult>((res) => { resolveFn = res; });

  const regHandle = await PushNotifications.addListener("registration", async (tok) => {
    try {
      const res = await fetch("/api/push/native-subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: tok.value, platform: Capacitor.getPlatform() }),
        signal: AbortSignal.timeout(8_000),
      });
      if (res.ok) {
        await prefSet(NATIVE_PUSH_TOKEN, tok.value);
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
  // Token serverseitig abmelden (gezielt; fehlt der lokale Token, entfernt der Server alle des Nutzers).
  const token = await prefGet(NATIVE_PUSH_TOKEN);
  await fetch("/api/push/native-subscribe", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(token ? { token } : {}),
  }).catch((err) => console.error("[PushManager] native-unsubscribe failed", err));
  await prefSet(NATIVE_PUSH_TOKEN, null);
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
  | "native"            // Capacitor native app
  | "supported"         // PushManager available, ready to toggle (web/PWA)
  | "denied"            // notifications blocked
  | "ios-not-installed" // iOS Safari but not installed as PWA
  | "ios-old"           // iOS standalone but too old for push (< 16.4)
  | "unsupported";      // no push support at all

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

// Zustände, die nur einen Text-Hinweis zeigen (kein interaktiver Toggle).
const TEXT_STATES: Partial<Record<PushState, { key: string; warn?: boolean }>> = {
  "ios-not-installed": { key: "pushIosNotInstalled" },
  "ios-old": { key: "pushIosOld" },
  unsupported: { key: "pushNotSupported" },
  denied: { key: "pushDenied", warn: true },
};

export default function PushManager() {
  const t = useTranslations("settings");
  const toast = useToast();
  const [pushState, setPushState] = useState<PushState>("loading");
  const [subscribed, setSubscribed] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    isNativePlatform().then((native) => {
      if (native) {
        setPushState("native");
        // Native kann den Token nicht abfragen → aus dem gespeicherten Token ableiten.
        prefGet(NATIVE_PUSH_TOKEN).then((tok) => setSubscribed(tok !== null));
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
    setSubscribed(enable); // optimistisch: der Schalter reagiert SOFORT; revert nur bei Fehlschlag
    setSaving(true);
    try {
      if (pushState === "native") {
        if (enable) {
          const result = await registerNativePush();
          if (!result.ok) {
            setSubscribed(false);
            toast.error(result.reason === "denied" ? t("pushDenied") : t("pushRegisterFailed"));
          }
        } else {
          await unregisterNativePush();
        }
        return;
      }

      // --- Web Push (PWA) ---
      const reg = await navigator.serviceWorker.ready;
      if (enable) {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          setSubscribed(false);
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
      }
    } catch (err) {
      console.error("[PushManager]", err);
      setSubscribed(!enable); // revert bei Fehler
      toast.error(t("pushRegisterFailed"));
    } finally {
      setSaving(false);
    }
  }

  if (pushState === "loading") return null;

  const textState = TEXT_STATES[pushState];
  if (textState) {
    return <p className={`text-xs px-5 py-4 ${textState.warn ? "text-warn" : "text-foreground-faint"}`}>{t(textState.key)}</p>;
  }

  // native | supported → interaktiver Toggle
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
