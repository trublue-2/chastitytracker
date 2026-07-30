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

const LOCKED = { type: "VERSCHLUSS", deviceId: "d1" };

const run = (lockEntry: unknown) =>
  runDeviceCheck({
    entryId: "e1",
    userId: "u1",
    photoUrl: "/api/uploads/q.jpg",
    lockEntry: lockEntry as Promise<{ type: string; deviceId: string | null } | null>,
  });

/** Der geschriebene deviceCheck-Wert des (einzigen) Update-Aufrufs. */
const writtenStatus = () => updateMock.mock.calls[0][0].data.deviceCheck;

beforeEach(() => {
  vi.clearAllMocks();
  updateMock.mockResolvedValue({});
  refsMock.mockResolvedValue([{ deviceId: "d1", deviceName: "Cage A", visualTraits: null, imageUrls: ["/api/uploads/a.jpg"] }]);
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
    // Anders als die Code-Verifikation: geprüft wird das Foto gegen das verschlossene Gerät.
    expect(deviceCheckApplies("PRUEFUNG", "/api/uploads/q.jpg")).toBe(true);
  });
});

describe("runDeviceCheck — 'pending' wird IMMER durch einen Endzustand ersetzt", () => {
  it("Befund vorhanden → er wird geschrieben", async () => {
    checkMock.mockResolvedValue({ status: "ok", detected: "Cage A", expected: "Cage A" });
    await run(Promise.resolve(LOCKED));

    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(updateMock).toHaveBeenCalledWith({
      where: { id: "e1" },
      data: { deviceCheck: "ok", deviceCheckNote: "Cage A", deviceCheckExpected: "Cage A" },
    });
  });

  it("nicht verschlossen → null, nicht 'pending' (nichts zu prüfen ist ein ENDzustand)", async () => {
    await run(Promise.resolve({ type: "OEFFNEN", deviceId: null }));

    expect(checkMock).not.toHaveBeenCalled();
    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(writtenStatus()).toBeNull();
  });

  it("verschlossen, aber kein Gerät hinterlegt → null", async () => {
    await run(Promise.resolve({ type: "VERSCHLUSS", deviceId: null }));

    expect(checkMock).not.toHaveBeenCalled();
    expect(writtenStatus()).toBeNull();
  });

  it("gar kein Lock-Eintrag → null", async () => {
    await run(Promise.resolve(null));
    expect(writtenStatus()).toBeNull();
  });

  it("kein Vision-Provider (checkDeviceInPhoto liefert null) → null, nicht 'pending'", async () => {
    // Der Fall, der vorher gar nicht zurückschrieb: Feature aus. Mit einem gesetzten "pending" wäre
    // die Zeile damit dauerhaft auf „läuft noch" stehen geblieben.
    checkMock.mockResolvedValue(null);
    await run(Promise.resolve(LOCKED));

    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(writtenStatus()).toBeNull();
  });

  it("Referenz-Laden wirft → 'error' (wollte prüfen, ging nicht), und es wird geschrieben", async () => {
    refsMock.mockRejectedValue(new Error("EIO"));
    await run(Promise.resolve(LOCKED));

    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(writtenStatus()).toBe("error");
  });

  it("der Lock-Lookup selbst wirft → 'error', kein unbehandelter Rejection", async () => {
    await expect(run(Promise.reject(new Error("db down")))).resolves.toBeUndefined();
    expect(writtenStatus()).toBe("error");
  });

  it("scheitert das SCHREIBEN, wirft der Service trotzdem nicht — der Aufrufer ist fire-and-forget", async () => {
    checkMock.mockResolvedValue({ status: "ok", detected: "Cage A", expected: "Cage A" });
    updateMock.mockRejectedValue(new Error("locked db"));

    await expect(run(Promise.resolve(LOCKED))).resolves.toBeUndefined();
  });
});
