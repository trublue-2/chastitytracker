import { describe, it, expect } from "vitest";
import { assertVersionRequiresId, diffFields, occEdit } from "./writeFramework";

// Optimistic Concurrency (C1): Edits mit `expectedVersion` müssen abgelehnt werden, wenn ein
// anderer Schreiber (zweite Keyholder-Instanz, Admin-UI) die Zeile zwischenzeitlich geändert hat —
// statt still zu überschreiben (Last-Write-Wins war der einzige echte Datenverlust-Pfad im MCP).
describe("occEdit", () => {
  it("passes without expectedVersion (abwärtskompatibler blinder Write)", () => {
    expect(() => occEdit(undefined, 3, "note x")).not.toThrow();
  });

  it("passes when expectedVersion matches", () => {
    expect(() => occEdit(3, 3, "note x")).not.toThrow();
  });

  it("throws a conflict naming both versions when they diverge", () => {
    expect(() => occEdit(2, 5, 'device "X"')).toThrow(/expectedVersion 2.*current version is 5/);
  });

  it("returns the version increment as data spread — Check und Bump sind EIN Call", () => {
    expect(occEdit(3, 3, "note x")).toEqual({ version: { increment: 1 } });
    expect(occEdit(undefined, 7, "note x")).toEqual({ version: { increment: 1 } });
  });
});

// expectedVersion ergibt nur bei Edits Sinn — beim Anlegen gibt es noch keine Zeile, deren
// Version man erwarten könnte. Stille Annahme wäre irreführend, daher Validierungsfehler.
describe("assertVersionRequiresId", () => {
  it("rejects expectedVersion without id", () => {
    expect(() => assertVersionRequiresId({ expectedVersion: 1 })).toThrow(/expectedVersion.*id/i);
  });

  it("accepts expectedVersion with id, and either alone", () => {
    expect(() => assertVersionRequiresId({ id: "n1", expectedVersion: 2 })).not.toThrow();
    expect(() => assertVersionRequiresId({ id: "n1" })).not.toThrow();
    expect(() => assertVersionRequiresId({})).not.toThrow();
  });
});

// Der Version-Increment ist Buchhaltung, keine inhaltliche Änderung — er darf den Feld-Diff
// nicht verrauschen (die neue Version steht im newState).
describe("diffFields — version wird nicht gedifft", () => {
  it("skips the version key but reports real changes", () => {
    const diff = diffFields(
      { text: "alt", version: 1 },
      { text: "neu", version: 2 },
    );
    expect(diff).toEqual({ text: ["alt", "neu"] });
  });

  it("returns an empty diff when only version changed", () => {
    expect(diffFields({ a: 1, version: 1 }, { a: 1, version: 2 })).toEqual({});
  });
});
