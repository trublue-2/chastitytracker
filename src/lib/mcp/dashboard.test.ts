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
    expect(Object.keys(result.nextRelevant).sort()).toEqual(["openControl", "activeLockPeriod", "interruptedLockPeriod", "openOrgasmWindow", "openLockRequest"].sort());
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
    locked: true, // Box soll/ist zu — so ist keyInBox:false der EINZIGE Grund für hardwareEnforced:false
    lockUntil: null,
    keyholderLocked: false,
    battery: 80,
    charging: false,
    lastSyncAt: new Date(),
    offlineOpenHours: 24,
  };

  it("currentRun und boxState melden dieselbe Deklaration (keyInBox:false = Schlüssel beim Sub)", async () => {
    db.entry.findMany.mockResolvedValue([LOCK_ENTRY]);
    db.boxStatus.findFirst.mockResolvedValue(BOX_ROW);

    const result = await keyholderDashboard("sub");

    expect(result.currentRun.isLocked).toBe(true);
    expect(result.currentRun.keyInBox).toBe(false);
    expect(result.boxState?.keyInBox).toBe(false);
    // Box zu (locked:true) UND frisch gesynct — der EINZIGE Grund für keine Vollstreckung ist der
    // Schlüssel beim Sub (keyInBox:false). Genau der Fall, den das Feld erklären soll.
    expect(result.boxState?.hardwareEnforced).toBe(false);
    expect(result.boxState?.staleLock).toBe(false);
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

// hardwareEnforced ist die EINE ehrliche Vollstreckungs-Antwort — online spielt keine Rolle. Sie ist
// nur dann false, wenn ein deterministischer Selbst-Öffner seit dem letzten Sync gefeuert hat
// (staleLock): gecachte Frist verstrichen ODER Offline-Failsafe (offlineOpenHours) erreicht.
describe("hardwareEnforced / staleLock — Vollstreckung minus Selbst-Öffnungen", () => {
  const HOUR = 60 * 60 * 1000;
  const LOCKED_ENTRY = {
    id: "e2",
    type: "VERSCHLUSS",
    startTime: new Date("2026-07-13T20:00:00Z"),
    oeffnenGrund: null,
    orgasmusArt: null,
    kontrollCode: null,
    verifikationStatus: null,
    deviceCheck: null,
    deviceCheckNote: null,
    deviceCheckExpected: null,
    keyInBox: true, // Schlüssel liegt in der Box
    device: null,
  };
  const boxRow = (over: Record<string, unknown>) => ({
    name: "Heimdall", locked: true, lockUntil: null, keyholderLocked: false,
    battery: 80, charging: false, lastSyncAt: new Date(), offlineOpenHours: 24, ...over,
  });

  beforeEach(() => {
    db.entry.findMany.mockResolvedValue([LOCKED_ENTRY]);
    db.entry.findFirst.mockResolvedValue(LOCKED_ENTRY); // getCurrentLockKeyInBox
  });

  it("locked + Schlüssel drin + frischer Sync → hardwareEnforced, nicht stale", async () => {
    db.boxStatus.findFirst.mockResolvedValue(boxRow({}));
    const { boxState } = await getBoxState("sub");
    expect(boxState?.hardwareEnforced).toBe(true);
    expect(boxState?.staleLock).toBe(false);
  });

  it("offline länger als offlineOpenHours → staleLock, hardwareEnforced false, SOLL bleibt", async () => {
    db.boxStatus.findFirst.mockResolvedValue(boxRow({ lastSyncAt: new Date(Date.now() - 25 * HOUR) }));
    const { boxState } = await getBoxState("sub");
    expect(boxState?.staleLock).toBe(true);
    expect(boxState?.hardwareEnforced).toBe(false);
    expect(boxState?.locked).toBe(true); // die Absicht bleibt, nur die Vollstreckung ist unbestätigt
  });

  it("verstrichene Frist → staleLock, auch ohne offlineOpenHours-Term", async () => {
    db.boxStatus.findFirst.mockResolvedValue(
      boxRow({ lockUntil: new Date(Date.now() - HOUR), offlineOpenHours: null }),
    );
    const { boxState } = await getBoxState("sub");
    expect(boxState?.staleLock).toBe(true);
    expect(boxState?.hardwareEnforced).toBe(false);
  });

  // Präsenz-Guard (FW 0.2.33): die Box fährt nur mit jemandem am Gerät zu — SOLL („soll zu") und
  // IST („steht offen") können auseinanderliegen. hardwareEnforced folgt dem IST.
  it("SOLL zu, IST offen (wartet auf Präsenz-Fenster) → hardwareEnforced false, nicht stale", async () => {
    db.boxStatus.findFirst.mockResolvedValue(boxRow({ reportedLocked: false }));
    const { boxState } = await getBoxState("sub");
    expect(boxState?.locked).toBe(true); // die Absicht steht
    expect(boxState?.reportedLocked).toBe(false); // aber physisch offen
    expect(boxState?.hardwareEnforced).toBe(false);
    expect(boxState?.staleLock).toBe(false); // nichts zu misstrauen — wir WISSEN, dass sie offen ist
  });

  it("Alt-Zeile ohne IST-Meldung → SOLL gilt als bester Stand (Fallback)", async () => {
    db.boxStatus.findFirst.mockResolvedValue(boxRow({ reportedLocked: null }));
    const { boxState } = await getBoxState("sub");
    expect(boxState?.reportedLocked).toBeNull();
    expect(boxState?.hardwareEnforced).toBe(true); // Fallback aufs SOLL = bisheriges Verhalten
  });
});

// keySecured (A-06, MCP-Befundliste 2026-07-17): die direkte Antwort auf die Frage, die eine
// Alleinzeit-Vorgabe stellt. Bewusst OHNE den effectiveLocked-Fallback von hardwareEnforced — beide
// Seiten müssen explizit `true` sein, sonst ist die Vorgabe nicht bestätigt erfüllt.
describe("keySecured — Käfig zu UND Schlüssel drin, ohne SOLL-Fallback", () => {
  const boxRow = (over: Record<string, unknown>) => ({
    name: "Heimdall", locked: true, lockUntil: null, keyholderLocked: false,
    battery: 80, charging: false, lastSyncAt: new Date(), offlineOpenHours: 24, ...over,
  });
  const entryWithKeyInBox = (keyInBox: boolean | null) => ({
    id: "e2", type: "VERSCHLUSS", startTime: new Date("2026-07-13T20:00:00Z"),
    oeffnenGrund: null, orgasmusArt: null, kontrollCode: null, verifikationStatus: null,
    deviceCheck: null, deviceCheckNote: null, deviceCheckExpected: null, keyInBox, device: null,
  });

  it("reportedLocked:true + keyInBox:true → keySecured true", async () => {
    db.entry.findFirst.mockResolvedValue(entryWithKeyInBox(true));
    db.boxStatus.findFirst.mockResolvedValue(boxRow({ reportedLocked: true }));
    const { boxState } = await getBoxState("sub");
    expect(boxState?.keySecured).toBe(true);
  });

  it("Käfig physisch offen (reportedLocked:false), Schlüssel drin → keySecured false trotz keyInBox:true", async () => {
    db.entry.findFirst.mockResolvedValue(entryWithKeyInBox(true));
    db.boxStatus.findFirst.mockResolvedValue(boxRow({ reportedLocked: false }));
    const { boxState } = await getBoxState("sub");
    expect(boxState?.keySecured).toBe(false);
  });

  it("Käfig zu, Schlüssel beim Sub (keyInBox:false) → keySecured false", async () => {
    db.entry.findFirst.mockResolvedValue(entryWithKeyInBox(false));
    db.boxStatus.findFirst.mockResolvedValue(boxRow({ reportedLocked: true }));
    const { boxState } = await getBoxState("sub");
    expect(boxState?.keySecured).toBe(false);
  });

  it("keine IST-Meldung (reportedLocked:null) → keySecured false, KEIN SOLL-Fallback wie bei hardwareEnforced", async () => {
    db.entry.findFirst.mockResolvedValue(entryWithKeyInBox(true));
    db.boxStatus.findFirst.mockResolvedValue(boxRow({ reportedLocked: null }));
    const { boxState } = await getBoxState("sub");
    expect(boxState?.hardwareEnforced).toBe(true); // Fallback greift hier
    expect(boxState?.keySecured).toBe(false); // hier bewusst nicht — unbestätigt ist nicht gesichert
  });

  // code-review-Fund: reportedLocked:true + keyInBox:true reicht NICHT, wenn die Box sich seit dem
  // letzten Sync deterministisch selbst geöffnet hat (staleLock) — der gemeldete "zu"-Stand gilt dann
  // nicht mehr, dieselbe Bedingung wie bei hardwareEnforced.
  it("reportedLocked:true + keyInBox:true, aber staleLock (Frist verstrichen) → keySecured false", async () => {
    db.entry.findFirst.mockResolvedValue(entryWithKeyInBox(true));
    db.boxStatus.findFirst.mockResolvedValue(
      boxRow({ reportedLocked: true, lockUntil: new Date(Date.now() - 60 * 60 * 1000) }),
    );
    const { boxState } = await getBoxState("sub");
    expect(boxState?.staleLock).toBe(true);
    expect(boxState?.hardwareEnforced).toBe(false);
    expect(boxState?.keySecured).toBe(false);
  });
});
