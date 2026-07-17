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
    expect(result.sessions[0].dataQualityFlags[0]).toContain("Segment 0");
  });

  it("VERSCHLUSS MIT Gerät → keine dataQualityFlags (Regression)", async () => {
    db.entry.findMany.mockResolvedValue([
      rawEntry("e1", "VERSCHLUSS", "2026-07-17T00:00:00Z", { id: "d1", name: "Flatty", categoryId: null }),
    ]);

    const result = await getSession("sub");
    expect(result.sessions[0].dataQualityFlags).toEqual([]);
  });
});
