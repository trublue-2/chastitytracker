import { describe, it, expect, vi, beforeEach } from "vitest";

// N-3 (MCP-Restliste 2026-07-17): get_devices war als einziger V2-Read ohne Zeitanker.
// listDevicesV2 trägt jetzt den gemeinsamen Envelope (generatedAt/timezone) + returnedCount.

vi.mock("@/lib/prisma", async () => {
  const { createPrismaMock } = await import("@/test/prismaMock");
  return { prisma: createPrismaMock() };
});

import { listDevicesV2, setDeviceMetaDef, upsertDeviceDef, deleteDeviceDef } from "./devices";
import { executeWrite } from "./writeFramework";
import { prisma } from "@/lib/prisma";
import { type PrismaMock } from "@/test/prismaMock";

const db = prisma as unknown as PrismaMock;

const deviceRow = (id: string, name: string) => ({
  id, name, description: null, archivedAt: null, createdAt: new Date("2026-06-01T00:00:00Z"),
  purchasePrice: null, currency: null, categoryId: "c1", requireInspectionCode: true,
  securityLevel: null, lookalikeClusterId: null,
  pullOffRisk: false, material: null, bauform: null, healthFlags: null, retentionNotes: null,
  version: 1, category: { name: "KG", isBuiltIn: true, trackingEnabled: true }, _count: { referenceImages: 0 },
});

const categoryRow = (id: string, name: string, over: Record<string, unknown> = {}) => ({
  id, name, slug: name.toLowerCase(), color: "cat-steel", icon: "Lock", isBuiltIn: false,
  trackingEnabled: true, requirePhoto: false, allowVorgaben: true, sortOrder: 0,
  createdAt: new Date("2026-06-01T00:00:00Z"), _count: { devices: 1, vorgaben: 0 }, ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  db.user.findUnique.mockResolvedValue({ id: "u1", username: "sub", timezone: "Europe/Zurich" });
});

describe("listDevicesV2 — N-3: Envelope + returnedCount", () => {
  it("liefert generatedAt, timezone und returnedCount neben schemaVersion", async () => {
    db.device.findMany.mockResolvedValue([deviceRow("d1", "Flatty"), deviceRow("d2", "Pink Flatty")]);
    const result = await listDevicesV2("sub");
    expect(result.schemaVersion).toBe(5);        // v5: categoryId + requireInspectionCode + categories
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

  it("K-10: includeArchived/deviceId schlagen sich im where nieder; includeNotes:false spart den Notes-Query", async () => {
    db.device.findMany.mockResolvedValue([deviceRow("d1", "Flatty")]);
    await listDevicesV2("sub"); // Default: archivierte aus
    expect(db.device.findMany.mock.calls[0][0].where).toEqual({ userId: "u1", archivedAt: null });

    db.device.findMany.mockClear();
    db.keyholderNote.findMany.mockClear();
    await listDevicesV2("sub", { includeArchived: true, deviceId: "d1", includeNotes: false });
    expect(db.device.findMany.mock.calls[0][0].where).toEqual({ userId: "u1", id: "d1" });
    expect(db.keyholderNote.findMany).not.toHaveBeenCalled(); // includeNotes:false → kein Notes-Query
  });

  it("liefert die Kategorien mit — sonst gäbe es keine id, an die upsert_device ein Gerät hängen könnte", async () => {
    db.device.findMany.mockResolvedValue([deviceRow("d1", "Flatty")]);
    db.deviceCategory.findMany.mockResolvedValue([categoryRow("c1", "KG", { isBuiltIn: true })]);
    const result = await listDevicesV2("sub");
    expect(result.categories).toEqual([expect.objectContaining({ id: "c1", name: "KG", isKg: true, deviceCount: 1, goalCount: 0 })]);
    expect(result.devices[0].categoryId).toBe("c1");
    expect(result.devices[0].requireInspectionCode).toBe(true);
  });

  it("K-08: pullOffRisk null (nie beurteilt) bleibt null im DTO", async () => {
    db.device.findMany.mockResolvedValue([{ ...deviceRow("d1", "Ali-Collar"), pullOffRisk: null }]);
    const result = await listDevicesV2("sub");
    expect(result.devices[0].pullOffRisk).toBeNull();
  });
});

// N-15 / K-16 (MCP-Restliste 2026-07-17): der V2-dryRun lieferte nur `before` — kein diff/after/
// wouldSucceed, obwohl explain_model „volle Tiefe" versprach. Jetzt spiegelt er die V1-Form.
describe("set_device_meta dryRun — N-15 (diff/after/wouldSucceed) + K-16 (healthFlags-Array)", () => {
  const ctx = { targetUserId: "u1", targetUsername: "sub" };
  // resolveDevice liest über device.findMany (metaResolveSelect).
  const metaRow = (over: Record<string, unknown> = {}) => ({
    id: "d1", name: "Flatty", version: 1, archivedAt: null, securityLevel: null, lookalikeClusterId: null,
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

  it("K-09: archived:true → diff {archived:[false,true]}", async () => {
    db.device.findMany.mockResolvedValue([metaRow()]);
    const res = await run({ deviceName: "Flatty", archived: true });
    expect(res.diff).toEqual({ archived: [false, true] });
    expect(res.after.archived).toBe(true);
  });

  it("K-08: pullOffRisk auf null setzen (nie beurteilt) → diff [false,null]", async () => {
    db.device.findMany.mockResolvedValue([metaRow({ pullOffRisk: false })]);
    const res = await run({ deviceName: "Flatty", pullOffRisk: null });
    expect(res.diff).toEqual({ pullOffRisk: [false, null] });
  });
});

// Inventar-Schreiben (v5): upsert_device deckt Name/Beschreibung/Kategorie/Preis/Code-Pflicht ab,
// set_device_meta bleibt für die Beurteilungs-Felder zuständig.
describe("upsert_device — Guardrails + dryRun", () => {
  const ctx = { targetUserId: "u1", targetUsername: "sub" };
  const inventoryRow = (over: Record<string, unknown> = {}) => ({
    id: "d1", name: "Flatty", version: 3, archivedAt: null, description: null,
    categoryId: "c1", purchasePrice: null, currency: null, requireInspectionCode: true, ...over,
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const run = (args: Record<string, unknown>) =>
    executeWrite(upsertDeviceDef, ctx, args as never, { reason: "test", dryRun: true }) as Promise<any>;

  it("Anlegen ohne name wird abgelehnt", async () => {
    await expect(run({})).rejects.toThrow(/requires `name`/);
  });

  it("expectedVersion ist ein Edit-Token — beim Anlegen ungültig", async () => {
    await expect(run({ name: "Neu", expectedVersion: 1 })).rejects.toThrow(/expectedVersion only applies to edits/);
  });

  it("Preis ohne Währung wird abgelehnt — auch wenn nur der Preis im Aufruf steht", async () => {
    db.device.findFirst.mockResolvedValue(inventoryRow());
    await expect(run({ id: "d1", purchasePrice: 89 })).rejects.toThrow(/requires a currency/);
  });

  it("Preis erbt die BESTEHENDE Währung — die Prüfung läuft auf dem projizierten Zustand", async () => {
    db.device.findFirst.mockResolvedValue(inventoryRow({ currency: "CHF" }));
    const res = await run({ id: "d1", purchasePrice: 89 });
    expect(res.wouldSucceed).toBe(true);
    expect(res.diff).toEqual({ purchasePrice: [null, 89] });
  });

  it("unbekannte Kategorie wird abgelehnt (Service-Schicht, nicht nachgebaut)", async () => {
    db.deviceCategory.findUnique.mockResolvedValue(null);
    await expect(run({ name: "Neu", categoryId: "fremd" })).rejects.toThrow(/Invalid category/);
  });

  it("archiviertes Gerät ist nicht bearbeitbar und verweist auf set_device_meta", async () => {
    db.device.findFirst.mockResolvedValue(inventoryRow({ archivedAt: new Date("2026-07-01T00:00:00Z") }));
    await expect(run({ id: "d1", name: "Neu" })).rejects.toThrow(/archived .* set_device_meta/);
  });

  it("Versions-Konflikt schlägt schon im dryRun zu", async () => {
    db.device.findFirst.mockResolvedValue(inventoryRow({ version: 4 }));
    await expect(run({ id: "d1", name: "Neu", expectedVersion: 3 })).rejects.toThrow(/Version conflict/);
  });

  it("trimmt den Namen und leert die Beschreibung über null", async () => {
    db.device.findFirst.mockResolvedValue(inventoryRow({ description: "alt" }));
    const res = await run({ id: "d1", name: "  Flatty II  ", description: null });
    expect(res.diff).toEqual({ name: ["Flatty", "Flatty II"], description: ["alt", null] });
    expect(db.device.update).not.toHaveBeenCalled();
  });

  it("No-op-Edit → leerer diff", async () => {
    db.device.findFirst.mockResolvedValue(inventoryRow());
    expect((await run({ id: "d1" })).diff).toEqual({});
  });
});

describe("delete_device — löschen oder archivieren", () => {
  const ctx = { targetUserId: "u1", targetUsername: "sub" };
  const metaRow = (over: Record<string, unknown> = {}) => ({
    id: "d1", name: "Flatty", version: 1, archivedAt: null, imageUrl: null,
    securityLevel: null, lookalikeClusterId: null,
    pullOffRisk: false, material: null, bauform: null, healthFlags: null, retentionNotes: null, ...over,
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const run = (args: Record<string, unknown>) =>
    executeWrite(deleteDeviceDef, ctx, args as never, { reason: "test", dryRun: true }) as Promise<any>;

  // Auflösung per NAME liest über device.findMany, per id über device.findFirst — beide Wege
  // stubben, sonst greift ein Test still auf den Rückgabewert eines anderen zu.
  const stubDevice = (row: Record<string, unknown>) => {
    db.device.findMany.mockResolvedValue([row]);
    db.device.findFirst.mockResolvedValue(row);
  };

  it("ohne Einträge kündigt die Vorschau ein hartes Löschen an", async () => {
    stubDevice(metaRow());
    db.entry.count.mockResolvedValue(0);
    expect((await run({ deviceName: "Flatty" })).preview).toEqual({
      action: "delete", outcome: "deleted", device: "Flatty", entryCount: 0, alreadyArchived: false,
    });
  });

  it("mit Einträgen wird archiviert statt gelöscht — die Historie bleibt", async () => {
    stubDevice(metaRow());
    db.entry.count.mockResolvedValue(12);
    expect((await run({ deviceId: "d1" })).preview).toEqual({
      action: "archive", outcome: "archived", device: "Flatty", entryCount: 12, alreadyArchived: false,
    });
  });

  it("ein bereits archiviertes Gerät wird NICHT nachträglich hart gelöscht", async () => {
    stubDevice(metaRow({ archivedAt: new Date("2026-07-01T00:00:00Z") }));
    db.entry.count.mockResolvedValue(0);
    expect((await run({ deviceId: "d1" })).preview).toMatchObject({ action: "archive", alreadyArchived: true });
  });

  it("ohne Referenz (weder id noch Name) wird abgelehnt", async () => {
    await expect(run({})).rejects.toThrow(/Device reference required/);
  });
});
