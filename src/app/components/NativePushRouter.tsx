"use client";

import { useEffect } from "react";

/**
 * Öffnet beim Tippen auf eine NATIVE Push-Benachrichtigung (Capacitor/iOS) die passende Seite
 * INNERHALB der App statt im Browser. Der Push-Payload trägt einen relativen `url`-Pfad
 * (z.B. /dashboard/new/pruefung?code=…); wir navigieren das WebView dorthin — gleicher Origin →
 * bleibt in der App. No-op im Browser/PWA (dort übernimmt der Service-Worker den Klick).
 *
 * App-weit im Layout gemountet, damit der Listener auch bei einem Kaltstart aus der Push-Tap
 * aktiv ist.
 */
export default function NativePushRouter() {
  useEffect(() => {
    let remove: (() => void) | null = null;
    let cancelled = false;

    (async () => {
      try {
        const { Capacitor } = await import("@capacitor/core");
        if (!Capacitor.isNativePlatform()) return;
        const { PushNotifications } = await import("@capacitor/push-notifications");
        const handle = await PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
          const url = (action.notification?.data as { url?: unknown })?.url;
          // Nur same-origin-relative Pfade zulassen (kein externer Redirect via manipuliertem Push).
          if (typeof url === "string" && url.startsWith("/")) {
            window.location.href = url;
          }
        });
        if (cancelled) handle.remove();
        else remove = () => handle.remove();
      } catch (err) {
        console.error("[NativePushRouter]", err);
      }
    })();

    return () => {
      cancelled = true;
      remove?.();
    };
  }, []);

  return null;
}
