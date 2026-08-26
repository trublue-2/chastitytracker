import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { subWorld, keyholderWorld, WORLDS, DEFAULT_WORLD } from "./theme";

/**
 * Die drei Welten und ihre Blöcke.
 *
 * Bis v6 stand hier die Auflösung eines UMSCHALTERS: Rolle × Modus → Theme-Name, dazu ein
 * Inline-Skript, das den gespeicherten Wert vor der Hydration ans Dokument schrieb. Die Tests
 * hielten vor allem eine Asymmetrie fest — `user` war das HELLE Träger-Theme, `admin` das DUNKLE
 * Keyholder-Theme —, und aus genau dieser Asymmetrie kam der Hydration-Mismatch vom 24.07.2026.
 *
 * Beides gibt es nicht mehr: die Welt ist eine Ableitung aus dem Verschluss-Zustand, alle drei
 * sind dunkel, und der Server kennt sie beim Rendern. Was bleibt, ist die Frage, die auch damals
 * die wichtigere war — führen alle Welten dieselben Tokens?
 *
 * `WORLDS` kommt aus dem Modul und steht NICHT hier noch einmal: eine abgeschriebene Liste liefe an
 * einer vierten Welt vorbei, ohne rot zu werden — der Union-Typ merkt nichts, weil eine Teilmenge
 * zuweisbar bleibt. Genau die Lücke, gegen die diese Datei geschrieben ist.
 */


describe("Die Welt folgt dem Zustand", () => {
  it("verschlossen ist grün, offen ist rosa", () => {
    expect(subWorld(true)).toBe("sub-locked");
    expect(subWorld(false)).toBe("sub-open");
  });

  it("der Keyholder-Bereich hat immer dieselbe Welt", () => {
    expect(keyholderWorld()).toBe("keyholder");
  });

  /**
   * Der Generator und der Typ müssen dieselben Welten kennen.
   *
   * `docs/design/tokens.mjs` erzeugt die Blöcke, `World` benennt sie im Code — und niemand hält die
   * beiden zusammen. Eine vierte Welt im Generator, die niemand in `World` nachträgt, fiele heute
   * nur auf, wenn jemand `--write` laufen liesse und die Blatt-Prüfung darunter griffe. Ein Blatt
   * ohne frischen Lauf verschweigt sie.
   */
  it("der Generator kennt genau diese Welten", () => {
    const src = readFileSync("docs/design/tokens.mjs", "utf8");
    const tabelle = src.slice(src.indexOf("const WELTEN = {"), src.indexOf("\n}", src.indexOf("const WELTEN = {")));
    const namen = [...tabelle.matchAll(/^\s*'([a-z-]+)':/gm)].map((m) => m[1]).sort();
    expect(namen, "WELTEN in tokens.mjs und WORLDS in theme.ts laufen auseinander")
      .toEqual([...WORLDS].sort());
  });

  /**
   * `:root` MUSS die Vorgabewelt mitführen.
   *
   * Die Zeile `:root,` vor `[data-theme="sub-open"] {` steht von Hand im Blatt — der Generator
   * ersetzt nur den Rumpf dahinter und schreibt den Kopf nie. Fällt sie weg, bleibt alles grün:
   * `tsc`, der Build und jede andere Prüfung hier sehen ausschliesslich `[data-theme="…"]`.
   *
   * Sichtbar würde es an den Rändern — Anmeldung, `/info`, `/oauth/authorize`, die Startseite und
   * jedes Portal-Overlay im Moment vor dem `ThemeRootSync`-Effekt. Die fielen dann auf
   * Tailwind-Vorgaben zurück: `body { background: var(--background) }` wird durchsichtig,
   * `text-foreground` bleibt ungesetzt.
   */
  it(":root trägt dieselben Tokens wie die Vorgabewelt", () => {
    const gesetzt = (selektor: string) =>
      new Set(
        themeBlocks()
          .filter((b) => b.selektoren.includes(selektor))
          .flatMap((b) => b.deklarationen.map((d) => d.split(":")[0].trim())),
      );
    const vorgabe = gesetzt(`[data-theme="${DEFAULT_WORLD}"]`);
    const wurzel = gesetzt(":root");
    expect(vorgabe.size).toBeGreaterThan(100);
    const fehlend = [...vorgabe].filter((t) => !wurzel.has(t)).sort();
    expect(fehlend, `:root führt die Welt ${DEFAULT_WORLD} nicht mehr mit — die Ränder der App (Anmeldung, /info) verlieren damit ihre Farben`)
      .toEqual([]);
  });

  it("jede Welt hat einen Block im Blatt", () => {
    const css = readFileSync("src/app/globals.css", "utf8");
    for (const w of WORLDS) {
      expect(css, `[data-theme="${w}"] fehlt in globals.css`).toContain(`[data-theme="${w}"] {`);
    }
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
      // 7 → 5: die drei Auth-Seiten setzten `data-theme` je einzeln und teilen sich seit #84 die
      // Hülle `AuthScreen`, die es einmal setzt.
      // 5 → 4: die Bauteil-Schau hatte zwei Raster, ein Server- und ein Client-Bauteil, mit
      // demselben Div; sie teilen sich jetzt `WorldGrid`, und nur die eine Datei setzt noch das
      // Attribut. Beides genau der Fall, den der Meldungstext oben meint — ein Wrapper ist
      // planmässig entfallen, also sinkt die Zahl mit.
      .toBeGreaterThanOrEqual(4);
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
    // Drei Welten plus EIN geteilter Block für die DeviceCategory-Palette. Es waren sechs, solange
    // es vier Themes gab und die Kategorie-Palette in einer hellen und einer dunklen Fassung
    // danebenstand; mit dem hellen Modus ist die helle Fassung entfallen. Die Kategorie-Farbe
    // bleibt eine andere Achse als die drei Bedeutungsfarben und deshalb ein eigener Block.
    expect(blocks.length).toBe(4);

    for (const { deklarationen } of blocks)
      for (const d of deklarationen) expect(d.startsWith("--")).toBe(true);
  });

  /**
   * Jede Welt führt dieselbe Token-MENGE.
   *
   * Der Fall, der das hier ausgelöst hat: die dunkle DeviceCategory-Palette stand nur im
   * Keyholder-Block. Der Träger-Dunkelmodus erbte deshalb die HELLEN Werte aus `:root` und zeigte
   * helle Chips auf dunklem Grund — in zehn Komponenten, und niemandem fiel es auf.
   *
   * Früher lief die Prüfung hell → dunkel, weil `:root` das helle Träger-Theme WAR und ein dunkles
   * Theme von dort nichts erben durfte. Jetzt ist `:root` die Welt `sub-open`, und die Frage ist
   * eine allgemeinere: keine Welt darf ein Token führen, das einer anderen fehlt. Ein Token, das
   * nur in zweien steht, fällt in der dritten auf `:root` zurück — also auf die Farben von
   * `sub-open`, und das sieht in `sub-locked` grün-neben-rosa aus statt kaputt.
   */
  it("alle Welten führen dieselben Tokens", () => {
    const gesetzt = (selektor: string) =>
      new Set(
        themeBlocks()
          .filter((b) => b.selektoren.includes(selektor))
          .flatMap((b) => b.deklarationen.map((d) => d.split(":")[0].trim())),
      );

    const mengen = new Map(WORLDS.map((w) => [w, gesetzt(`[data-theme="${w}"]`)]));
    const alle = new Set([...mengen.values()].flatMap((m) => [...m]));
    expect(alle.size).toBeGreaterThan(100);

    for (const [welt, tokens] of mengen) {
      const fehlend = [...alle].filter((t) => !tokens.has(t)).sort();
      expect(fehlend, `${welt} führt diese Tokens nicht und erbt sie aus :root`).toEqual([]);
    }
  });
});
