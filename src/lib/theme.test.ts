import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
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

// `ActionModal` portiert in den nächstgelegenen `[data-theme]`-Wrapper. Trägt ein Wrapper eine
// Eigenschaft, die Containing-Block für `position: fixed` erzeugt, klebt jedes Modal darin am
// Wrapper statt am Fenster — lautlos, ohne Typ- oder Testfehler. Die Regel steht bei
// `THEME_WRAPPER_SELECTOR`; hier wird sie geprüft statt nur behauptet (wie `expectImportFree`).
//
// Der unauffällige Fall ist Tailwinds `@container` (= `container-type: inline-size`): eine
// Utility-Klasse, die auf einer Layout-Wurzel völlig harmlos aussieht.
/** Selektor-Liste und Deklarationen jedes Regelblocks, der ein Theme setzt (`:root` eingeschlossen).
 *  Kommentare fallen vorher weg, damit ein `--token` in einer Erklärung nicht mitzählt. */
function themeBlocks(): { selektoren: string[]; deklarationen: string[] }[] {
  const css = readFileSync("src/app/globals.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const blocks: { selektoren: string[]; deklarationen: string[] }[] = [];
  for (const [, sel, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    // Vor dem Selektor kann noch eine At-Regel oder das Ende des Vorgänger-Blocks stehen
    // (`@import "tailwindcss";` gleich am Dateianfang). Alles bis zum letzten `;` wegschneiden,
    // sonst heisst der erste Selektor `@import …;\n:root` und trifft keinen Vergleich.
    const selektoren = sel
      .split(",")
      .map((x) => x.slice(x.lastIndexOf(";") + 1).trim())
      .filter(Boolean);
    if (!selektoren.some((x) => x === ":root" || x.startsWith("[data-theme"))) continue;
    blocks.push({
      selektoren,
      deklarationen: body.split(";").map((d) => d.trim()).filter(Boolean),
    });
  }
  return blocks;
}

describe("Theme-Wrapper bleiben Containing-Block-frei", () => {
  // Das Wrapper-Tag wird als Ganzes geprüft, Klassen-Utilities wie Inline-Styles. Beide
  // Schreibweisen müssen also drinstehen: `will-change` (Klasse) UND `willChange` (Style-Objekt).
  const OFFENDERS = new RegExp([
    "@container", "container-type", "content-visibility",
    "backdrop-blur", "drop-shadow", "\\bblur-", "\\bgrayscale\\b", "\\bsepia\\b", "\\binvert\\b",
    "\\bsaturate-", "\\bhue-rotate", "\\btransform\\b", "\\bperspective", "\\btranslate-",
    "\\brotate-", "\\bscale-", "\\bcontain-", "\\bwill-change",
    // `contrast-more:`/`contrast-less:` sind prefers-contrast-VARIANTEN und setzen keinen Filter —
    // nur die Filter-Utility (`contrast-50`, `contrast-[…]`) zählt.
    "\\bcontrast-(?:\\d|\\[)",
    // Inline-Styles: camelCase, mit Doppelpunkt.
    "\\b(?:filter|contain|willChange|backdropFilter|containerType|contentVisibility)\\s*:",
  ].join("|"));

  /** Kommentare weg, sonst zählt eine Erwähnung wie `admin/layout.tsx:28` als Wrapper mit. */
  function stripComments(src: string): string {
    return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  }

  // Kein Hardcode-Verzeichnis: ein NEUER Wrapper in einer neuen Datei wäre sonst still ungeprüft —
  // genau das Loch, das dieser Test stopfen soll.
  const WRAPPER_FILES: string[] = readdirSync("src", { recursive: true, encoding: "utf8" })
    .filter((f: string) => f.endsWith(".tsx"))
    .map((f: string) => `src/${f}`)
    .filter((f: string) => stripComments(readFileSync(f, "utf8")).includes("data-theme="))
    .sort();

  it("findet die bekannten Wrapper-Dateien", () => {
    // Untergrenze statt exakter Zahl: neue Wrapper sind erlaubt, eine kaputte Suche (0 Dateien,
    // Suite trotzdem grün) nicht. Fällt ein Wrapper planmässig weg, gehört die Zahl mit ihm
    // gesenkt — der Test gated das Deploy, die Meldung muss also sagen, was zu tun ist.
    expect(WRAPPER_FILES.length, `nur ${WRAPPER_FILES.length} Wrapper-Dateien gefunden — Suche kaputt, oder ein Wrapper ist planmässig entfallen (dann diese Zahl senken)`)
      .toBeGreaterThanOrEqual(7);
  });

  it.each(WRAPPER_FILES)("%s", (file) => {
    const src = stripComments(readFileSync(file, "utf8"));
    const tags = src.match(/<[a-zA-Z][^>]*\sdata-theme=[^>]*>/g) ?? [];

    // Schutz gegen falsches Grün: erwischt die Tag-Regex ein `data-theme=` NICHT, prüft der Test
    // einen Wrapper stillschweigend nicht mehr und bleibt trotzdem grün. Darum muss die Zahl der
    // gefundenen Tags der Zahl der Vorkommen entsprechen. (Mehrzeilige Tags sind kein Problem —
    // `[^>]` schliesst Zeilenumbrüche ein; per Mutationsprobe bestätigt.)
    expect(tags.length, `data-theme= in ${file} nicht als Tag erkannt — Test erweitern`)
      .toBe((src.match(/data-theme=/g) ?? []).length);

    for (const tag of tags) {
      // `[^>]*` endet am ERSTEN `>` — in JSX ist das oft nicht das Tag-Ende, sondern ein `=>` im
      // Handler oder ein Vergleich im Ausdruck. Das Tag wäre dann abgeschnitten, die Zählung oben
      // bliebe heil, und alles hinter dem Schnitt ungeprüft. Ein abgeschnittenes Tag hat immer
      // unbalancierte Klammern.
      expect(tag.split("{").length, `Tag in ${file} abgeschnitten (">" in einem JSX-Ausdruck)`)
        .toBe(tag.split("}").length);
      expect(tag).not.toMatch(OFFENDERS);
    }
  });

  // Grösster Radius: eine einzige Deklaration in einem `[data-theme…]`-Block trifft ALLE Wrapper
  // gleichzeitig, und kein Wrapper-Tag sähe verdächtig aus. Die Blöcke tragen deshalb
  // ausschliesslich Custom Properties.
  it("die [data-theme]-Blöcke in globals.css setzen nur Custom Properties", () => {
    const blocks = themeBlocks().filter((b) =>
      b.selektoren.some((x) => x.startsWith("[data-theme")),
    );
    // Vier Themes plus zwei geteilte Blöcke für die DeviceCategory-Palette — je einer für die
    // beiden hellen und die beiden dunklen Fassungen. Die Kategorie-Farbe ist eine andere Achse
    // als die drei Bedeutungsfarben und wird deshalb getrennt gehalten.
    expect(blocks.length).toBe(6);

    for (const { deklarationen } of blocks)
      for (const d of deklarationen) expect(d.startsWith("--")).toBe(true);
  });

  // Der Fall, der das hier ausgelöst hat: die dunkle DeviceCategory-Palette stand nur im
  // `admin`-Block. `user-dark` erbte deshalb die HELLEN Werte und zeigte im Träger-Dunkelmodus
  // helle Chips auf dunklem Grund — in zehn Komponenten, und niemandem fiel es auf.
  //
  // Die Prüfung richtet sich NUR an die dunklen Themes, und das ist kein Versehen: der Block
  // `:root, [data-theme="user"]` IST das helle Träger-Theme. Ein helles Theme darf von dort
  // erben, ein dunkles nie — was es nicht selbst setzt, bekommt es hell.
  //
  // Grundmenge ist bewusst dieser Block und nicht jedes `:root`: die übrigen `:root`-Blöcke
  // tragen Abstände, Dauern und Kurven, die für alle Themes gleich gelten sollen.
  it("jedes Farbtoken des hellen Themes ist in BEIDEN dunklen gesetzt", () => {
    const gesetzt = (name: string) =>
      new Set(
        themeBlocks()
          .filter((b) => b.selektoren.includes(name))
          .flatMap((b) => b.deklarationen.map((d) => d.split(":")[0].trim())),
      );

    const hell = gesetzt('[data-theme="user"]');
    expect(hell.size).toBeGreaterThan(100);

    for (const dunkel of ['[data-theme="admin"]', '[data-theme="user-dark"]']) {
      const fehlend = [...hell].filter((t) => !gesetzt(dunkel).has(t)).sort();
      expect(fehlend, `${dunkel} erbt diese Tokens hell aus :root`).toEqual([]);
    }
  });
});
