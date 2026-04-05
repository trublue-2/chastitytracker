"use client";

import { useEffect } from "react";
import { applyTheme, STORAGE_KEYS, type ThemeRole } from "@/lib/theme";

/**
 * Always-mounted component that keeps data-theme in sync with localStorage
 * and system preference. Must be placed in the layout (not in a dropdown).
 */
export default function ThemeApplicator({ role }: { role: ThemeRole }) {
  useEffect(() => {
    applyTheme(role);

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onSystemChange = () => applyTheme(role);
    mq.addEventListener("change", onSystemChange);

    const storageKey = STORAGE_KEYS[role];
    const onStorage = (e: StorageEvent) => {
      if (e.key === storageKey) applyTheme(role);
    };
    window.addEventListener("storage", onStorage);

    const onThemeChanged = (e: Event) => {
      if ((e as CustomEvent).detail?.role === role) applyTheme(role);
    };
    window.addEventListener("theme-changed", onThemeChanged);

    return () => {
      mq.removeEventListener("change", onSystemChange);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("theme-changed", onThemeChanged);
    };
  }, [role]);

  return null;
}
