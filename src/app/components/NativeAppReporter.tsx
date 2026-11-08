"use client";

import { useEffect } from "react";
import { getNativeAppInfo } from "@/lib/nativeApp";
import { prefGet, prefSet } from "@/lib/capacitorPrefs";

/** Preferences-Key der Installations-ID — liest nur diese Datei; ein Umbenennen machte jedes Gerät
 *  zur neuen Installation. */
const INSTALL_ID_KEY = "ct_install_id";
/** Höchstens so oft je Nutzer und Gerät melden — „zuletzt gesehen" braucht keine Minuten-Genauigkeit. */
const REPORT_EVERY_MS = 60 * 60 * 1000;

/**
 * Meldet der Instanz, dass dieser Nutzer die App nutzt (`/api/native/app-seen`). Ausserhalb der App
 * tut die Komponente nichts. Nur für angemeldete Nutzer eingehängt (`layout.tsx`).
 */
export default function NativeAppReporter({ userId }: { userId: string }) {
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const info = await getNativeAppInfo();
      if (!info || cancelled) return;
      // Je Nutzer UND Build: nach einem App-Update meldet sich die neue Version sofort.
      const throttleKey = `ct_app_seen_${userId}_${info.build}`;
      try {
        if (Date.now() - Number(localStorage.getItem(throttleKey) ?? 0) < REPORT_EVERY_MS) return;
      } catch { /* ohne localStorage: einfach melden */ }

      let installId = await prefGet(INSTALL_ID_KEY);
      if (!installId) {
        installId = crypto.randomUUID();
        await prefSet(INSTALL_ID_KEY, installId);
      }
      const res = await fetch("/api/native/app-seen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...info, installId }),
      }).catch(() => null);
      if (res?.ok) {
        try { localStorage.setItem(throttleKey, String(Date.now())); } catch { /* egal */ }
      }
    })();
    return () => { cancelled = true; };
  }, [userId]);
  return null;
}
