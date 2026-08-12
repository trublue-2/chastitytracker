import { describe, it, expect } from "vitest";
import { toVerifyFailure, formatVerifyReason } from "./verifyReason";
import { buildKontrolleItems } from "./utils";

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

describe("buildKontrolleItems — der Grund erreicht die Session-Liste des Trägers", () => {
  // Warum das zählt: die Liste ist die EINZIGE Stelle, an der der Träger seine eigene Kontrolle
  // wiederfindet. Reichte sie nur `verifikationStatus` durch, stünde dort eine graue „Nicht
  // verifiziert"-Pille ohne Grund — er könnte weder nachbessern noch widersprechen, während der
  // Keyholder den Grund in seiner Liste längst sieht.
  const NOW = new Date("2026-08-12T12:00:00Z");
  const entry = (over: Record<string, unknown> = {}) => ({
    id: "e1", startTime: NOW, createdAt: NOW, imageUrl: null, note: null,
    verifikationStatus: null as string | null, verifikationReason: "codeWrong" as string | null,
    verifikationReasonDetected: "45678" as string | null, ...over,
  });
  const anforderung = (entryRow: ReturnType<typeof entry> | null) => ({
    id: "k1", deadline: NOW, kommentar: null, code: "12345", categoryId: null,
    fulfilledAt: NOW, createdAt: NOW, withdrawnAt: null, entryId: entryRow?.id ?? null,
    autoMarkedRemovedAt: null, entry: entryRow,
  });

  it("beantwortete Anforderung: Grund und Gelesenes stehen am Item", () => {
    const [item] = buildKontrolleItems([anforderung(entry())], [], NOW);
    expect(item.verifikationFailure).toEqual({ reason: "codeWrong", detected: "45678" });
  });

  it("freistehende Prüfung ohne Anforderung ebenso — sie ist genauso eine Sackgasse", () => {
    const [item] = buildKontrolleItems(
      [],
      [{ id: "e2", startTime: NOW, createdAt: NOW, imageUrl: null, note: null, kontrollCode: null,
         verifikationStatus: null, verifikationReason: "sealMissing", verifikationReasonDetected: null }],
      NOW,
    );
    expect(item.verifikationFailure).toEqual({ reason: "sealMissing", detected: null });
  });

  it("von Hand bestätigt → kein Grund mehr am Item", () => {
    // Der gespeicherte Auto-Grund wird von einem späteren Urteil NICHT abgeräumt. Ohne die Schranke
    // aus `toVerifyFailure` stünde in der Liste des Trägers „Manuell verifiziert" und darunter
    // „Falscher Code sichtbar" — zwei Aussagen, von denen nur eine noch gilt.
    const [item] = buildKontrolleItems([anforderung(entry({ verifikationStatus: "manual" }))], [], NOW);
    expect(item.verifikationFailure).toBeNull();
  });

  it("offene Anforderung ohne Eintrag: nichts zu erklären", () => {
    const [item] = buildKontrolleItems([anforderung(null)], [], NOW);
    expect(item.verifikationFailure).toBeNull();
  });
});
