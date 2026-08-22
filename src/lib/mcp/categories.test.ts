import { describe, it, expect, vi, beforeEach } from "vitest";

// Kategorien über den MCP (v5): anlegen/ändern/löschen laufen durch DIESELBE Regel-Schicht wie die
// Oberfläche (deviceCategoryService) — diese Tests halten fest, dass hier keine zweite Prüfkette
// entstanden ist, die dem Keyholder mehr oder weniger erlaubt als das Formular.

vi.mock("@/lib/prisma", async () => {
  const { createPrismaMock } = await import("@/test/prismaMock");
  return { prisma: createPrismaMock() };
});

import { upsertCategoryDef, deleteCategoryDef } from "./categories";
import { executeWrite } from "./writeFramework";
import { prisma } from "@/lib/prisma";
import { type PrismaMock } from "@/test/prismaMock";

const db = prisma as unknown as PrismaMock;
const ctx = { targetUserId: "u1", targetUsername: "sub" };

const categoryRow = (over: Record<string, unknown> = {}) => ({
  id: "c1", name: "Plug", slug: "plug", color: "cat-plum", icon: "Circle", isBuiltIn: false,
  trackingEnabled: true, requirePhoto: false, allowVorgaben: true, sortOrder: 0,
  createdAt: new Date("2026-06-01T00:00:00Z"), _count: { devices: 0, vorgaben: 0 }, ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  db.user.findUnique.mockResolvedValue({ id: "u1", username: "sub", timezone: "Europe/Zurich" });
});

describe("upsert_category — Guardrails + dryRun", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const run = (args: Record<string, unknown>) =>
    executeWrite(upsertCategoryDef, ctx, args as never, { reason: "test", dryRun: true }) as Promise<any>;

  it("Anlegen ohne name wird abgelehnt", async () => {
    await expect(run({})).rejects.toThrow(/requires `name`/);
  });

  it("firstDeviceName gehört zum Anlegen, nicht zum Ändern", async () => {
    await expect(run({ id: "c1", firstDeviceName: "Plug S" })).rejects.toThrow(/only applies when creating/);
  });

  it("ein LEER mitgeschicktes firstDeviceName blockiert das Umbenennen nicht", async () => {
    db.deviceCategory.findFirst.mockResolvedValue(categoryRow());
    const res = await run({ id: "c1", name: "Plug XL", firstDeviceName: "" });
    expect(res.diff).toEqual({ name: ["Plug", "Plug XL"] });
  });

  it("ungültige Farbe wird abgelehnt (dieselbe Prüfung wie das Formular)", async () => {
    await expect(run({ name: "Plug", color: "knallrot" })).rejects.toThrow(/Invalid color/);
  });

  it("Anlegen kündigt Name, abgeleiteten Slug und erstes Gerät an", async () => {
    expect((await run({ name: "  Plug  ", firstDeviceName: "Plug S" })).preview).toEqual({
      action: "create", name: "Plug", slug: "plug", firstDeviceName: "Plug S",
    });
  });

  it("ist der Namensraum erschöpft, sagt das schon der dryRun — nicht erst der Commit", async () => {
    // 1 + 98 belegte Slugs: "plug" selbst und "plug-2" … "plug-99".
    db.deviceCategory.findMany.mockResolvedValue([
      { slug: "plug" },
      ...Array.from({ length: 98 }, (_, i) => ({ slug: `plug-${i + 2}` })),
    ]);
    const res = await run({ name: "Plug" });
    expect(res.wouldSucceed).toBe(false);
    expect(res.problem).toMatch(/no free slug for "plug"/);
  });

  it("legt die drei Regeln um und zeigt sie im diff", async () => {
    db.deviceCategory.findFirst.mockResolvedValue(categoryRow());
    const res = await run({ id: "c1", trackingEnabled: false, name: "Inventar" });
    expect(res.wouldSucceed).toBe(true);
    expect(res.diff).toEqual({ trackingEnabled: [true, false], name: ["Plug", "Inventar"] });
    expect(db.deviceCategory.update).not.toHaveBeenCalled();
  });

  it("an der eingebauten KG-Kategorie sind die Regeln auch für den Keyholder unveränderlich", async () => {
    db.deviceCategory.findFirst.mockResolvedValue(categoryRow({ id: "kg", name: "KG", slug: "kg", isBuiltIn: true }));
    await expect(run({ id: "kg", requirePhoto: true })).rejects.toThrow(/built-in KG category are immutable/);
  });

  it("ihre Beschriftung bleibt änderbar", async () => {
    db.deviceCategory.findFirst.mockResolvedValue(categoryRow({ id: "kg", name: "KG", slug: "kg", isBuiltIn: true }));
    const res = await run({ id: "kg", name: "Gürtel", sortOrder: 3 });
    expect(res.diff).toEqual({ name: ["KG", "Gürtel"], sortOrder: [0, 3] });
  });

  it("das blosse MITSCHICKEN einer unveränderten Regel ist keine Änderung", async () => {
    db.deviceCategory.findFirst.mockResolvedValue(categoryRow({ id: "kg", name: "KG", slug: "kg", isBuiltIn: true }));
    const res = await run({ id: "kg", name: "Gürtel", trackingEnabled: true });
    expect(res.diff).toEqual({ name: ["KG", "Gürtel"] });
  });

  it("No-op-Edit → leerer diff", async () => {
    db.deviceCategory.findFirst.mockResolvedValue(categoryRow());
    expect((await run({ id: "c1" })).diff).toEqual({});
  });
});

describe("delete_category — Löschschranken", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const run = (args: Record<string, unknown>) =>
    executeWrite(deleteCategoryDef, ctx, args as never, { reason: "test", dryRun: true }) as Promise<any>;

  // `vi.clearAllMocks()` leert nur die Aufruf-Listen, nicht die gesetzten Rückgaben — ohne dieses
  // Zurücksetzen schleppte ein Test mit Verweisen seine Zählungen in den nächsten.
  beforeEach(() => {
    db.device.count.mockResolvedValue(0);
    db.trainingVorgabe.count.mockResolvedValue(0);
  });

  it("die eingebaute Kategorie ist nicht löschbar", async () => {
    db.deviceCategory.findFirst.mockResolvedValue(categoryRow({ id: "kg", name: "KG", slug: "kg", isBuiltIn: true }));
    const res = await run({ id: "kg" });
    expect(res.wouldSucceed).toBe(false);
    expect(res.problem).toMatch(/built-in KG category cannot be deleted/);
  });

  it("verknüpfte Geräte und Trainingsziele blockieren — mit Zahlen", async () => {
    db.deviceCategory.findFirst.mockResolvedValue(categoryRow());
    db.device.count.mockResolvedValue(2);
    db.trainingVorgabe.count.mockResolvedValue(1);
    const res = await run({ id: "c1" });
    expect(res.wouldSucceed).toBe(false);
    expect(res.problem).toMatch(/2 device\(s\), 1 training goal\(s\)/);
  });

  it("frei von Verweisen → wouldSucceed", async () => {
    db.deviceCategory.findFirst.mockResolvedValue(categoryRow());
    const res = await run({ id: "c1" });
    expect(res.wouldSucceed).toBe(true);
    expect(res.preview).toEqual({ action: "delete", category: "Plug", deviceCount: 0, goalCount: 0 });
  });

  it("Auflösung per Name, wenn keine id vorliegt", async () => {
    db.deviceCategory.findMany.mockResolvedValue([categoryRow()]);
    expect((await run({ categoryName: "plug" })).wouldSucceed).toBe(true);
  });

  it("ohne Referenz wird abgelehnt", async () => {
    await expect(run({})).rejects.toThrow(/pass `id` or `categoryName`/);
  });
});
