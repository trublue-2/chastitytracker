import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Die Invariante dieses Service: wer `deviceCheck: "pending"` setzt, MUSS es durch einen Endzustand
 * ersetzen — in JEDEM Ausgang. Eine Zeile, die für immer auf „läuft noch" steht, ist schlimmer als
 * das mehrdeutige `null`, das das Feld überhaupt ersetzt.
 *
 * Vorher lagen Startwert und Endzustand ~180 Zeilen auseinander in `entries/route.ts`, verbunden nur
 * dadurch, dass zwei getrennt hingeschriebene Bedingungen zufällig übereinstimmten — und die Route
 * hat keine Tests.
 */

vi.mock("@/lib/prisma", () => ({ prisma: { entry: { update: vi.fn() } } }));
vi.mock("@/lib/deviceReferenceService", () => ({ gatherDeviceReferences: vi.fn() }));
vi.mock("@/lib/detectDevice", () => ({ checkDeviceInPhoto: vi.fn() }));
vi.mock("@/lib/serverLog", () => ({ structuredLog: vi.fn() }));

import { deviceCheckApplies, runDeviceCheck } from "./deviceCheckService";
import { prisma } from "@/lib/prisma";
import { gatherDeviceReferences } from "@/lib/deviceReferenceService";
import { checkDeviceInPhoto } from "@/lib/detectDevice";

const updateMock = prisma.entry.update as unknown as ReturnType<typeof vi.fn>;
const refsMock = gatherDeviceReferences as unknown as ReturnType<typeof vi.fn>;
const checkMock = checkDeviceInPhoto as unknown as ReturnType<typeof vi.fn>;

/** Das erwartete Gerät kommt fertig vom Aufrufer (seit v5.0.1 aus der Ziel-Auflösung der Kontrolle,
 *  siehe inspectionTarget.ts) — der Service schlägt es nicht mehr selbst nach. */
const run = (expectedDeviceId: string | null) =>
  runDeviceCheck({
    entryId: "e1",
    userId: "u1",
    photoUrl: "/api/uploads/q.jpg",
    expectedDeviceId,
  });

/** Der geschriebene deviceCheck-Wert des (einzigen) Update-Aufrufs. */
const writtenStatus = () => updateMock.mock.calls[0][0].data.deviceCheck;

beforeEach(() => {
  vi.clearAllMocks();
  updateMock.mockResolvedValue({});
  refsMock.mockResolvedValue([{ deviceId: "d1", deviceName: "Cage A", visualTraits: null, lookalikeClusterId: null, imageUrls: ["/api/uploads/a.jpg"] }]);
});

describe("deviceCheckApplies — die EINE Bedingung für Startwert und Lauf", () => {
  it("PRUEFUNG mit Foto: ja", () => {
    expect(deviceCheckApplies("PRUEFUNG", "/api/uploads/q.jpg")).toBe(true);
  });

  it("PRUEFUNG ohne Foto: nein — ohne Bild gibt es nichts zu erkennen", () => {
    expect(deviceCheckApplies("PRUEFUNG", null)).toBe(false);
    expect(deviceCheckApplies("PRUEFUNG", undefined)).toBe(false);
    expect(deviceCheckApplies("PRUEFUNG", "")).toBe(false);
  });

  it("andere Eintrags-Typen: nein, auch mit Foto", () => {
    for (const t of ["VERSCHLUSS", "OEFFNEN", "ORGASMUS", "WEAR_BEGIN", "WEAR_END"]) {
      expect(deviceCheckApplies(t, "/api/uploads/q.jpg")).toBe(false);
    }
  });

  it("hängt NICHT am Kontroll-Code — eine freiwillige Selbstkontrolle wird auch geprüft", () => {
    // Anders als die Code-Verifikation: geprüft wird das Foto gegen das erwartete Gerät.
    expect(deviceCheckApplies("PRUEFUNG", "/api/uploads/q.jpg")).toBe(true);
  });
});

describe("runDeviceCheck — 'pending' wird IMMER durch einen Endzustand ersetzt", () => {
  it("Befund vorhanden → er wird geschrieben", async () => {
    checkMock.mockResolvedValue({ status: "ok", detected: "Cage A", expected: "Cage A" });
    await run("d1");

    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(updateMock).toHaveBeenCalledWith({
      where: { id: "e1" },
      data: { deviceCheck: "ok", deviceCheckNote: "Cage A", deviceCheckExpected: "Cage A" },
    });
  });

  it("kein erwartetes Gerät → null, nicht 'pending' (nichts zu prüfen ist ein ENDzustand)", async () => {
    // Der Sammelfall: nicht verschlossen, nichts getragen, oder ein Alt-Eintrag ohne Gerät — der
    // Aufrufer liefert dann `null`, und hier gibt es nichts nachzuschlagen.
    await run(null);

    expect(checkMock).not.toHaveBeenCalled();
    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(writtenStatus()).toBeNull();
  });

  it("kein Vision-Provider (checkDeviceInPhoto liefert null) → null, nicht 'pending'", async () => {
    // Der Fall, der vorher gar nicht zurückschrieb: Feature aus. Mit einem gesetzten "pending" wäre
    // die Zeile damit dauerhaft auf „läuft noch" stehen geblieben.
    checkMock.mockResolvedValue(null);
    await run("d1");

    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(writtenStatus()).toBeNull();
  });

  it("Referenz-Laden wirft → 'error' (wollte prüfen, ging nicht), und es wird geschrieben", async () => {
    refsMock.mockRejectedValue(new Error("EIO"));
    await run("d1");

    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(writtenStatus()).toBe("error");
  });

  it("scheitert das SCHREIBEN, wirft der Service trotzdem nicht — der Aufrufer ist fire-and-forget", async () => {
    checkMock.mockResolvedValue({ status: "ok", detected: "Cage A", expected: "Cage A" });
    updateMock.mockRejectedValue(new Error("locked db"));

    await expect(run("d1")).resolves.toBeUndefined();
  });
});
