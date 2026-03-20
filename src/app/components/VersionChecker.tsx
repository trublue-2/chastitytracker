"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 Minuten

export default function VersionChecker({ buildDate }: { buildDate: string }) {
  const t = useTranslations("versionChecker");
  const [outdated, setOutdated] = useState(false);
  const initialBuildDate = useRef(buildDate);

  useEffect(() => {
    async function check() {
      try {
        const res = await fetch("/api/version", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (data.buildDate && data.buildDate !== initialBuildDate.current) {
          setOutdated(true);
        }
      } catch {
        // Netzwerkfehler ignorieren
      }
    }

    const interval = setInterval(check, POLL_INTERVAL_MS);

    // visibilitychange (Desktop/Android)
    function onVisible() {
      if (document.visibilityState === "visible") check();
    }
    // pageshow: zuverlässiger auf iOS PWA beim App-Wechsel
    function onPageShow(e: PageTransitionEvent) {
      if (e.persisted || document.visibilityState === "visible") check();
    }
    // focus: Fallback wenn visibilitychange nicht feuert
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
  }, []);

  if (!outdated) return null;

  return (
    <div className="fixed bottom-20 left-4 right-4 sm:left-auto sm:right-6 sm:w-80 z-50">
      <div className="bg-gray-900 text-white rounded-2xl px-4 py-3 flex items-center gap-3 shadow-xl">
        <span className="text-lg flex-shrink-0">🔄</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">{t("title")}</p>
          <p className="text-xs text-gray-400">{t("subtitle")}</p>
        </div>
        <button
          onClick={() => window.location.reload()}
          className="flex-shrink-0 bg-white text-gray-900 text-xs font-bold px-3 py-1.5 rounded-xl hover:bg-gray-100 transition"
        >
          {t("reload")}
        </button>
      </div>
    </div>
  );
}
