import { describe, it, expect, vi, beforeEach } from "vitest";

// N-3 (MCP-Restliste 2026-07-17): get_devices war als einziger V2-Read ohne Zeitanker.
// listDevicesV2 trägt jetzt den gemeinsamen Envelope (generatedAt/timezone) + returnedCount.

vi.mock("@/lib/prisma", async () => {
  const { createPrismaMock } = await import("@/test/prismaMock");
  return { prisma: createPrismaMock() };
});

import { listDevicesV2, setDeviceMetaDef } from "./devices";
import { executeWrite } from "./writeFramework";
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

// N-15 / K-16 (MCP-Restliste 2026-07-17): der V2-dryRun lieferte nur `before` — kein diff/after/
// wouldSucceed, obwohl explain_model „volle Tiefe" versprach. Jetzt spiegelt er die V1-Form.
describe("set_device_meta dryRun — N-15 (diff/after/wouldSucceed) + K-16 (healthFlags-Array)", () => {
  const ctx = { targetUserId: "u1", targetUsername: "sub" };
  // resolveDevice liest über device.findMany (metaResolveSelect).
  const metaRow = (over: Record<string, unknown> = {}) => ({
    id: "d1", name: "Flatty", version: 1, securityLevel: null, lookalikeClusterId: null,
    pullOffRisk: false, material: null, bauform: null, healthFlags: null, retentionNotes: null, ...over,
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const run = (args: Record<string, unknown>) =>
    executeWrite(setDeviceMetaDef, ctx, args as never, { reason: "test", dryRun: true }) as Promise<any>;

  it("liefert wouldSucceed + diff [alt,neu] + after, ohne zu committen", async () => {
    db.device.findMany.mockResolvedValue([metaRow()]);
    const res = await run({ deviceName: "Flatty", lookalikeClusterId: "flat-kunststoff" });
    expect(res.dryRun).toBe(true);
    expect(res.wouldSucceed).toBe(true);
    expect(res.diff).toEqual({ lookalikeClusterId: [null, "flat-kunststoff"] });
    expect(res.after.lookalikeClusterId).toBe("flat-kunststoff");
    expect(db.device.update).not.toHaveBeenCalled();
  });

  it("K-16: healthFlags in before/after/diff sind Arrays (nicht JSON-String)", async () => {
    db.device.findMany.mockResolvedValue([metaRow({ healthFlags: JSON.stringify(["scheuert"]) })]);
    const res = await run({ deviceName: "Flatty", healthFlags: ["scheuert", "neu"] });
    expect(res.after.healthFlags).toEqual(["scheuert", "neu"]);
    expect(res.diff.healthFlags).toEqual([["scheuert"], ["scheuert", "neu"]]);
  });

  it("No-op-Edit (kein Feld angegeben) → leerer diff", async () => {
    db.device.findMany.mockResolvedValue([metaRow({ healthFlags: JSON.stringify([]) })]);
    const res = await run({ deviceName: "Flatty" });
    expect(res.diff).toEqual({});
  });
});
