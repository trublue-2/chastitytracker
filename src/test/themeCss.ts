import { readFileSync } from "node:fs";

/**
 * TEST-ONLY — die Theme-Blöcke von `src/app/globals.css`, geteilt von `theme.test.ts` und
 * `nativeParity.test.ts` (die nativen Sperrbildschirme gegen das Blatt). EIN Parser, damit beide
 * Prüfungen dieselben Regeln lesen: Kommentare fallen weg, Selektor-Listen werden getrennt.
 */
/** Selektor-Liste und Deklarationen jedes Regelblocks, der ein Theme setzt (`:root` eingeschlossen).
 *  Kommentare fallen vorher weg, damit ein `--token` in einer Erklärung nicht mitzählt. */
export function themeBlocks(): { selektoren: string[]; deklarationen: string[] }[] {
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

/** Der Wert einer Variable (`--background`) in dem Block, der genau `[data-theme="<world>"]` setzt. */
export function themeToken(world: string, variable: string): string | undefined {
  const block = themeBlocks().find((b) => b.selektoren.includes(`[data-theme="${world}"]`)
    && b.deklarationen.some((d) => d.startsWith(`${variable}:`)));
  return block?.deklarationen.find((d) => d.startsWith(`${variable}:`))?.slice(variable.length + 1).trim();
}
