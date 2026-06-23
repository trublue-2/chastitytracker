"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import Toggle from "@/app/components/Toggle";
import useToast from "@/app/hooks/useToast";
import { isNativePlatform, isNativePushRegistered, registerNativePush, unregisterNativePush } from "@/lib/nativePush";

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
        isNativePushRegistered().then(setSubscribed);
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
            // Grund-Code + Klartext mit anzeigen (z.B. "error: …") → ohne Web-Inspector diagnostizierbar.
            toast.error(
              result.reason === "denied"
                ? t("pushDenied")
                : `${t("pushRegisterFailed")} (${result.reason ?? "?"}${result.detail ? ": " + result.detail : ""})`,
            );
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
