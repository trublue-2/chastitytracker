import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { KEYHOLDER_TEMPLATE } from "./keyholderTemplate";
import { NOTE_TYPES } from "./notes";

/** Die Vorlage nennt Tool-Namen und Note-Typen im Klartext. Wird ein Tool umbenannt, fällt das
 *  sonst erst beim Keyholder auf: der Agent bekommt ein Regelwerk, das ein nicht mehr existierendes
 *  Tool vorschreibt — kein Compile-Fehler, kein Testfehler, nur ein toter Aufruf im Chat.
 *  Die Registry wird aus dem Quelltext gelesen; sie zu importieren würde den ganzen MCP-Handler
 *  (inkl. Prisma) hochziehen. */
const ROUTE_URL = new URL("../../app/api/[transport]/route.ts", import.meta.url);

/** Alle `server.registerTool("name"` der Route. */
function registeredTools(): Set<string> {
  const src = readFileSync(ROUTE_URL, "utf8");
  return new Set([...src.matchAll(/registerTool\(\s*"([a-z0-9_]+)"/g)].map((m) => m[1]));
}

/** Note-Typen, die die Vorlage der Wissensschicht vorschreibt — beide Richtungen geprüft:
 *  fällt einer aus NOTE_TYPES, schlägt der Test an; streicht ihn jemand aus der Vorlage, auch. */
const USED_NOTE_TYPES = ["OBSERVATION", "DIRECTIVE", "BOUNDARY"] as const;

/** snake_case-Tokens der Vorlage — im Fliesstext kommen Unterstriche nur in Tool-Namen vor. */
function snakeTokens(text: string): string[] {
  return [...new Set(text.match(/\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/g) ?? [])];
}

describe("KEYHOLDER_TEMPLATE", () => {
  const tools = registeredTools();

  it("liest die Tool-Registry überhaupt aus", () => {
    expect(tools.size).toBeGreaterThan(20);
    expect(tools).toContain("keyholder_dashboard");
  });

  for (const [locale, template] of Object.entries(KEYHOLDER_TEMPLATE)) {
    it(`[${locale}] nennt nur registrierte Tools`, () => {
      const tokens = snakeTokens(template);
      expect(tokens.length).toBeGreaterThan(10);
      expect(tokens.filter((t) => !tools.has(t))).toEqual([]);
    });

    it(`[${locale}] nennt die Note-Typen der Wissensschicht, und die gibt es`, () => {
      for (const type of USED_NOTE_TYPES) {
        expect(NOTE_TYPES).toContain(type);
        expect(template).toContain(type);
      }
    });
  }
});
