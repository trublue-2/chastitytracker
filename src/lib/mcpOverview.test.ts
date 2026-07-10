import { describe, it, expect, vi, beforeEach } from "vitest";

// Feldbestand UND Schlüsselreihenfolge von get_overview sind Vertrag gegenüber bestehenden
// MCP-Clients (siehe Kommentar über buildOverview). `buildOverviewInternal` setzt
// wearingHoursKg/trainingGoalKg/categories über bedingte Spreads ein — für TypeScript unprüfbar
// (`withGoals` ist ein Laufzeit-Wert). Die Laufzeit-Zusicherung in buildOverview fängt einen
// weggefallenen Spread; eine VERSCHOBENE Reihenfolge fängt nur dieser Test.
vi.mock("@/lib/prisma", async () => {
  const { createPrismaMock } = await import("@/test/prismaMock");
  return { prisma: createPrismaMock() };
});

import { buildOverview, buildOverviewLean, LEAN_OMITTED_KEYS } from "./mcpOverview";
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

/** `TrackerOverviewLean = Omit<TrackerOverview, …>` — die Lean-Erwartung wird aus derselben Liste
 *  abgeleitet, damit ein neues Overview-Feld nicht in nur einem der beiden Tests landet.
 *  `LEAN_OMITTED_KEYS` kommt aus der Quelle: Typ, Laufzeit-Zusicherung und Test teilen eine Liste. */
const LEAN_KEYS = OVERVIEW_KEYS.filter((k) => !LEAN_OMITTED_KEYS.some((omitted) => omitted === k));

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

describe("buildOverviewLean — die Variante hinter keyholder_dashboard", () => {
  it("liefert exakt die Vertragsfelder ohne die drei Ziel-Felder", async () => {
    // Tauchten die Felder hier wieder auf, wäre die eingesparte Rechnung (buildCategoryWearGoals,
    // calculateWearingHoursByRange, getActiveVorgabe) zurück — der Grund für die Lean-Variante.
    const result = await buildOverviewLean("sub");
    expect(Object.keys(result)).toEqual(LEAN_KEYS);
  });

  it("wirft, wenn der übergebene TrackingContext zu einem anderen User gehört", async () => {
    const ctx = { userId: "fremd", timezone: "Europe/Zurich", entries: [], reinigung: { erlaubt: false, maxMinuten: 15 }, devices: [], now: new Date() };
    await expect(buildOverviewLean("sub", {}, ctx)).rejects.toThrow(/anderen User/);
  });
});
