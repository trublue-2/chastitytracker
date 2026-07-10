import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { codedError } from "./codedError";
import { ENTRY_ERROR_CODES, entryGuardError, entryGuardCode } from "./entryErrors";
import de from "../../messages/de.json";
import en from "../../messages/en.json";

const LOCALES = [["de", de], ["en", en]] as const;

/** Die Entry-Routen, die stabile Codes als `{ error: "CODE" }` beantworten. */
const ENTRY_ROUTES = [
  "src/app/api/entries/route.ts",
  "src/app/api/entries/[id]/route.ts",
  "src/app/api/admin/entries/route.ts",
];

// Ein Entry-Fehler-Code ohne Key im `errors`-Namespace fällt in useApiError() still auf die
// generische Meldung zurück — kein Typfehler, kein Laufzeitfehler. Diese Tests sind die einzige
// Absicherung gegen Tippfehler und vergessene Übersetzungen.
describe("entry error codes have translations", () => {
  it.each(LOCALES)("%s.json defines every entry error code", (_locale, messages) => {
    const errors: Record<string, string> = messages.errors;
    const missing = ENTRY_ERROR_CODES.filter((code) => !errors[code]);
    expect(missing).toEqual([]);
  });
});

/** Die als `{ error: "CODE" }` ausgeschriebenen Literale einer Route. `{ error: entryGuardCode(e) }`
 *  und `{ error: validationError }` fehlen hier bewusst — die sind über EntryGuardCode /
 *  EntryValidationCode schon typgeprüft. */
function emittedCodes(route: string): string[] {
  const source = readFileSync(route, "utf8");
  return [...source.matchAll(/error:\s*"([A-Z][A-Z0-9_]*)"/g)].map((m) => m[1]);
}

// Die Gegenrichtung: Codes ⊆ Übersetzungen allein genügt nicht — eine Route könnte einen Code
// zurückgeben, den niemand deklariert hat. Der bliebe unübersetzt, ohne dass ein Test anschlägt.
describe("entry routes only answer with declared codes", () => {
  it("the match pattern actually finds code literals", () => {
    // Ohne diese Zusicherung würde ein kaputtes Muster alle Routen still durchwinken.
    expect(ENTRY_ROUTES.flatMap(emittedCodes).length).toBeGreaterThan(0);
  });

  it.each(ENTRY_ROUTES)("%s emits no undeclared error code", (route) => {
    const undeclared = emittedCodes(route).filter((code) => !ENTRY_ERROR_CODES.includes(code));
    expect(undeclared).toEqual([]);
  });
});

describe("entryGuardCode", () => {
  it("unwraps a code raised by entryGuardError", () => {
    expect(entryGuardCode(entryGuardError("ALREADY_LOCKED"))).toBe("ALREADY_LOCKED");
  });

  it("rethrows an unrelated error instead of masking it as a 400", () => {
    const boom = new Error("db connection lost");
    expect(() => entryGuardCode(boom)).toThrow(boom);
  });

  it("rethrows an error carrying an unknown _code", () => {
    const other = codedError("PARTNER_GONE");
    expect(() => entryGuardCode(other)).toThrow(other);
  });
});
