"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import useToast from "@/app/hooks/useToast";

const POLL_INTERVAL_MS = 60_000;

/**
 * Detects when the auth-session cookie has been replaced (e.g. by another tab
 * of the same browser logging in with a different account). The Next.js App
 * Router caches the layout (and the Header within it) on soft navigation, so
 * pages re-render with the new session while the header keeps showing the old
 * user — leaving the UI inconsistent and silently writing entries against the
 * wrong account.
 *
 * On detection: hard reload to re-render the layout with the current session.
 */
export default function SessionGuard({ initialUserId }: { initialUserId: string }) {
  const t = useTranslations("sessionGuard");
  const toast = useToast();
  const initialIdRef = useRef(initialUserId);
  const reloadingRef = useRef(false);

  useEffect(() => {
    async function check() {
      if (reloadingRef.current) return;
      try {
        const res = await fetch("/api/auth/session", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        const currentId: string | null = data?.user?.id ?? null;
        // Logged out → proxy will redirect on next request, no action here.
        if (!currentId) return;
        if (currentId !== initialIdRef.current) {
          reloadingRef.current = true;
          toast.warning(t("switched"), { duration: 1500 });
          setTimeout(() => window.location.reload(), 1500);
        }
      } catch {
        // Network errors are transient — silent.
      }
    }

    const interval = setInterval(check, POLL_INTERVAL_MS);

    function onVisible() {
      if (document.visibilityState === "visible") check();
    }
    function onPageShow(e: PageTransitionEvent) {
      if (e.persisted || document.visibilityState === "visible") check();
    }
    function onFocus() { check(); }

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("focus", onFocus);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("focus", onFocus);
    };
  }, [toast, t]);

  return null;
}
