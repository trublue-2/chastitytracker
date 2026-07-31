/**
 * Shared theme primitives used by ThemeApplicator, useTheme, and themeScript.
 * No "use client" — safe for both server and client imports.
 */

export type ThemeMode = "light" | "dark" | "system";
export type ThemeName = "user" | "user-dark" | "admin" | "admin-light";
export type ThemeRole = "user" | "admin";

/** Alle Rollen, um die Rollen-Tabellen abzuleiten statt sie je Modul abzuschreiben. */
export const THEME_ROLES: readonly ThemeRole[] = ["user", "admin"];

export const STORAGE_KEYS: Record<ThemeRole, string> = {
  user: "theme-user",
  admin: "theme-admin",
};

export const SELECTORS: Record<ThemeRole, string> = {
  admin: "#admin-root",
  user: "[data-theme^='user']",
};

/**
 * Erkennungsmerkmal eines Theme-Wrappers, rollenunabhängig — für Code, der den NÄCHSTGELEGENEN
 * Wrapper sucht statt den einer bestimmten Rolle (`ActionModal` portiert dorthin). Steht bewusst
 * neben `SELECTORS`: wer die Markierung der Wrapper ändert, muss beide Seiten sehen.
 *
 * WEIL dorthin portiert wird, muss ein Wrapper ein schlichtes Div BLEIBEN — er UND jeder seiner
 * Vorfahren. Sobald einer transform-artig wirkt (`transform`, `translate`, `rotate`, `scale`,
 * `perspective`, `filter`, `backdrop-filter`) oder Layout-/Paint-Containment auslöst (`contain`
 * mit `layout`/`paint`/`content`/`strict`, `container-type`, `content-visibility`), wird er
 * Containing-Block für `position: fixed` und fesselt jedes Modal darin an sich statt ans Fenster.
 * `will-change` zählt mit, wenn es eine dieser Eigenschaften nennt. Der unauffällige Weg dahin ist
 * Tailwind: `@container` IST `container-type: inline-size`, und die Utility ist bereits im Einsatz.
 *
 * `theme.test.ts` prüft das für alle Wrapper-Tags und die `[data-theme]`-Blöcke in `globals.css` —
 * geprüft statt nur behauptet, wie bei `expectImportFree`. Nicht sehen kann der Test Vorfahren und
 * CSS, das einen Wrapper über einen anderen Selektor trifft (Klasse, `#admin-root`).
 */
export const THEME_WRAPPER_SELECTOR = "[data-theme]";

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

function writeTheme(el: Element | null, theme: ThemeName): void {
  if (el && el.getAttribute("data-theme") !== theme) {
    el.setAttribute("data-theme", theme);
  }
}

/**
 * Schreibt das aufgelöste Theme an ZWEI Stellen — beide werden gebraucht:
 *
 * `<html>` ist die breite Quelle. Alles, was per Portal an `document.body` hängt (Toasts,
 * Vollbild-Bilder), steht ausserhalb des Bereichs-Wrappers und erbt sonst `:root` — und `:root`
 * IST das helle User-Theme (globals.css). Solche Overlays waren deshalb im Dunkel-Modus hell,
 * ebenso der Gummiband-Streifen beim Überscrollen (`body { background: var(--background) }`).
 *
 * Der Wrapper behält seinen eigenen Wert trotzdem: er ist der serverseitige Vorabwert (kein
 * Aufblitzen, bevor das Init-Skript läuft) und die Vererbungsquelle für alles, was bewusst IN ihm
 * rendert — die Komponenten-Schau stellt beide Themes nebeneinander.
 *
 * Fehlt der Wrapper, passiert NICHTS. Die Einstellungsseite schaltet beide Bereiche um (ein
 * Keyholder stellt unter `/dashboard/settings` auch das Admin-Design ein), ruft also `applyTheme`
 * für eine Rolle auf, deren Bereich gar nicht auf dem Schirm ist. Solange nur der Wrapper
 * beschrieben wurde, war das ein folgenloser Leerlauf; `<html>` ist geteilt und würde dabei die
 * Seite umfärben, auf der man steht — und zwar dauerhaft, denn der `ThemeApplicator` der anderen
 * Rolle überhört das `theme-changed`-Ereignis.
 */
export function applyTheme(role: ThemeRole): void {
  // `body.querySelector` statt `document.querySelector`: seit `<html>` das Attribut ebenfalls
  // trägt, fände `SELECTORS.user` ("[data-theme^='user']") sonst das Wurzelelement zuerst — der
  // Wrapper bliebe unangetastet und die Schau-Spalten hingen am falschen Theme.
  const wrapper = document.body.querySelector(SELECTORS[role]);
  if (!wrapper) return;

  const theme = resolveTheme(readStoredMode(role), role);
  writeTheme(document.documentElement, theme);
  writeTheme(wrapper, theme);
}
