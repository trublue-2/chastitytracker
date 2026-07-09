"use client";

import { useCallback } from "react";
import { setLocaleCookie } from "@/lib/locale";

/**
 * Switches the active locale. The `locale` cookie drives the UI locale immediately; the account
 * setting is persisted so it survives new devices AND drives the language of all server-sent
 * e-mails / push. Persisting is best-effort — a 401 on the public login page (no session) is
 * expected and ignored; the cookie has already applied the UI change.
 *
 * A full `window.location.reload()` is used deliberately instead of `router.refresh()`: on
 * authenticated pages the App Router's client-side Router Cache holds the prefetched RSC payload and
 * does NOT reliably re-render cookie-derived locale on a soft refresh — the language only switched
 * after toggling twice (en→de→en→de). A hard reload re-reads the cookie server-side and applies the
 * new language in a single step. A language switch is a rare action, so the full reload is fine.
 * The PATCH uses `keepalive` so it survives the immediate navigation — no need to wait for it, the
 * reload can fire right away (the cookie, set synchronously above, already carries the UI change).
 */
export function useLocaleSwitcher() {
  return useCallback((value: string) => {
    setLocaleCookie(value);
    void fetch("/api/settings/locale", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locale: value }),
      keepalive: true,
    }).catch(() => { /* ignore — cookie already applied (e.g. 401 on the public login page) */ });
    window.location.reload();
  }, []);
}
