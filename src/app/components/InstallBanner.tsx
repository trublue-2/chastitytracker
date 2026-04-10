"use client";

import { useEffect, useState } from "react";
import { X, Download, Share } from "lucide-react";
import { useTranslations } from "next-intl";

type Platform = "android" | "ios" | null;

declare global {
  interface WindowEventMap {
    beforeinstallprompt: BeforeInstallPromptEvent;
  }
}
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export default function InstallBanner() {
  const t = useTranslations("installBanner");
  const [platform, setPlatform] = useState<Platform>(null);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(true); // start hidden to avoid flash

  useEffect(() => {
    const dismissed = localStorage.getItem("pwa-install-dismissed");
    const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
    if (dismissed && Date.now() - Number(dismissed) < THIRTY_DAYS) return;

    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const isStandalone = window.matchMedia("(display-mode: standalone)").matches
      || ("standalone" in navigator && (navigator as { standalone?: boolean }).standalone === true);

    if (isStandalone) return; // already installed as PWA

    // Hide in Capacitor native app — already installed as a native app
    if ((window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.()) return;

    if (isIos) {
      setPlatform("ios");
      setDismissed(false);
      return;
    }

    const handler = (e: BeforeInstallPromptEvent) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setPlatform("android");
      setDismissed(false);
    };
    window.addEventListener("beforeinstallprompt", handler);

    window.addEventListener("appinstalled", () => setDismissed(true), { once: true });

    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  function dismiss() {
    localStorage.setItem("pwa-install-dismissed", String(Date.now()));
    setDismissed(true);
  }

  async function install() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    setDeferredPrompt(null);
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") setDismissed(true);
    else dismiss();
  }

  if (dismissed || !platform) return null;

  return (
    <div className="fixed bottom-20 sm:bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:w-80 z-50 bg-foreground text-background rounded-xl shadow-xl p-4 flex items-start gap-3">
      <div className="flex-1">
        <p className="font-semibold text-sm">{t("title")}</p>
        {platform === "android" ? (
          <p className="text-xs text-foreground-invert opacity-70 mt-0.5">{t("androidDesc")}</p>
        ) : (
          <p className="text-xs text-foreground-invert opacity-70 mt-0.5">
            {t("iosBefore")} <Share size={12} className="inline mb-0.5" /> {t("iosAfter")} <strong>{t("iosHomeScreen")}</strong>.
          </p>
        )}
      </div>

      {platform === "android" && (
        <button
          onClick={install}
          className="flex items-center gap-1.5 bg-[var(--color-inspect)] hover:opacity-90 text-white text-xs font-semibold px-3 py-2 rounded-lg flex-shrink-0"
        >
          <Download size={14} />
          {t("install")}
        </button>
      )}

      <button onClick={dismiss} className="text-foreground-invert opacity-50 hover:opacity-100 flex-shrink-0 mt-0.5">
        <X size={16} />
      </button>
    </div>
  );
}
