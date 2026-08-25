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
  // Der Identitäts-Ton hängt am selben Skript statt an einem zweiten: er muss aus demselben Grund
  // vor der Hydration stehen (sonst blitzt die andere Farbwelt auf), und ein zweites Inline-Skript
  // wäre eine zweite Stelle, die man beim Entfernen der Farbfrage übersieht.
  //
  // Er steht VOR dem Wrapper-Vorbehalt, weil er am Wurzelelement hängt und nichts vom Wrapper
  // braucht. Heute macht das keinen Unterschied — dieses Skript rendert IM Wrapper, `e` liegt also
  // immer vor. Es ist die Reihenfolge, die stimmt, wenn der Vorbehalt einmal greift.
  //
  // Was der Ton damit NICHT erreicht: die Seiten ausserhalb beider Bereiche (Anmeldung,
  // Passwort-Reset, Info) binden dieses Skript gar nicht ein und bleiben in der rosa Fassung. Für
  // einen Vergleich der beiden Welten ist das hinnehmbar; wer den Ton behält, muss es ändern.
  return `(function(){try{var i=localStorage.getItem("${IDENT_STORAGE_KEY}");if(i&&i!=="${IDENT_DEFAULT}")document.documentElement.setAttribute("${IDENT_ATTRIBUTE}",i);var e=document.body.querySelector("${selector}");if(!e)return;var m=localStorage.getItem("${storageKey}")||"system";var d=m==="dark"||(m==="system"&&matchMedia("(prefers-color-scheme:dark)").matches);var t=d?"${darkTheme}":"${lightTheme}";document.documentElement.setAttribute("data-theme",t);e.setAttribute("data-theme",t);}catch(e){}})();`;
}
