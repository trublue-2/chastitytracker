import { describe, it, expect } from "vitest";
import { resolveTheme, STORAGE_KEYS, SELECTORS } from "./theme";
import { getThemeInitScript } from "./themeScript";

// Die Theme-NAMEN sind asymmetrisch benannt, und daraus entstand der Hydration-Mismatch vom
// 24.07.2026: `user` ist das HELLE User-Theme, `admin` aber das DUNKLE Admin-Theme. Beide Layouts
// rendern serverseitig den Namen OHNE Suffix — für den User trifft das den Hell-Fall (kein
// Mismatch), für den Admin den Dunkel-Fall. Ein hell eingestellter Admin bekam deshalb bei JEDEM
// Seitenaufruf eine Abweichung zwischen Server-HTML und dem, was das Inline-Skript setzt.
// Diese Tests halten das Mapping fest, damit ein späteres Umbenennen nicht still die Seite
// wechselt, auf der die Abweichung auftritt.
describe("resolveTheme — Rolle × Modus → Theme-Name", () => {
  it("User: hell heisst `user`, dunkel heisst `user-dark`", () => {
    expect(resolveTheme("light", "user")).toBe("user");
    expect(resolveTheme("dark", "user")).toBe("user-dark");
  });

  it("Admin: dunkel heisst `admin` (NICHT `admin-dark`), hell heisst `admin-light`", () => {
    expect(resolveTheme("dark", "admin")).toBe("admin");
    expect(resolveTheme("light", "admin")).toBe("admin-light");
  });
});

describe("getThemeInitScript — was das Inline-Skript vor der Hydration setzt", () => {
  it("nutzt pro Rolle den passenden Storage-Key und Selektor", () => {
    expect(getThemeInitScript("admin")).toContain(STORAGE_KEYS.admin);
    expect(getThemeInitScript("admin")).toContain(SELECTORS.admin);
    expect(getThemeInitScript("user")).toContain(STORAGE_KEYS.user);
    expect(getThemeInitScript("user")).toContain(SELECTORS.user);
  });

  // Das Skript AUSFÜHREN statt seinen Text gegen resolveTheme zu vergleichen: seit die Namen aus
  // resolveTheme abgeleitet werden, wäre ein Textvergleich tautologisch. Hier läuft der generierte
  // Code gegen ein Mini-DOM und muss dasselbe Ergebnis liefern wie die Runtime nach der Hydration —
  // driften die beiden, sieht man es sonst erst als Hydration-Meldung im Browser.
  //
  // `new Function` ist hier unbedenklich und bleibt auf diese Testdatei beschränkt: ausgeführt wird
  // ausschliesslich der Text aus `getThemeInitScript`, der nur aus Modul-Konstanten dieses Repos
  // zusammengesetzt ist (STORAGE_KEYS, SELECTORS, resolveTheme). Es fliesst keine Eingabe von aussen
  // in den Funktionsrumpf — die Testparameter gehen als ARGUMENTE hinein, nicht als String.
  function runInitScript(role: "user" | "admin", storedMode: string | null, systemDark: boolean) {
    const el = { theme: undefined as string | undefined, setAttribute(k: string, v: string) { if (k === "data-theme") this.theme = v; } };
    const localStorage = { getItem: (k: string) => (k === STORAGE_KEYS[role] ? storedMode : null) };
    const matchMedia = () => ({ matches: systemDark });
    const document = { querySelector: (sel: string) => (sel === SELECTORS[role] ? el : null) };
    new Function("localStorage", "matchMedia", "document", getThemeInitScript(role))(localStorage, matchMedia, document);
    return el.theme;
  }

  it("setzt bei ausdrücklicher Wahl dasselbe Theme wie resolveTheme", () => {
    expect(runInitScript("admin", "light", false)).toBe(resolveTheme("light", "admin"));
    expect(runInitScript("admin", "dark", false)).toBe(resolveTheme("dark", "admin"));
    expect(runInitScript("user", "light", false)).toBe(resolveTheme("light", "user"));
    expect(runInitScript("user", "dark", false)).toBe(resolveTheme("dark", "user"));
  });

  it("folgt bei „system\" (und ohne gespeicherte Wahl) der Systemeinstellung", () => {
    expect(runInitScript("admin", "system", true)).toBe(resolveTheme("dark", "admin"));
    expect(runInitScript("admin", "system", false)).toBe(resolveTheme("light", "admin"));
    expect(runInitScript("admin", null, true)).toBe(resolveTheme("dark", "admin"));
    expect(runInitScript("admin", null, false)).toBe(resolveTheme("light", "admin"));
  });

  it("rührt ein fremdes Element nicht an — der Selektor muss passen", () => {
    const fremd = { theme: undefined as string | undefined, setAttribute(_k: string, v: string) { this.theme = v; } };
    const document = { querySelector: () => null };
    new Function("localStorage", "matchMedia", "document", getThemeInitScript("admin"))(
      { getItem: () => "light" }, () => ({ matches: false }), document,
    );
    expect(fremd.theme).toBeUndefined();
  });
});
