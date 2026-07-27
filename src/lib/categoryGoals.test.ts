import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", async () => {
  const { createPrismaMock } = await import("@/test/prismaMock");
  return { prisma: createPrismaMock() };
});

vi.mock("@/lib/queries", () => ({
  getNonKgTrackingCategories: vi.fn(),
  getWearEntries: vi.fn(),
  getUserTimezone: vi.fn(),
}));

import { buildCategoryWearGoals } from "./categoryGoals";
import { getNonKgTrackingCategories, getUserTimezone } from "@/lib/queries";
import type { SegmentEntry } from "@/lib/sessionModel";

/**
 * Die Kategorie-Stunden lagen auf dem CH-Tag, während der Zwilling `buildCategoryRows` die Zeitzone
 * der Sub lud — dieselbe Karte konnte so „heute" zweimal verschieden meinen. Die Zeitzone kommt
 * bewusst aus der Funktion selbst (wie im Zwilling), also prüft der Test sie über `getUserTimezone`.
 */
describe("buildCategoryWearGoals — Tages- und Wochengrenze in der Zeitzone der Sub", () => {
  const CATEGORY = { id: "c1", name: "Plug", color: "#fff", icon: "plug" };
  const DEVICE = { id: "d1", name: "Plug A", categoryId: "c1" };

  // Durchgehend getragen seit dem 01.07. — die Stunden hängen allein an der Periodengrenze.
  const entries: SegmentEntry[] = [
    { id: "w1", type: "WEAR_BEGIN", startTime: new Date("2026-07-01T00:00:00Z"), device: DEVICE },
  ];
  const NOW = new Date("2026-07-10T23:00:00Z"); // Auckland: 11.07. 11:00 · Zürich: 11.07. 01:00

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getNonKgTrackingCategories).mockResolvedValue([CATEGORY]);
    // `getWearEntries` bleibt ungestubbt: alle Fälle hier geben `prefetchedEntries` mit, die Query
    // läuft also gar nicht. Ein Stub würde Abdeckung vortäuschen, die es nicht gibt.
  });

  const tagHFor = async (tz: string) => {
    vi.mocked(getUserTimezone).mockResolvedValue(tz);
    const [row] = await buildCategoryWearGoals("u1", NOW, entries);
    return row.tagH;
  };

  it("die Auckland-Sub ist seit 11 Stunden im neuen Tag, die Zürcher erst seit einer", async () => {
    expect(await tagHFor("Pacific/Auckland")).toBeCloseTo(11, 5);
    expect(await tagHFor("Europe/Zurich")).toBeCloseTo(1, 5);
  });

  it("ohne durchgereichte Zeitzone lädt die Funktion sie selbst", async () => {
    await tagHFor("Pacific/Auckland");
    expect(getUserTimezone).toHaveBeenCalledWith("u1");
  });

  it("eine durchgereichte Zeitzone spart die Query — und gilt", async () => {
    const [row] = await buildCategoryWearGoals("u1", NOW, entries, "Pacific/Auckland");
    expect(row.tagH).toBeCloseTo(11, 5);
    expect(getUserTimezone).not.toHaveBeenCalled();
  });
});
