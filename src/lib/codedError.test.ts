import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { codedError, codeOf } from "./codedError";

// Die Importfreiheit ist eine Bundle-Zusicherung, kein Stil: `constants.ts` → `entryErrors.ts` →
// hier, und `constants.ts` ist aus Client-Komponenten erreichbar. Ein einziger Server-Import
// (`next/server`, `prisma`) zöge den Server-Code ins Client-Bundle — ohne Typfehler, ohne Testrot.
// Darum wird die Eigenschaft geprüft statt nur im Header behauptet.
describe("codedError.ts bleibt importfrei", () => {
  it("enthält keine import-/require-Anweisung", () => {
    const source = readFileSync("src/lib/codedError.ts", "utf8");
    const imports = source.match(/^\s*import\s|[^.\w]require\s*\(/gm) ?? [];
    expect(imports).toEqual([]);
  });
});

describe("codedError / codeOf", () => {
  it("taggt den Fehler und nutzt den Code auch als Message (Stacktrace-Lesbarkeit)", () => {
    const e = codedError("NOT_LOCKED");
    expect(e).toBeInstanceOf(Error);
    expect(e.message).toBe("NOT_LOCKED");
    expect(codeOf(e)).toBe("NOT_LOCKED");
  });

  it("der Tag ist eine EIGENE Property, nicht geerbt", () => {
    // Darauf beruht, dass ein `_code` auch von einem fremden Modul gelesen werden kann
    // (inspectionEscalationService fängt das NOT_LOCKED aus oeffnenService) — ein Property-Tag
    // ist dafür robuster als `instanceof` auf einer Klasse, die doppelt geladen sein könnte.
    expect(Object.hasOwn(codedError("TIME_BEFORE"), "_code")).toBe(true);
  });

  it("erkennt fremde Fehler und Nicht-Fehler nicht als codiert", () => {
    expect(codeOf(new Error("boom"))).toBeUndefined();
    expect(codeOf(null)).toBeUndefined();
    expect(codeOf(undefined)).toBeUndefined();
    expect(codeOf("NOT_LOCKED")).toBeUndefined(); // ein blosser String ist kein codierter Fehler
  });
});
