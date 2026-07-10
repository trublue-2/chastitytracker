import { describe, it, expect, vi, beforeEach } from "vitest";

// Feldbestand UND Schlüsselreihenfolge von `get_overview` sind Vertrag gegenüber bestehenden
// MCP-Clients. TypeScript prüft nur den Feldbestand, nie die REIHENFOLGE — die fängt allein dieser
// Test. Er ist zugleich das Netz unter dem Umbau, der die Live-Zustands-Ableitungen nach
// `mcp/liveState.ts` verschoben hat: dort wurde jeder Mapper nur durch Lesen gegengeprüft.
vi.mock("@/lib/prisma", async () => {
  const { createPrismaMock } = await import("@/test/prismaMock");
  return { prisma: createPrismaMock() };
});

import { buildOverview } from "./mcpOverview";
import { prisma } from "@/lib/prisma";
import { TEST_USER, type PrismaMock } from "@/test/prismaMock";

const db = prisma as unknown as PrismaMock;

/** Die V1-Antwort von get_overview, in exakt dieser Reihenfolge. Änderungen hier sind
 *  Vertragsänderungen — bestehende MCP-Clients lesen diese Felder. */
const OVERVIEW_KEYS = [
  "schemaVersion",
  "user",
  "generatedAt",
  "timezone",
  "keyholderInstructions",
  "lock",
  "wearingHoursKg",
  "trainingGoalKg",
  "reinigung",
  "autoKontrolle",
  "categories",
  "openKontrolle",
  "lastKontrolle",
  "activeSperrzeit",
  "openVerschlussAnforderung",
  "openOrgasmusAnforderung",
  "sessionSummary",
  "penalties",
  "activeWearSessions",
  "keyholderNotes",
];

beforeEach(() => {
  vi.clearAllMocks();
  // Alles andere kommt aus den Leer-Defaults des Mocks (findMany → [], findFirst → null, count → 0):
  // der Snapshot prüft die Form der Antwort, nicht die Werte. Das Neusetzen ist Pflicht — ein Test
  // unten stubbt findUnique auf null, und clearAllMocks löscht nur Call-History, nicht die Impl.
  db.user.findUnique.mockResolvedValue(TEST_USER);
});

describe("buildOverview — V1-Vertrag (get_overview)", () => {
  it("liefert exakt die Vertragsfelder in der Vertragsreihenfolge", async () => {
    const result = await buildOverview("sub");
    expect(Object.keys(result)).toEqual(OVERVIEW_KEYS);
  });

  it("behält die Ziel-Felder auch ohne aktive Vorgabe (Wert null, Schlüssel vorhanden)", async () => {
    // getActiveVorgabe → null: trainingGoalKg ist dann null, darf aber NICHT verschwinden.
    const result = await buildOverview("sub");
    expect(result.trainingGoalKg).toBeNull();
    expect(result.wearingHoursKg).toEqual({ today: 0, week: 0, month: 0 });
    expect(result.categories).toEqual([]);
  });

  it("wirft bei unbekanntem User", async () => {
    db.user.findUnique.mockResolvedValue(null);
    await expect(buildOverview("niemand")).rejects.toThrow(/User not found/);
  });
});
