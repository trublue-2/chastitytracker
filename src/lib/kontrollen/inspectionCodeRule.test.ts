import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Die Geräte-Regel „kein Verifizierungscode" (`Device.requireInspectionCode`).
 *
 * Der Code macht drei Jobs, und der Toggle nimmt ihm alle drei: er ist der Frische-Beweis im Foto,
 * der Input der KI-Prüfung UND der Schlüssel, über den ein eingereichter Eintrag seine Anforderung
 * findet. Diese Datei pinnt die Ableitung, die daraus die drei Entscheidungen macht.
 */

vi.mock("@/lib/prisma", () => ({
  prisma: { device: { findUnique: vi.fn() } },
}));

import { inspectionCodeRequired, plannedVerification, initialVerificationStatus } from "./kontrolleService";
import { prisma } from "@/lib/prisma";

const deviceFind = prisma.device.findUnique as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => vi.clearAllMocks());

describe("inspectionCodeRequired — im Zweifel JA", () => {
  it("Gerät mit Code-Pflicht → true", async () => {
    deviceFind.mockResolvedValue({ requireInspectionCode: true });
    expect(await inspectionCodeRequired("d1")).toBe(true);
  });

  it("Gerät ohne Code-Pflicht → false", async () => {
    deviceFind.mockResolvedValue({ requireInspectionCode: false });
    expect(await inspectionCodeRequired("d1")).toBe(false);
  });

  it("kein Gerät am Verschluss (Alt-Eintrag, Admin-Pfad) → true, ohne Query", async () => {
    // Bestandsverhalten. Eine fehlende Information ist kein Grund, eine Kontrolle zu entschärfen.
    expect(await inspectionCodeRequired(null)).toBe(true);
    expect(deviceFind).not.toHaveBeenCalled();
  });

  it("Gerät nicht mehr auffindbar (gelöscht/fremd) → true", async () => {
    deviceFind.mockResolvedValue(null);
    expect(await inspectionCodeRequired("weg")).toBe(true);
  });
});

describe("plannedVerification — was ist an dieser Einreichung zu prüfen?", () => {
  it("Code-Pflicht + eingereichter Code → Code-Prüfung (Siegel als Zusatz)", () => {
    expect(plannedVerification({ submittedCode: "12345", codeRequired: true, sealCode: "98765" }))
      .toEqual({ kind: "code", code: "12345", sealCode: "98765" });
  });

  it("Code-Pflicht, aber kein Code eingereicht → nichts zu prüfen, und es HÄTTE einer sein sollen", () => {
    // Die freiwillige Selbstkontrolle. Status bleibt „unverifiziert", nicht „nicht nötig".
    const v = plannedVerification({ submittedCode: null, codeRequired: true, sealCode: null });
    expect(v).toEqual({ kind: "none", codeRequired: true });
    expect(initialVerificationStatus(v)).toBeNull();
  });

  it("ohne Code-Pflicht, mit Siegel → NUR das Siegel wird geprüft", () => {
    // Das Siegel beweist etwas anderes als der Code (Box unberührt) und fällt mit ihm nicht weg.
    expect(plannedVerification({ submittedCode: null, codeRequired: false, sealCode: "98765" }))
      .toEqual({ kind: "seal", sealCode: "98765" });
  });

  it("ohne Code-Pflicht, ohne Siegel → nichts zu prüfen, und es war nie einer vorgesehen", () => {
    const v = plannedVerification({ submittedCode: null, codeRequired: false, sealCode: null });
    expect(v).toEqual({ kind: "none", codeRequired: false });
    expect(initialVerificationStatus(v)).toBe("not_required");
  });

  it("ohne Code-Pflicht zählt ein trotzdem mitgeschickter Code NICHT", () => {
    // Die Anforderung hat keinen — es gäbe nichts zu vergleichen. Sonst könnte ein Client durch
    // Mitschicken einer Zahl eine Prüfung erzwingen, die die Anforderung nicht kennt.
    expect(plannedVerification({ submittedCode: "12345", codeRequired: false, sealCode: null }))
      .toEqual({ kind: "none", codeRequired: false });
    expect(plannedVerification({ submittedCode: "12345", codeRequired: false, sealCode: "98765" }))
      .toEqual({ kind: "seal", sealCode: "98765" });
  });

  it("leerer String gilt als kein Code", () => {
    expect(plannedVerification({ submittedCode: "", codeRequired: true, sealCode: null }))
      .toEqual({ kind: "none", codeRequired: true });
  });
});

describe("initialVerificationStatus — 'pending' nur, wenn danach wirklich geprüft wird", () => {
  it("Code- und Siegel-Prüfung starten auf pending", () => {
    expect(initialVerificationStatus({ kind: "code", code: "1", sealCode: null })).toBe("pending");
    expect(initialVerificationStatus({ kind: "seal", sealCode: "9" })).toBe("pending");
  });

  it("und die beiden 'none'-Fälle unterscheiden sich — das ist der Punkt des neuen Status", () => {
    // „unverifiziert" heisst geprüft-und-nicht-bestätigt und liest sich wie ein Fehlschlag;
    // „nicht nötig" heisst, es war nie etwas zu prüfen.
    expect(initialVerificationStatus({ kind: "none", codeRequired: true })).toBeNull();
    expect(initialVerificationStatus({ kind: "none", codeRequired: false })).toBe("not_required");
  });
});
