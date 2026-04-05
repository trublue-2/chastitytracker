"use client";

import { useCallback, useEffect, useState } from "react";

export type ThemeMode = "light" | "dark" | "system";

const STORAGE_KEY_USER = "theme-user";
const STORAGE_KEY_ADMIN = "theme-admin";

function getStorageKey(role: "user" | "admin") {
  return role === "admin" ? STORAGE_KEY_ADMIN : STORAGE_KEY_USER;
}

function resolveTheme(mode: ThemeMode, role: "user" | "admin"): string {
  const isDark =
    mode === "dark" ||
    (mode === "system" && typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches);

  if (role === "admin") return isDark ? "admin" : "admin-light";
  return isDark ? "user-dark" : "user";
}

/** Apply data-theme to the nearest theme root element. */
function applyTheme(theme: string, role: "user" | "admin") {
  const selector = role === "admin" ? "#admin-root" : "[data-theme^='user']";
  const el = document.querySelector(selector) as HTMLElement | null;
  if (el) el.setAttribute("data-theme", theme);
}

export function useTheme(role: "user" | "admin") {
  const [mode, setModeState] = useState<ThemeMode>(() => {
    if (typeof window === "undefined") return "system";
    return (localStorage.getItem(getStorageKey(role)) as ThemeMode) ?? "system";
  });

  const setMode = useCallback(
    (next: ThemeMode) => {
      setModeState(next);
      localStorage.setItem(getStorageKey(role), next);
      applyTheme(resolveTheme(next, role), role);
    },
    [role],
  );

  // Apply on mount + listen for system preference changes
  useEffect(() => {
    applyTheme(resolveTheme(mode, role), role);

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    function onChange() {
      const stored = (localStorage.getItem(getStorageKey(role)) as ThemeMode) ?? "system";
      if (stored === "system") {
        applyTheme(resolveTheme("system", role), role);
      }
    }
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [mode, role]);

  return { mode, setMode } as const;
}
