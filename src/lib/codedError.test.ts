import { describe, it, expect } from "vitest";
import { codedError, codeOf, mapServiceError, serviceErrors } from "./codedError";

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

describe("mapServiceError", () => {
  const table = {
    NOT_LOCKED: { status: 400, error: "User ist nicht verschlossen" },
    ALREADY_ACTIVE: { status: 409, error: "Bereits aktiv" },
  };

  it("übersetzt einen bekannten Code in ein ServiceResult", () => {
    expect(mapServiceError(codedError("ALREADY_ACTIVE"), table))
      .toEqual({ ok: false, status: 409, error: "Bereits aktiv" });
  });

  it("gibt null für einen UNBEKANNTEN Code zurück, damit der Aufrufer weiterwirft", () => {
    // Sonst würde ein Tippfehler in der Tabelle einen echten Defekt still als 400 ausliefern.
    expect(mapServiceError(codedError("WAS_AUCH_IMMER"), table)).toBeNull();
  });

  it("gibt null für einen echten Defekt zurück (kein Code)", () => {
    expect(mapServiceError(new TypeError("undefined is not a function"), table)).toBeNull();
    expect(mapServiceError(null, table)).toBeNull();
  });

  it("greift nicht auf geerbte Object-Properties zu", () => {
    // `table["constructor"]` wäre ohne eigene Prüfung wahrheitswertig → falsches 200/400.
    expect(mapServiceError(codedError("constructor"), table)).toBeNull();
    expect(mapServiceError(codedError("toString"), table)).toBeNull();
  });
});

describe("serviceErrors", () => {
  const { table, fail } = serviceErrors({
    NOT_LOCKED: { status: 400, error: "User ist nicht verschlossen" },
    ALREADY_ACTIVE: { status: 409, error: "Bereits aktiv" },
  });

  it("was `fail()` wirft, findet `mapServiceError` in derselben Tabelle wieder", () => {
    expect(mapServiceError(fail("ALREADY_ACTIVE"), table))
      .toEqual({ ok: false, status: 409, error: "Bereits aktiv" });
  });

  it("ein Code ausserhalb der Tabelle ist ein Compile-Fehler", () => {
    // @ts-expect-error — nur Keys der Tabelle sind erlaubt; genau das verhindert, dass Wurf- und
    // Fang-Seite auseinanderlaufen und ein erwarteter 409 still zum 500 wird.
    expect(() => fail("GIBT_ES_NICHT")).toBeTruthy();
  });
});
