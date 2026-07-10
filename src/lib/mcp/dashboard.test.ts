import { describe, it, expect, vi, beforeEach } from "vitest";

// keyholder_dashboard (schemaVersion 2) komponiert ein knappes Dutzend Aggregate. Die Reihenfolge
// ist hier unkritisch (V2-Clients lesen benannt), deshalb wird nur der FELDBESTAND verglichen.
//
// Anders als bei buildOverview kann hier kein Feld STILL wegfallen: das Rückgabe-Literal von
// keyholderDashboard hat keine bedingten Spreads, der Compiler bewacht `DashboardResult`. Dieser
// Test ist daher (a) Stolperdraht — wer den V2-Vertrag ändert, muss die Liste bewusst mitändern —
// und (b) ein Smoke-Test der gesamten Komposition (buildOverviewLean + records + periodSummary +
// getOffenses + queryNotes + boxState + healthHold laufen wirklich durch).
vi.mock("@/lib/prisma", async () => {
  const { createPrismaMock } = await import("@/test/prismaMock");
  return { prisma: createPrismaMock() };
});

import { keyholderDashboard } from "./dashboard";
import { prisma } from "@/lib/prisma";
import { TEST_USER, type PrismaMock } from "@/test/prismaMock";

const db = prisma as unknown as PrismaMock;

const DASHBOARD_KEYS = [
  "schemaVersion",
  "user",
  "generatedAt",
  "timezone",
  "keyholderInstructions",
  "currentRun",
  "dataDiscrepancies",
  "wornNow",
  "nextRelevant",
  "goals",
  "openOffenses",
  "scheduledDirectives",
  "standingDirectives",
  "boundaries",
  "boxState",
  "healthHold",
];

beforeEach(() => {
  vi.clearAllMocks();
  db.user.findUnique.mockResolvedValue(TEST_USER);
  // loadTrackingData (mcp/common) liest den User über findUniqueOrThrow — der hat keinen Leer-Default.
  db.user.findUniqueOrThrow.mockResolvedValue(TEST_USER);
});

describe("keyholderDashboard — V2-Feldbestand", () => {
  it("liefert exakt die Vertragsfelder", async () => {
    const result = await keyholderDashboard("sub");
    expect(Object.keys(result).sort()).toEqual([...DASHBOARD_KEYS].sort());
    expect(result.schemaVersion).toBe(2);
    // Die Keyholder-Regeln reicht das Dashboard aus dem (lean) Overview durch.
    expect(result.keyholderInstructions).toBe(TEST_USER.mcpKeyholderInstructions);
  });

  it("currentRun und nextRelevant behalten ihre Unterfelder", async () => {
    const result = await keyholderDashboard("sub");
    expect(Object.keys(result.currentRun).sort()).toEqual(
      ["isLocked", "since", "durationHours", "deviceName", "personalBestHours", "vsPersonalBestPct", "todayIncludesPriorSession"].sort(),
    );
    expect(Object.keys(result.nextRelevant).sort()).toEqual(["openControl", "activeLockPeriod", "openOrgasmWindow"].sort());
  });

  it("wirft bei unbekanntem User", async () => {
    db.user.findUnique.mockResolvedValue(null);
    await expect(keyholderDashboard("niemand")).rejects.toThrow(/User not found/);
  });
});
