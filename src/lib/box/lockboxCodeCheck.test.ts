import { describe, it, expect } from "vitest";
import { codeChangeNeedsReview, codeCheckPath, compareCodeReads, isCodeChangeState, isCodeChangeVerdict, stableRead } from "./lockboxCodeCheck";

describe("stableRead", () => {
  it("ist nur sicher, wenn alle Lesungen dieselbe Ziffernfolge ergeben", () => {
    expect(stableRead(["0472", "0472"])).toBe("0472");
    expect(stableRead(["0472", "0473"])).toBeNull();
    expect(stableRead(["0472", null])).toBeNull();
    expect(stableRead([])).toBeNull();
  });
});

describe("compareCodeReads", () => {
  it("derselbe sicher gelesene Code ist `same`", () => {
    expect(compareCodeReads(["1234", "1234"], ["1234", "1234"])).toBe("same");
  });

  it("zwei sicher gelesene, verschiedene Codes sind `different` — führende Nullen zählen", () => {
    expect(compareCodeReads(["0123", "0123"], ["123", "123"])).toBe("different");
    expect(compareCodeReads(["1234", "1234"], ["4321", "4321"])).toBe("different");
  });

  it("eine widersprüchliche oder fehlende Lesung auf EINER Seite macht das Ganze unsicher", () => {
    expect(compareCodeReads(["1234", "1239"], ["1234", "1234"])).toBe("uncertain");
    expect(compareCodeReads(["1234", "1234"], [null, null])).toBe("uncertain");
  });
});

describe("codeChangeNeedsReview", () => {
  it("meldet derselbe und unsicher, sonst nichts", () => {
    expect(codeChangeNeedsReview("same")).toBe(true);
    expect(codeChangeNeedsReview("uncertain")).toBe(true);
    expect(codeChangeNeedsReview("different")).toBe(false);
    expect(codeChangeNeedsReview("first")).toBe(false);
  });
});

describe("Hilfen", () => {
  it("trennt Urteile von Zuständen am Verschluss", () => {
    expect(isCodeChangeVerdict("same")).toBe(true);
    expect(isCodeChangeVerdict("pending")).toBe(false);
    expect(isCodeChangeState("pending")).toBe(true);
    expect(isCodeChangeState("error")).toBe(true);
    expect(isCodeChangeState("1234")).toBe(false);
    expect(isCodeChangeState(null)).toBe(false);
  });

  it("baut den Weg zur Vergleichsansicht", () => {
    expect(codeCheckPath("u1", "e1")).toBe("/admin/users/u1/bildersafe/e1");
  });
});
