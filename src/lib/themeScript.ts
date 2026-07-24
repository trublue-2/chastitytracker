/**
 * Server-safe FOUC-prevention script generator.
 * Generates an inline IIFE that runs before React hydration.
 * Uses constants from theme.ts but must embed them as string literals
 * since the script runs outside the module system.
 */

import { STORAGE_KEYS, SELECTORS, resolveTheme, THEME_ROLES, type ThemeRole } from "@/lib/theme";

// Abgeleitet statt abgeschrieben: nur der SKRIPT-TEXT muss ohne Modulsystem auskommen, dieses Modul
// selbst laeuft serverseitig ganz normal und kann resolveTheme aufrufen. Vorher standen dieselben
// vier Theme-Namen hier ein zweites Mal als Literale — driften sie auseinander, setzt das Skript vor
// der Hydration einen anderen Wert als die Runtime danach, und der Unterschied faellt genau dort
// auf, wo er am schwersten zu deuten ist (Hydration-Meldung statt Testfehler).
const DARK_THEME = Object.fromEntries(THEME_ROLES.map((r) => [r, resolveTheme("dark", r)])) as Record<ThemeRole, string>;
const LIGHT_THEME = Object.fromEntries(THEME_ROLES.map((r) => [r, resolveTheme("light", r)])) as Record<ThemeRole, string>;

export function getThemeInitScript(role: ThemeRole) {
  const storageKey = STORAGE_KEYS[role];
  const darkTheme = DARK_THEME[role];
  const lightTheme = LIGHT_THEME[role];
  const selector = SELECTORS[role];

  return `(function(){try{var m=localStorage.getItem("${storageKey}")||"system";var d=m==="dark"||(m==="system"&&matchMedia("(prefers-color-scheme:dark)").matches);var t=d?"${darkTheme}":"${lightTheme}";var e=document.querySelector("${selector}");if(e)e.setAttribute("data-theme",t);}catch(e){}})();`;
}
