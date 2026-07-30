import { describe, it, expect, vi, afterEach } from "vitest";
import { resolveTheme, applyTheme, STORAGE_KEYS, SELECTORS } from "./theme";
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

// Das Init-Skript deckt nur den ersten Aufschlag ab; jeder spätere Wechsel läuft über applyTheme.
// Beide schreiben `<html>` — und `<html>` gehört BEIDEN Bereichen, deshalb steht hier dieselbe
// Bedingung wie im Skript.
describe("applyTheme — welche Elemente das Theme bekommen", () => {
  const fake = () => ({
    theme: undefined as string | undefined,
    getAttribute: () => null,
    setAttribute(k: string, v: string) { if (k === "data-theme") this.theme = v; },
  });

  function run(role: "user" | "admin", wrapper: ReturnType<typeof fake> | null) {
    const root = fake();
    // `readStoredMode` gibt ohne `window` pauschal "system" zurück — in der Node-Umgebung der
    // Tests muss es also existieren, damit die gespeicherte Wahl überhaupt gelesen wird.
    vi.stubGlobal("window", {});
    vi.stubGlobal("localStorage", { getItem: () => "dark" });
    vi.stubGlobal("document", { documentElement: root, body: { querySelector: () => wrapper } });
    applyTheme(role);
    return root.theme;
  }

  afterEach(() => vi.unstubAllGlobals());

  it("schreibt Wrapper UND Wurzelelement, wenn der Bereich auf dem Schirm ist", () => {
    const wrapper = fake();
    expect(run("user", wrapper)).toBe(resolveTheme("dark", "user"));
    expect(wrapper.theme).toBe(resolveTheme("dark", "user"));
  });

  // Der Fall aus der Einstellungsseite: ein Keyholder stellt unter `/dashboard/settings` das
  // ADMIN-Design ein. Ohne diesen Vorbehalt bekäme die grüne Seite, auf der er steht, das dunkle
  // Adminportal-Theme auf `<html>` — dauerhaft, denn der `ThemeApplicator` der User-Rolle
  // überhört das `theme-changed`-Ereignis der fremden Rolle.
  it("lässt das Wurzelelement in Ruhe, wenn der Wrapper der Rolle fehlt", () => {
    expect(run("admin", null)).toBeUndefined();
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
  const fakeEl = () => ({
    theme: undefined as string | undefined,
    setAttribute(k: string, v: string) { if (k === "data-theme") this.theme = v; },
  });

  function runInitScript(role: "user" | "admin", storedMode: string | null, systemDark: boolean) {
    const wrapper = fakeEl();
    const root = fakeEl();
    const localStorage = { getItem: (k: string) => (k === STORAGE_KEYS[role] ? storedMode : null) };
    const matchMedia = () => ({ matches: systemDark });
    const document = {
      documentElement: root,
      body: { querySelector: (sel: string) => (sel === SELECTORS[role] ? wrapper : null) },
    };
    new Function("localStorage", "matchMedia", "document", getThemeInitScript(role))(localStorage, matchMedia, document);
    return { wrapper: wrapper.theme, root: root.theme };
  }

  it("setzt bei ausdrücklicher Wahl dasselbe Theme wie resolveTheme", () => {
    expect(runInitScript("admin", "light", false).wrapper).toBe(resolveTheme("light", "admin"));
    expect(runInitScript("admin", "dark", false).wrapper).toBe(resolveTheme("dark", "admin"));
    expect(runInitScript("user", "light", false).wrapper).toBe(resolveTheme("light", "user"));
    expect(runInitScript("user", "dark", false).wrapper).toBe(resolveTheme("dark", "user"));
  });

  it("folgt bei „system\" (und ohne gespeicherte Wahl) der Systemeinstellung", () => {
    expect(runInitScript("admin", "system", true).wrapper).toBe(resolveTheme("dark", "admin"));
    expect(runInitScript("admin", "system", false).wrapper).toBe(resolveTheme("light", "admin"));
    expect(runInitScript("admin", null, true).wrapper).toBe(resolveTheme("dark", "admin"));
    expect(runInitScript("admin", null, false).wrapper).toBe(resolveTheme("light", "admin"));
  });

  // `<html>` ist die Quelle für alles, was per Portal an `document.body` hängt (Toasts,
  // Vollbild-Bilder): dort endet die Vererbung sonst bei `:root`, und `:root` IST das helle
  // User-Theme. Bleibt das Wurzelelement ungesetzt, sind solche Overlays im Dunkeln wieder hell.
  it("setzt dasselbe Theme auch auf das Wurzelelement", () => {
    expect(runInitScript("admin", "dark", false).root).toBe(resolveTheme("dark", "admin"));
    expect(runInitScript("user", "dark", false).root).toBe(resolveTheme("dark", "user"));
    expect(runInitScript("user", "light", false).root).toBe(resolveTheme("light", "user"));
  });

  // Ohne passenden Wrapper bleibt AUCH das Wurzelelement unangetastet. `<html>` ist zwischen den
  // Bereichen geteilt: die Einstellungsseite schaltet beide Designs um, ein Keyholder stellt unter
  // `/dashboard/settings` also das Admin-Theme ein, ohne im Adminportal zu stehen. Würde dabei das
  // Wurzelelement beschrieben, färbte sich die Seite um, auf der er gerade ist.
  it("rührt nichts an, wenn der Wrapper der Rolle fehlt", () => {
    const foreign = fakeEl();
    const root = fakeEl();
    const document = { documentElement: root, body: { querySelector: () => null } };
    new Function("localStorage", "matchMedia", "document", getThemeInitScript("admin"))(
      { getItem: () => "light" }, () => ({ matches: false }), document,
    );
    expect(foreign.theme).toBeUndefined();
    expect(root.theme).toBeUndefined();
  });
});
