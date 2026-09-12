"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
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

/** Was DIESES Gerät kann — nicht, was das Konto hat. Hook-intern: nach aussen genügt `switchable`
 *  plus `hint`, und ein Zustand, den niemand vergleichen kann, lädt auch niemanden dazu ein. */
type PushPlatformState =
  | "loading"
  | "native"            // Capacitor native app
  | "supported"         // PushManager available, ready to toggle (web/PWA)
  | "denied"            // notifications blocked
  | "ios-not-installed" // iOS Safari but not installed as PWA
  | "ios-old"           // iOS standalone but too old for push (< 16.4)
  | "unsupported";      // no push support at all

function detectWebPushState(): Exclude<PushPlatformState, "loading" | "native"> {
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

/** Zustände, in denen es nichts zu schalten gibt — dann trägt die Zeile statt des Schalters diesen
 *  Hinweis (Schlüssel im `settings`-Namensraum). */
const HINT: Partial<Record<PushPlatformState, { key: string; warn?: boolean }>> = {
  "ios-not-installed": { key: "pushIosNotInstalled" },
  "ios-old": { key: "pushIosOld" },
  unsupported: { key: "pushNotSupported" },
  // Der einzige Hinweis, der ein HINDERNIS nennt statt einer Voraussetzung: hier hat der Nutzer
  // selbst abgelehnt und muss es im Browser zurücknehmen.
  denied: { key: "pushDenied", warn: true },
};

export interface PushDevice {
  /** Ist DIESES Gerät als Push-Ziel angemeldet? */
  enabled: boolean;
  /** Lässt es sich hier überhaupt umschalten (sonst nur `hint`)? */
  switchable: boolean;
  saving: boolean;
  /** Warum nicht schaltbar — Schlüssel im `settings`-Namensraum. `null`, solange geladen wird oder
   *  es geht; das unterscheidet die Zeile „lädt noch" von „geht hier nicht". */
  hint: { key: string; warn?: boolean } | null;
  setEnabled: (next: boolean) => void;
}

/**
 * Die Push-Anmeldung DIESES Geräts: Plattform-Erkennung, Zustand, Umschalten.
 *
 * Bewusst ein Hook und nicht in der Zeile verbaut, weil zwei Stellen denselben Zustand brauchen und
 * ihn sonst beide selbst ermitteln müssten: die Zeile „Push erlauben" zeigt ihn an, und die
 * Kanal-Stufe darunter wird davon SOFORT bedienbar. Der Server weiss erst nach `router.refresh()`,
 * dass ein Ziel existiert — bis dahin wäre das Auswahlfeld grau, obwohl der Nutzer gerade erlaubt
 * hat, was es braucht.
 *
 * Gerät ≠ Konto: dieser Zustand gilt für den Browser bzw. die App, in der die Seite gerade läuft.
 * Ob das KONTO irgendein Push-Ziel hat, sagt allein der Server (`hasPushTarget`) — auf dem Handy
 * abgeschaltet heisst nicht, dass das Tablet nichts mehr bekommt.
 */
export function usePushDevice(): PushDevice {
  const t = useTranslations("settings");
  const toast = useToast();
  const router = useRouter();
  const [state, setState] = useState<PushPlatformState>("loading");
  const [enabled, setEnabled] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    isNativePlatform().then((native) => {
      if (native) {
        setState("native");
        isNativePushRegistered().then(setEnabled);
      } else {
        const detected = detectWebPushState();
        setState(detected);
        if (detected === "supported") {
          navigator.serviceWorker.ready
            .then((reg) => reg.pushManager.getSubscription())
            .then((sub) => setEnabled(!!sub));
        }
      }
    });
  }, []);

  const apply = useCallback(async (next: boolean) => {
    if (state !== "supported" && state !== "native") return;
    setEnabled(next); // optimistisch: der Schalter reagiert SOFORT; revert nur bei Fehlschlag
    setSaving(true);
    // Hat sich am SERVER etwas bewegt? Nur dann lohnt der Nachlauf unten. Eine abgelehnte
    // Berechtigung und ein gescheiterter Versuch ändern nur diese Ansicht — sie kosteten sonst je
    // einen vollen Neuabruf der Seite samt ihrer vier Abfragen für null neue Information.
    let wrote = false;
    try {
      if (state === "native") {
        if (next) {
          const result = await registerNativePush();
          wrote = result.ok;
          if (!result.ok) {
            setEnabled(false);
            // Grund-Code + Klartext mit anzeigen (z.B. "error: …") → ohne Web-Inspector diagnostizierbar.
            toast.error(
              result.reason === "denied"
                ? t("pushDenied")
                : `${t("pushRegisterFailed")} (${result.reason ?? "?"}${result.detail ? ": " + result.detail : ""})`,
            );
          }
        } else {
          await unregisterNativePush();
          wrote = true;
        }
        return;
      }

      // --- Web Push (PWA) ---
      const reg = await navigator.serviceWorker.ready;
      if (next) {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          setEnabled(false);
          if (permission === "denied") setState("denied");
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
        wrote = true;
      } else {
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await fetch("/api/push/subscribe", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ endpoint: sub.endpoint }),
          });
          await sub.unsubscribe();
          wrote = true;
        }
      }
    } catch (err) {
      console.error("[usePushDevice]", err);
      setEnabled(!next); // revert bei Fehler
      toast.error(t("pushRegisterFailed"));
    } finally {
      setSaving(false);
      // Ob das KONTO ein Push-Ziel hat, weiss nur der Server — die Warnung „kein Kanal trägt" und
      // die Ausgrauung der Push-Stufe neu lesen. Aber nur, wenn dort auch etwas geschrieben wurde.
      if (wrote) router.refresh();
    }
  }, [state, t, toast, router]);

  return {
    enabled,
    switchable: state === "supported" || state === "native",
    saving,
    hint: HINT[state] ?? null,
    setEnabled: (next) => void apply(next),
  };
}
