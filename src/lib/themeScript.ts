/**
 * Server-safe FOUC-prevention script generator.
 * Generates an inline IIFE that runs before React hydration.
 * Uses constants from theme.ts but must embed them as string literals
 * since the script runs outside the module system.
 */

import { STORAGE_KEYS, SELECTORS, resolveTheme, THEME_ROLES, type ThemeRole } from "@/lib/theme";
import { IDENT_ATTRIBUTE, IDENT_DEFAULT, IDENT_STORAGE_KEY } from "@/lib/ident";

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

  // Setzt dieselben zwei Ziele unter derselben Bedingung wie `applyTheme` — Begründung dort.
  // Reihenfolge, Selektor-Wahl (`body.querySelector`) und der Wrapper-Vorbehalt müssen mitwandern,
  // wenn sich das drüben ändert; hier liegt der Wrapper zwar immer vor (dieses Skript steht IN
  // ihm), aber zwei Regeln für dieselbe Sache driften sonst irgendwann auseinander.
  return `(function(){try{var e=document.body.querySelector("${selector}");if(!e)return;var m=localStorage.getItem("${storageKey}")||"system";var d=m==="dark"||(m==="system"&&matchMedia("(prefers-color-scheme:dark)").matches);var t=d?"${darkTheme}":"${lightTheme}";document.documentElement.setAttribute("data-theme",t);e.setAttribute("data-theme",t);}catch(e){}})();`;
}

/**
 * Die Farbwelt — ein eigenes Skript, im WURZEL-Layout statt in den Bereichs-Layouts.
 *
 * Sie hing zuerst am Theme-Skript oben, und das kostete die Ränder: Anmeldung, Passwort-Reset und
 * die Info-Seite binden jenes Skript gar nicht ein (es rendert im Bereichs-Wrapper, den es dort
 * nicht gibt) — mit „Grün" eingestellt blieben ausgerechnet die ersten Bildschirme rosa.
 *
 * Getrennt und nicht einfach hochgezogen, weil die beiden verschiedene Bedingungen haben: das
 * Theme braucht den Wrapper (es beschreibt ihn mit), die Farbwelt nicht — sie hängt nur an
 * `<html>`. Ein Skript, das beides täte, müsste den Wrapper-Vorbehalt für die eine Hälfte
 * durchbrechen.
 *
 * Vor der Hydration, aus demselben Grund wie das Theme: sonst blitzt die andere Welt auf.
 */
export function getIdentInitScript() {
  return `(function(){try{var i=localStorage.getItem("${IDENT_STORAGE_KEY}");if(i&&i!=="${IDENT_DEFAULT}")document.documentElement.setAttribute("${IDENT_ATTRIBUTE}",i);}catch(e){}})();`;
}
