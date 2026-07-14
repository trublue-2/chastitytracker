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

import { keyholderDashboard, getBoxState } from "./dashboard";
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
      ["isLocked", "since", "durationHours", "deviceName", "personalBestHours", "vsPersonalBestPct", "todayIncludesPriorSession", "keyInBox"].sort(),
    );
    expect(Object.keys(result.nextRelevant).sort()).toEqual(["openControl", "activeLockPeriod", "interruptedLockPeriod", "openOrgasmWindow"].sort());
  });

  it("wirft bei unbekanntem User", async () => {
    db.user.findUnique.mockResolvedValue(null);
    await expect(keyholderDashboard("niemand")).rejects.toThrow(/User not found/);
  });
});

// Die Schlüssel-Deklaration erscheint an ZWEI Stellen der Antwort (currentRun + boxState) und in
// einem eigenen Tool (get_box_state). Sie werden verschieden hergeleitet — in-memory aus den Paaren
// bzw. per Query auf den jüngsten KG-Eintrag. Widersprächen sie sich, läse der Keyholder je nach
// Blickwinkel eine andere Antwort auf „liegt der Schlüssel in der Box?".
describe("keyInBox — eine Deklaration, überall dieselbe Antwort", () => {
  const LOCK_ENTRY = {
    id: "e1",
    type: "VERSCHLUSS",
    startTime: new Date("2026-07-13T20:00:00Z"),
    oeffnenGrund: null,
    orgasmusArt: null,
    kontrollCode: null,
    verifikationStatus: null,
    deviceCheck: null,
    deviceCheckNote: null,
    deviceCheckExpected: null,
    keyInBox: false,
    device: null,
  };
  const BOX_ROW = {
    name: "Heimdall",
    locked: false,
    lockUntil: null,
    keyholderLocked: false,
    battery: 80,
    charging: false,
    lastSyncAt: new Date(),
  };

  it("currentRun und boxState melden dieselbe Deklaration (keyInBox:false = Schlüssel beim Sub)", async () => {
    db.entry.findMany.mockResolvedValue([LOCK_ENTRY]);
    db.boxStatus.findFirst.mockResolvedValue(BOX_ROW);

    const result = await keyholderDashboard("sub");

    expect(result.currentRun.isLocked).toBe(true);
    expect(result.currentRun.keyInBox).toBe(false);
    expect(result.boxState?.keyInBox).toBe(false);
    // Genau der Fall, den das Feld erklären soll: verschlossen, aber NICHT hardware-vollstreckt.
    expect(result.boxState?.hardwareEnforcedEffective).toBe(false);
  });

  it("get_box_state liefert dieselbe Deklaration wie das Dashboard", async () => {
    db.entry.findMany.mockResolvedValue([LOCK_ENTRY]);
    db.entry.findFirst.mockResolvedValue(LOCK_ENTRY); // getCurrentLockKeyInBox (jüngster KG-Eintrag)
    db.boxStatus.findFirst.mockResolvedValue(BOX_ROW);

    const [dash, box] = await Promise.all([keyholderDashboard("sub"), getBoxState("sub")]);
    expect(box.boxState?.keyInBox).toBe(dash.boxState?.keyInBox);
    expect(box.boxState?.keyInBox).toBe(false);
  });

  it("ohne Box bleibt boxState null — die Deklaration erfindet keine Box", async () => {
    db.entry.findMany.mockResolvedValue([LOCK_ENTRY]);
    db.entry.findFirst.mockResolvedValue(LOCK_ENTRY);
    // Explizit, nicht per Default: `clearAllMocks` löscht Aufrufe, nicht Implementierungen — die
    // Box-Zeile des vorherigen Tests würde sonst durchschlagen.
    db.boxStatus.findFirst.mockResolvedValue(null);

    expect((await getBoxState("sub")).boxState).toBeNull();
    expect((await keyholderDashboard("sub")).boxState).toBeNull();
  });
});
