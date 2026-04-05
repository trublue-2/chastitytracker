/**
 * Shared theme primitives used by ThemeApplicator, useTheme, and themeScript.
 * No "use client" — safe for both server and client imports.
 */

export type ThemeMode = "light" | "dark" | "system";
export type ThemeName = "user" | "user-dark" | "admin" | "admin-light";
export type ThemeRole = "user" | "admin";

export const STORAGE_KEYS: Record<ThemeRole, string> = {
  user: "theme-user",
  admin: "theme-admin",
};

export const SELECTORS: Record<ThemeRole, string> = {
  admin: "#admin-root",
  user: "[data-theme^='user']",
};

export function resolveTheme(mode: ThemeMode, role: ThemeRole): ThemeName {
  const isDark =
    mode === "dark" ||
    (mode === "system" &&
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);

  if (role === "admin") return isDark ? "admin" : "admin-light";
  return isDark ? "user-dark" : "user";
}

export function readStoredMode(role: ThemeRole): ThemeMode {
  if (typeof window === "undefined") return "system";
  const raw = localStorage.getItem(STORAGE_KEYS[role]);
  if (raw === "light" || raw === "dark" || raw === "system") return raw;
  return "system";
}

export function applyTheme(role: ThemeRole): void {
  const theme = resolveTheme(readStoredMode(role), role);
  const el = document.querySelector(SELECTORS[role]) as HTMLElement | null;
  if (el && el.getAttribute("data-theme") !== theme) {
    el.setAttribute("data-theme", theme);
  }
}
