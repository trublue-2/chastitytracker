"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import useToast from "@/app/hooks/useToast";

const POLL_INTERVAL_MS = 30_000;

/**
 * Ein einziger Client-Heartbeat statt drei separater Polls (Version/Session/Pending). Pollt
 * /api/heartbeat periodisch und sofort bei Tab-Fokus/visibilitychange/pageshow, und reagiert auf:
 *  - neue Version  → Reload-Banner (wie zuvor VersionChecker)
 *  - Account-Wechsel → Hard-Reload (wie zuvor SessionGuard)
 *  - geänderte offene Anforderungen → router.refresh (wie zuvor PendingDirectivesWatcher)
 */
export default function Heartbeat({ buildDate, initialUserId }: { buildDate: string; initialUserId: string | null }) {
  const router = useRouter();
  const tv = useTranslations("versionChecker");
  const ts = useTranslations("sessionGuard");
  const toast = useToast();
  const [outdated, setOutdated] = useState(false);

  const buildRef = useRef(buildDate);
  const userRef = useRef(initialUserId);
  const sigRef = useRef<string | null>(null);
  const reloadingRef = useRef(false);
  const inFlightRef = useRef(false);

  useEffect(() => {
    async function check() {
      if (reloadingRef.current || inFlightRef.current) return;
      inFlightRef.current = true;
      try {
        const res = await fetch("/api/heartbeat", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { buildDate?: string; sessionUserId?: string | null; pendingSig?: string };

        // 1) Neue App-Version
        if (data.buildDate && data.buildDate !== buildRef.current) setOutdated(true);

        // 2) Account-Wechsel (nur wenn wir eingeloggt gestartet sind) → Hard-Reload
        if (userRef.current && data.sessionUserId && data.sessionUserId !== userRef.current) {
          reloadingRef.current = true;
          toast.warning(ts("switched"), { duration: 1500 });
          setTimeout(() => window.location.reload(), 1500);
          return;
        }

        // 3) Offene Anforderungen geändert → Server-Komponenten neu laden
        const sig = data.pendingSig ?? "";
        if (sigRef.current === null) {
          sigRef.current = sig; // Baseline beim ersten Lauf — kein Refresh
        } else if (sig !== sigRef.current) {
          sigRef.current = sig;
          router.refresh();
        }
      } catch {
        // transiente Netzfehler ignorieren
      } finally {
        inFlightRef.current = false;
      }
    }

    const interval = setInterval(check, POLL_INTERVAL_MS);
    function onVisible() { if (document.visibilityState === "visible") check(); }
    function onPageShow(e: PageTransitionEvent) { if (e.persisted || document.visibilityState === "visible") check(); }
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
  }, [router, toast, ts]);

  if (!outdated) return null;

  return (
    <div className="fixed bottom-20 left-4 right-4 sm:left-auto sm:right-6 sm:w-80 z-50">
      <div className="bg-gray-900 text-white rounded-2xl px-4 py-3 flex items-center gap-3 shadow-xl">
        <RefreshCw size={18} className="flex-shrink-0 text-gray-300 animate-spin" style={{ animationDuration: "2s" }} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">{tv("title")}</p>
          <p className="text-xs text-gray-400">{tv("subtitle")}</p>
        </div>
        <button
          onClick={async () => {
            const reg = await navigator.serviceWorker.getRegistration();
            if (reg?.waiting) {
              reg.waiting.postMessage({ type: "SKIP_WAITING" });
            }
            window.location.reload();
          }}
          className="flex-shrink-0 bg-white text-gray-900 text-xs font-bold px-3 py-1.5 rounded-xl hover:bg-gray-100 transition"
        >
          {tv("reload")}
        </button>
      </div>
    </div>
  );
}
