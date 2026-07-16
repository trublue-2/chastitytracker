import { describe, it, expect } from "vitest";
import { upsertNoteDef } from "./notes";

// Wiring-Check: upsert_note ruft den zentralen OCC-Validate-Guard (assertVersionRequiresId,
// writeFramework) auf — die Helper-Semantik selbst ist in writeFramework.test.ts getestet.
describe("upsertNoteDef.validate — expectedVersion requires id (OCC wiring)", () => {
  it("rejects expectedVersion without id", () => {
    expect(() => upsertNoteDef.validate!({ text: "x", expectedVersion: 1 })).toThrow(/expectedVersion.*id/i);
  });

  it("accepts expectedVersion with id", () => {
    const args = { id: "n1", text: "x", expectedVersion: 2 };
    expect(upsertNoteDef.validate!(args)).toEqual(args);
  });
});
