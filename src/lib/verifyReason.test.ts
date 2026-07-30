import { describe, it, expect } from "vitest";
import { toVerifyFailure, formatVerifyReason } from "./verifyReason";

describe("toVerifyFailure — der Grund gilt nur, solange kein Urteil daneben steht", () => {
  it("unverifiziert (status null) + Grund → der Grund wird gemeldet", () => {
    expect(toVerifyFailure(null, "codeWrong", "45678")).toEqual({ reason: "codeWrong", detected: "45678" });
  });

  it("*Missing hat kein Gelesenes — detected bleibt null", () => {
    expect(toVerifyFailure(null, "codeMissing", null)).toEqual({ reason: "codeMissing", detected: null });
  });

  it("von Hand bestätigt → KEIN Grund mehr, auch wenn die Spalte noch gefüllt ist", () => {
    // Der Kern: `resolveKontrolle` setzt nur `verifikationStatus` und räumt den Auto-Grund NICHT ab.
    // Ohne diese Schranke stünde „von Hand bestätigt" neben „falsche Ziffern gelesen" — die
    // Keyholder-KI zöge eine Bestätigung in Zweifel, die der Mensch längst gegeben hat.
    expect(toVerifyFailure("manual", "codeWrong", "45678")).toBeNull();
  });

  it("abgelehnt oder automatisch bestätigt → ebenfalls kein Auto-Grund", () => {
    expect(toVerifyFailure("rejected", "codeWrong", "45678")).toBeNull();
    expect(toVerifyFailure("ai", "codeMissing", null)).toBeNull();
  });

  it("läuft noch → kein Grund; das Urteil steht ja noch aus", () => {
    expect(toVerifyFailure("pending", "codeWrong", "1")).toBeNull();
  });

  it("kein Grund gespeichert → null", () => {
    expect(toVerifyFailure(null, null, null)).toBeNull();
    expect(toVerifyFailure(null, "", null)).toBeNull();
  });

  it("unbekannter Roh-Code fällt auf null statt in den Enum zu rutschen", () => {
    expect(toVerifyFailure(null, "somethingElse", "x")).toBeNull();
  });
});

describe("formatVerifyReason", () => {
  const t = (key: string, values?: Record<string, string>) => `${key}:${values?.detected ?? ""}`;

  it("interpoliert das Gelesene bei den *Wrong-Gründen", () => {
    expect(formatVerifyReason("codeWrong", "45678", t)).toBe("reasonCodeWrong:45678");
  });

  it("kein Grund → null (kein t(undefined)-Absturz)", () => {
    expect(formatVerifyReason(null, null, t)).toBeNull();
  });

  it("unbekannter Grund → null statt Absturz der ganzen Liste", () => {
    expect(formatVerifyReason("legacyValue" as never, null, t)).toBeNull();
  });
});
