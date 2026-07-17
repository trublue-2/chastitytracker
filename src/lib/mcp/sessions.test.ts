import { describe, it, expect, vi, beforeEach } from "vitest";

// A-05 (MCP-Befundliste 2026-07-17): dataQualityFlags blieb leer, obwohl ein Segment ganz ohne
// Gerät (deviceConfidence "undeclared", A-04) im Bestand steht. get_session muss das jetzt melden.

vi.mock("@/lib/prisma", async () => {
  const { createPrismaMock } = await import("@/test/prismaMock");
  return { prisma: createPrismaMock() };
});

import { getSession } from "./sessions";
import { prisma } from "@/lib/prisma";
import { TEST_USER, type PrismaMock } from "@/test/prismaMock";

const db = prisma as unknown as PrismaMock;

const NOW = new Date("2026-07-17T12:00:00Z");

const rawEntry = (id: string, type: string, iso: string, device: object | null) => ({
  id, type, startTime: new Date(iso), oeffnenGrund: null, orgasmusArt: null, kontrollCode: null,
  verifikationStatus: null, deviceCheck: null, deviceCheckNote: null, deviceCheckExpected: null,
  keyInBox: null, device,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  db.user.findUnique.mockResolvedValue({ id: "u1", username: "sub", timezone: "Europe/Zurich" });
  db.user.findUniqueOrThrow.mockResolvedValue(TEST_USER);
});

describe("get_session — dataQualityFlags deckt ein Segment ohne Gerät ab (A-05)", () => {
  it("VERSCHLUSS ohne Gerät → dataQualityFlags nennt das Segment", async () => {
    db.entry.findMany.mockResolvedValue([
      rawEntry("e1", "VERSCHLUSS", "2026-07-17T00:00:00Z", null),
    ]);

    const result = await getSession("sub");
    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0].segments[0].deviceConfidence).toBe("undeclared");
    expect(result.sessions[0].dataQualityFlags).toHaveLength(1);
    // A-05: jetzt maschinenlesbar {code, segmentIndex, detail} statt reiner Prosa.
    expect(result.sessions[0].dataQualityFlags[0]).toMatchObject({ code: "segment-without-device", segmentIndex: 0 });
    expect(result.sessions[0].dataQualityFlags[0].detail).toContain("Segment 0");
  });

  it("VERSCHLUSS MIT Gerät → keine dataQualityFlags (Regression)", async () => {
    db.entry.findMany.mockResolvedValue([
      rawEntry("e1", "VERSCHLUSS", "2026-07-17T00:00:00Z", { id: "d1", name: "Flatty", categoryId: null }),
    ]);

    const result = await getSession("sub");
    expect(result.sessions[0].dataQualityFlags).toEqual([]);
  });

  it("verwaiste Session (zwei VERSCHLUSS ohne OEFFNEN) → orphaned-session-Flag mit segmentIndex null (A-05)", async () => {
    const dev = { id: "d1", name: "Flatty", categoryId: null };
    db.entry.findMany.mockResolvedValue([
      rawEntry("e1", "VERSCHLUSS", "2026-07-16T10:00:00Z", dev),
      rawEntry("e2", "VERSCHLUSS", "2026-07-16T20:00:00Z", dev), // kein OEFFNEN dazwischen → orphaned
    ]);
    const result = await getSession("sub");
    const orphanFlag = result.sessions.flatMap((s) => s.dataQualityFlags).find((f) => f.code === "orphaned-session");
    expect(orphanFlag).toBeDefined();
    expect(orphanFlag!.segmentIndex).toBeNull(); // session-weit, nicht segment-gebunden
  });
});

describe("get_session — deviceCheck {status,isOffense} + durationMinutes (N-4/N-11/N-12)", () => {
  const pruefung = (id: string, iso: string, deviceCheck: string | null) => ({
    ...rawEntry(id, "PRUEFUNG", iso, null), kontrollCode: "12345", verifikationStatus: "ai", deviceCheck,
  });

  it("deviceCheck null → status 'not_checked', isOffense false", async () => {
    db.entry.findMany.mockResolvedValue([
      rawEntry("v1", "VERSCHLUSS", "2026-07-17T00:00:00Z", { id: "d1", name: "Flatty", categoryId: null }),
      pruefung("p1", "2026-07-17T06:00:00Z", null),
    ]);
    const result = await getSession("sub");
    const control = result.sessions[0].segments[0].controls[0];
    expect(control.deviceCheck).toEqual({ status: "not_checked", isOffense: false });
  });

  it("deviceCheck 'wrong' → status 'wrong', isOffense false (kein wrong_device-Vergehen)", async () => {
    db.entry.findMany.mockResolvedValue([
      rawEntry("v1", "VERSCHLUSS", "2026-07-17T00:00:00Z", { id: "d1", name: "Flatty", categoryId: null }),
      pruefung("p1", "2026-07-17T06:00:00Z", "wrong"),
    ]);
    const result = await getSession("sub");
    expect(result.sessions[0].segments[0].controls[0].deviceCheck).toEqual({ status: "wrong", isOffense: false });
  });

  it("durationMinutes macht ein Sub-Minuten-Segment sichtbar, wo durationHours auf 0 rundet (N-12)", async () => {
    db.entry.findMany.mockResolvedValue([
      rawEntry("v1", "VERSCHLUSS", "2026-07-17T00:00:00Z", { id: "d1", name: "Flatty", categoryId: null }),
      rawEntry("o1", "OEFFNEN", "2026-07-17T00:02:00Z", { id: "d1", name: "Flatty", categoryId: null }), // 2 Min
    ]);
    const seg = (await getSession("sub")).sessions[0].segments[0];
    expect(seg.durationHours).toBe(0);   // rundet weg
    expect(seg.durationMinutes).toBe(2); // aber sichtbar
  });
});
