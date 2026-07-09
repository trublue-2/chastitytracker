"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { setLocaleCookie } from "@/lib/locale";

/**
 * Switches the active locale and refreshes the page. The cookie drives the UI locale immediately;
 * the account setting is persisted so it survives new devices AND drives the language of all
 * server-sent e-mails / push. Persisting is fire-and-forget — a 401 on the public login page
 * (no session) is expected and ignored; the cookie has already applied the UI change.
 */
export function useLocaleSwitcher() {
  const router = useRouter();
  return useCallback((value: string) => {
    setLocaleCookie(value);
    fetch("/api/settings/locale", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locale: value }),
    }).catch(() => { /* ignore — cookie already applied */ });
    router.refresh();
  }, [router]);
}
