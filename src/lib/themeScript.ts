/**
 * Server-safe FOUC-prevention script generator.
 * Generates an inline IIFE that runs before React hydration.
 * Uses constants from theme.ts but must embed them as string literals
 * since the script runs outside the module system.
 */

import { STORAGE_KEYS, SELECTORS, type ThemeRole } from "@/lib/theme";

const DARK_THEME: Record<ThemeRole, string> = { admin: "admin", user: "user-dark" };
const LIGHT_THEME: Record<ThemeRole, string> = { admin: "admin-light", user: "user" };

export function getThemeInitScript(role: ThemeRole) {
  const storageKey = STORAGE_KEYS[role];
  const darkTheme = DARK_THEME[role];
  const lightTheme = LIGHT_THEME[role];
  const selector = SELECTORS[role];

  return `(function(){try{var m=localStorage.getItem("${storageKey}")||"system";var d=m==="dark"||(m==="system"&&matchMedia("(prefers-color-scheme:dark)").matches);var t=d?"${darkTheme}":"${lightTheme}";var e=document.querySelector('${selector}');if(e)e.setAttribute("data-theme",t);}catch(e){}})();`;
}
