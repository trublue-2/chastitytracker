import { describe, it, expect } from "vitest";
import { expectImportFree } from "@/test/importFree";
import { codedError, codeOf } from "./codedError";

// Die Kette `constants.ts` → `entryErrors.ts` → hier ist aus Client-Komponenten erreichbar —
// Begründung in `expectImportFree`.
describe("codedError.ts bleibt importfrei", () => {
  it("enthält keine import-/require-Anweisung", () => {
    expectImportFree("src/lib/codedError.ts");
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
