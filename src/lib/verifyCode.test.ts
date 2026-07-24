import { describe, it, expect } from "vitest";
import { evaluateVerifyResponse, isImplausibleSeal, sealDigitsFromReply } from "./verifyCode";

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

  it("Wort-Sentinel 'null' als keine Erkennung → reason codeMissing", () => {
    const r = evaluateVerifyResponse({ detected: "null", match: false }, CODE, null);
    expect(r.detected).toBeNull();
    expect(r.match).toBe(false);
    expect(r.reason).toBe("codeMissing");
  });

  it("falscher Code → kein Match, reason codeWrong", () => {
    const r = evaluateVerifyResponse({ detected: "99999", match: false }, CODE, null);
    expect(r.match).toBe(false);
    expect(r.detected).toBe("99999");
    expect(r.reason).toBe("codeWrong");
  });

  it("zu viele Ziffern → Fehl-Lesung, NICHT als abweichende Nummer melden", () => {
    const r = evaluateVerifyResponse({ detected: "123456", match: false }, CODE, null);
    expect(r.match).toBe(false);
    expect(r.detected).toBeNull();
    expect(r.reason).toBe("codeMissing");
  });

  it("zu wenige Ziffern → Fehl-Lesung", () => {
    const r = evaluateVerifyResponse({ detected: "1234", match: false }, CODE, null);
    expect(r.match).toBe(false);
    expect(r.detected).toBeNull();
    expect(r.reason).toBe("codeMissing");
  });

  it("match=true zu längen-abweichenden Ziffern wird nicht geglaubt", () => {
    const r = evaluateVerifyResponse({ detected: "123456", match: true }, CODE, null);
    expect(r.match).toBe(false);
    expect(r.detected).toBeNull();
  });

  it("match=true zu abweichenden Ziffern gleicher Länge wird nicht geglaubt", () => {
    const r = evaluateVerifyResponse({ detected: "99999", match: true }, CODE, null);
    expect(r.match).toBe(false);
    expect(r.reason).toBe("codeWrong");
  });

  it("detected wird auf die blanken Ziffern normalisiert zurückgegeben", () => {
    const r = evaluateVerifyResponse({ detected: " 99 999 ", match: false }, CODE, null);
    expect(r.detected).toBe("99999");
    expect(r.reason).toBe("codeWrong");
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

  it("Siegel fehlt (Code ok) → kein Match, reason sealMissing", () => {
    const r = evaluateVerifyResponse(
      { detectedCode: "12345", matchCode: true, detectedSeal: null, matchSeal: false },
      CODE, SEAL,
    );
    expect(r.match).toBe(false);
    expect(r.sealMatch).toBe(false);
    expect(r.reason).toBe("sealMissing");
  });

  it("Code fehlt → kein Match, reason codeMissing", () => {
    const r = evaluateVerifyResponse(
      { detectedCode: null, matchCode: false, detectedSeal: "0067321", matchSeal: true },
      CODE, SEAL,
    );
    expect(r.match).toBe(false);
    expect(r.reason).toBe("codeMissing");
  });

  it("beide fehlen → reason sealMissing (Siegel-first, spiegelt die sealMismatch-Card)", () => {
    const r = evaluateVerifyResponse(
      { detectedCode: null, matchCode: false, detectedSeal: null, matchSeal: false },
      CODE, SEAL,
    );
    expect(r.match).toBe(false);
    expect(r.sealMatch).toBe(false);
    expect(r.reason).toBe("sealMissing");
  });

  it("Siegel wird NICHT fuzzy-toleriert (exakter Match) — transponiertes Fremd-Siegel bleibt Mismatch", () => {
    const r = evaluateVerifyResponse(
      { detectedCode: "12345", matchCode: true, detectedSeal: "6067321", matchSeal: false },
      CODE, SEAL,
    );
    expect(r.match).toBe(false);
    expect(r.sealMatch).toBe(false);
    expect(r.sealDetected).toBe("6067321");
    expect(r.reason).toBe("sealWrong");
  });

  it("Der handgeschriebene Code bleibt fuzzy-tolerant (1↔7), auch im Dual-Modus", () => {
    const r = evaluateVerifyResponse(
      { detectedCode: "72345", matchCode: false, detectedSeal: "0067321", matchSeal: true },
      CODE, SEAL,
    );
    expect(r.match).toBe(true);
  });

  it("Siegel-Lesung mit falscher Stellenzahl → sealMissing, nicht sealWrong", () => {
    const r = evaluateVerifyResponse(
      { detectedCode: "12345", matchCode: true, detectedSeal: "00673219", matchSeal: false },
      CODE, SEAL,
    );
    expect(r.match).toBe(false);
    expect(r.sealDetected).toBeNull();
    expect(r.reason).toBe("sealMissing");
  });

  it("Stellenzahl-Gate greift auch im Dual-Modus auf dem Kontroll-Code", () => {
    const r = evaluateVerifyResponse(
      { detectedCode: "123450", matchCode: false, detectedSeal: "0067321", matchSeal: true },
      CODE, SEAL,
    );
    expect(r.match).toBe(false);
    expect(r.detected).toBeNull();
    expect(r.reason).toBe("codeMissing");
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

describe("sealDigitsFromReply — Entdeckung einer UNBEKANNTEN Nummer (Siegel/Zahlenschloss)", () => {
  it("akzeptiert eine saubere Ziffernfolge im erlaubten Bereich, inkl. führender Nullen", () => {
    expect(sealDigitsFromReply("0067321", 5, 8)).toBe("0067321");
  });

  it("normalisiert Whitespace (Modelle setzen die Nummer gern in Gruppen)", () => {
    expect(sealDigitsFromReply(" 00673 21 ", 5, 8)).toBe("0067321");
    expect(sealDigitsFromReply("1234", 3, 8)).toBe("1234");
  });

  it("verwirft Antworten mit Buchstaben — sonst würde eine Fremd-Seriennummer zur Siegel-Nummer", () => {
    // Ohne diese Prüfung ergäbe reines Ziffern-Strippen "1234567" und damit einen
    // Manipulations-Nachweis, den das Modell nie an einer Plombe gelesen hat.
    expect(sealDigitsFromReply("Serial No. AB1234567", 5, 8)).toBeNull();
    expect(sealDigitsFromReply("seal 0067321 on device", 5, 8)).toBeNull();
  });

  it("verwirft Antworten ausserhalb der Längen-Grenzen", () => {
    expect(sealDigitsFromReply("1234", 5, 8)).toBeNull();
    expect(sealDigitsFromReply("123456789", 5, 8)).toBeNull();
  });

  it("verwirft Nicht-Strings und Leeres", () => {
    expect(sealDigitsFromReply(null, 5, 8)).toBeNull();
    expect(sealDigitsFromReply(12345, 5, 8)).toBeNull();
    expect(sealDigitsFromReply("", 5, 8)).toBeNull();
  });
});

describe("isImplausibleSeal — Halluzinations-/Platzhalter-Guard", () => {
  it("verwirft strikt fortlaufende Folgen (auf- und absteigend)", () => {
    expect(isImplausibleSeal("01234567")).toBe(true);
    expect(isImplausibleSeal("12345678")).toBe(true);
    expect(isImplausibleSeal("12345")).toBe(true);
    expect(isImplausibleSeal("76543210")).toBe(true);
  });

  it("verwirft gleichförmige Folgen", () => {
    expect(isImplausibleSeal("00000000")).toBe(true);
    expect(isImplausibleSeal("11111")).toBe(true);
  });

  it("akzeptiert echte Siegel-Nummern und leere/kurze Werte", () => {
    expect(isImplausibleSeal("0067321")).toBe(false);
    expect(isImplausibleSeal("48291")).toBe(false);
    expect(isImplausibleSeal(null)).toBe(false);
    expect(isImplausibleSeal("123")).toBe(false); // zu kurz für eine Plombe
  });
});
