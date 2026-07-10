import { describe, it, expect } from "vitest";
import { codedError } from "./codedError";
import { mapServiceError, serviceErrors } from "./serviceResult";

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
