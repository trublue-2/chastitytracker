import { describe, it, expect } from "vitest";
import { codedError } from "./codedError";
import { mapServiceError, serviceErrors, serviceFail } from "./serviceResult";

// Die Tabellen-Werte sind stabile Fehler-CODES, keine Sätze — `ServiceErrorTable` typt sie als
// `ServiceErrorCode`. Eine deutsche Prosa hier wäre ein Compile-Fehler; genau das hält die beiden
// Fehler-Kontrakte auseinander (siehe serviceErrorCodes.ts).
const TABLE = {
  NOT_LOCKED: { status: 400, error: "USER_NOT_LOCKED" },
  ALREADY_ACTIVE: { status: 409, error: "INSPECTION_ALREADY_ACTIVE" },
} as const;

describe("mapServiceError", () => {
  it("übersetzt einen bekannten Code in ein ServiceResult", () => {
    expect(mapServiceError(codedError("ALREADY_ACTIVE"), TABLE))
      .toEqual({ ok: false, status: 409, error: "INSPECTION_ALREADY_ACTIVE" });
  });

  it("gibt null für einen UNBEKANNTEN Code zurück, damit der Aufrufer weiterwirft", () => {
    // Sonst würde ein Tippfehler in der Tabelle einen echten Defekt still als 400 ausliefern.
    expect(mapServiceError(codedError("WAS_AUCH_IMMER"), TABLE)).toBeNull();
  });

  it("gibt null für einen echten Defekt zurück (kein Code)", () => {
    expect(mapServiceError(new TypeError("undefined is not a function"), TABLE)).toBeNull();
    expect(mapServiceError(null, TABLE)).toBeNull();
  });

  it("greift nicht auf geerbte Object-Properties zu", () => {
    // `table["constructor"]` wäre ohne eigene Prüfung wahrheitswertig → falsches 200/400.
    expect(mapServiceError(codedError("constructor"), TABLE)).toBeNull();
    expect(mapServiceError(codedError("toString"), TABLE)).toBeNull();
  });
});

describe("serviceErrors", () => {
  const { table, fail } = serviceErrors(TABLE);

  it("was `fail()` wirft, findet `mapServiceError` in derselben Tabelle wieder", () => {
    expect(mapServiceError(fail("ALREADY_ACTIVE"), table))
      .toEqual({ ok: false, status: 409, error: "INSPECTION_ALREADY_ACTIVE" });
  });

  it("ein Code ausserhalb der Tabelle ist ein Compile-Fehler", () => {
    // @ts-expect-error — nur Keys der Tabelle sind erlaubt; genau das verhindert, dass Wurf- und
    // Fang-Seite auseinanderlaufen und ein erwarteter 409 still zum 500 wird.
    expect(() => fail("GIBT_ES_NICHT")).toBeTruthy();
  });
});

describe("serviceFail", () => {
  it("baut ein Failure-Result mit Status und Code", () => {
    expect(serviceFail(404, "GOAL_NOT_FOUND")).toEqual({ ok: false, status: 404, error: "GOAL_NOT_FOUND" });
  });

  it("ein undeklarierter Code ist ein Compile-Fehler", () => {
    // Das ist der Kern der Migration: eine deutsche Prosa (oder ein Tippfehler) kann gar nicht mehr
    // als `ServiceResult.error` herauskommen und im Client still zur generischen Meldung zerfallen.
    // @ts-expect-error — nur Codes aus serviceErrorCodes.ts sind erlaubt.
    expect(() => serviceFail(400, "User ist nicht verschlossen")).toBeTruthy();
  });
});
