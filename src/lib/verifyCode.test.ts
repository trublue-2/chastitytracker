import { describe, it, expect } from "vitest";
import { evaluateVerifyResponse } from "./verifyCode";

const CODE = "12345";
const SEAL = "0067321";

describe("evaluateVerifyResponse — Einzel-Prüfung (kein Siegel)", () => {
  it("match=true vom Modell", () => {
    const r = evaluateVerifyResponse({ detected: "12345", match: true, reason: null }, CODE, null);
    expect(r.match).toBe(true);
    expect(r.detected).toBe("12345");
    expect(r.reason).toBeNull();
    expect(r.sealMatch).toBeUndefined();
  });

  it("Override: richtige Ziffern, aber match=false vom Modell", () => {
    const r = evaluateVerifyResponse({ detected: "12345", match: false, reason: "?" }, CODE, null);
    expect(r.match).toBe(true);
    expect(r.overridden).toBe(true);
    expect(r.reason).toBeNull();
  });

  it("Whitespace/Punktuation um die Ziffern wird normalisiert", () => {
    const r = evaluateVerifyResponse({ detected: " 12345.", match: false }, CODE, null);
    expect(r.match).toBe(true);
  });

  it("Fuzzy-Toleranz 1↔7", () => {
    const r = evaluateVerifyResponse({ detected: "72345", match: false }, CODE, null);
    expect(r.match).toBe(true);
  });

  it("Wort-Sentinel 'null' als keine Erkennung, Grund bleibt erhalten", () => {
    const r = evaluateVerifyResponse({ detected: "null", match: false, reason: "Kein Code sichtbar" }, CODE, null);
    expect(r.detected).toBeNull();
    expect(r.match).toBe(false);
    expect(r.reason).toBe("Kein Code sichtbar");
  });

  it("falscher Code → kein Match", () => {
    const r = evaluateVerifyResponse({ detected: "99999", match: false, reason: "Falscher Code sichtbar: 99999" }, CODE, null);
    expect(r.match).toBe(false);
    expect(r.detected).toBe("99999");
    expect(r.reason).toBe("Falscher Code sichtbar: 99999");
  });
});

describe("evaluateVerifyResponse — Dual-Prüfung (Code + Siegel)", () => {
  it("beide erkannt → Match", () => {
    const r = evaluateVerifyResponse(
      { detectedCode: "12345", matchCode: true, detectedSeal: "0067321", matchSeal: true, reason: null },
      CODE, SEAL,
    );
    expect(r.match).toBe(true);
    expect(r.sealMatch).toBe(true);
    expect(r.sealDetected).toBe("0067321");
    expect(r.reason).toBeNull();
  });

  it("Siegel fehlt → kein Match, Fallback-Grund", () => {
    const r = evaluateVerifyResponse(
      { detectedCode: "12345", matchCode: true, detectedSeal: null, matchSeal: false, reason: null },
      CODE, SEAL,
    );
    expect(r.match).toBe(false);
    expect(r.sealMatch).toBe(false);
    expect(r.reason).toBe("Siegel-Nummer nicht erkannt");
  });

  it("Code fehlt → kein Match, Modell-Grund hat Vorrang", () => {
    const r = evaluateVerifyResponse(
      { detectedCode: null, matchCode: false, detectedSeal: "0067321", matchSeal: true, reason: "Kein Kontroll-Code sichtbar" },
      CODE, SEAL,
    );
    expect(r.match).toBe(false);
    expect(r.reason).toBe("Kein Kontroll-Code sichtbar");
  });

  it("beide fehlen → kombinierter Fallback-Grund", () => {
    const r = evaluateVerifyResponse(
      { detectedCode: null, matchCode: false, detectedSeal: null, matchSeal: false },
      CODE, SEAL,
    );
    expect(r.match).toBe(false);
    expect(r.reason).toBe("Kontroll-Code und Siegel-Nummer nicht erkannt");
  });

  it("Siegel wird NICHT fuzzy-toleriert (exakter Match) — transponiertes Fremd-Siegel bleibt Mismatch", () => {
    const r = evaluateVerifyResponse(
      { detectedCode: "12345", matchCode: true, detectedSeal: "6067321", matchSeal: false },
      CODE, SEAL,
    );
    expect(r.match).toBe(false);
    expect(r.sealMatch).toBe(false);
    expect(r.sealDetected).toBe("6067321");
    expect(r.reason).toBe("Siegel-Nummer nicht erkannt");
  });

  it("Der handgeschriebene Code bleibt fuzzy-tolerant (1↔7), auch im Dual-Modus", () => {
    const r = evaluateVerifyResponse(
      { detectedCode: "72345", matchCode: false, detectedSeal: "0067321", matchSeal: true },
      CODE, SEAL,
    );
    expect(r.match).toBe(true);
  });

  it("Override je Teil: exakte Siegel-Ziffern trotz matchSeal=false zählen als Match", () => {
    const r = evaluateVerifyResponse(
      { detectedCode: "12345", matchCode: true, detectedSeal: "0067321", matchSeal: false },
      CODE, SEAL,
    );
    expect(r.match).toBe(true);
    expect(r.overridden).toBe(true);
  });
});
