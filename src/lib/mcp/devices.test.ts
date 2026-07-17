import { describe, it, expect, vi, beforeEach } from "vitest";

// N-3 (MCP-Restliste 2026-07-17): get_devices war als einziger V2-Read ohne Zeitanker.
// listDevicesV2 trägt jetzt den gemeinsamen Envelope (generatedAt/timezone) + returnedCount.

vi.mock("@/lib/prisma", async () => {
  const { createPrismaMock } = await import("@/test/prismaMock");
  return { prisma: createPrismaMock() };
});

import { listDevicesV2 } from "./devices";
import { prisma } from "@/lib/prisma";
import { type PrismaMock } from "@/test/prismaMock";

const db = prisma as unknown as PrismaMock;

const deviceRow = (id: string, name: string) => ({
  id, name, description: null, archivedAt: null, createdAt: new Date("2026-06-01T00:00:00Z"),
  purchasePrice: null, currency: null, securityLevel: null, lookalikeClusterId: null,
  pullOffRisk: false, material: null, bauform: null, healthFlags: null, retentionNotes: null,
  version: 1, category: { name: "KG", isBuiltIn: true, trackingEnabled: true }, _count: { referenceImages: 0 },
});

beforeEach(() => {
  vi.clearAllMocks();
  db.user.findUnique.mockResolvedValue({ id: "u1", username: "sub", timezone: "Europe/Zurich" });
});

describe("listDevicesV2 — N-3: Envelope + returnedCount", () => {
  it("liefert generatedAt, timezone und returnedCount neben schemaVersion", async () => {
    db.device.findMany.mockResolvedValue([deviceRow("d1", "Flatty"), deviceRow("d2", "Pink Flatty")]);
    const result = await listDevicesV2("sub");
    expect(result.schemaVersion).toBe(3);        // additiv → kein Bump
    expect(result.returnedCount).toBe(2);
    expect(result.devices).toHaveLength(2);
    expect(typeof result.generatedAt).toBe("string");
    expect(result.timezone).toBe("Europe/Zurich");
  });

  it("returnedCount 0 bei leerem Inventar", async () => {
    db.device.findMany.mockResolvedValue([]);
    const result = await listDevicesV2("sub");
    expect(result.returnedCount).toBe(0);
    expect(result.generatedAt).toBeTruthy();
  });
});
