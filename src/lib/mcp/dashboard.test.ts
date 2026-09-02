import { describe, it, expect, vi, beforeEach } from "vitest";

// keyholder_dashboard (schemaVersion 3) komponiert ein knappes Dutzend Aggregate. Die Reihenfolge
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

import { keyholderDashboard, getBoxState, NOTE_TEXT_LIMIT } from "./dashboard";
import { prisma } from "@/lib/prisma";
import { TEST_USER, type PrismaMock } from "@/test/prismaMock";

const db = prisma as unknown as PrismaMock;

const DASHBOARD_KEYS = [
  "schemaVersion",
  "user",
  // Rein additiv (kein Versions-Bump): `null`, wo das Gewichtstracking nicht freigeschaltet ist.
  "weight",
  "generatedAt",
  "timezone",
  "toolsFingerprint",
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
  "notesOmitted",
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
    expect(result.schemaVersion).toBe(20); // v20: standingDirectives/boundaries stehen gekappt (NOTE_TEXT_LIMIT, Marker textTruncated) und sind per includeNotes:false abbestellbar (notesOmitted) — `text` trug bis dahin immer den Volltext; v19: scheduledDirectives[].wirksamAb → scheduledFor; v18: dauerH→minDurationHours, beginntAt→beginsAt (Eingang und Ausgang gleich); v17: `endetAt` heisst `endsAt` (Englisch an der MCP-Oberfläche); v16: auch goal*H ist null, wo eine Zielgrenze in der Periode liegt; v15 trug zwei Umdeutungen desselben Tages: goals folgt period_summary v3 — Prozentwerte null, wo eine Zielgrenze in der Periode liegt (goalChangedInPeriod), Tagesziel am Anbruchtag null; und `weight` folgt dem Zielgewicht — corridor/breach weg, target/remainingKg/reached an ihrer Stelle; v14: die Orgasmus-Anweisung ist terminierbar — openOrgasmWindow zeigt nur noch GELTENDE Fenster, geplante stehen in scheduledDirectives (kind: orgasm); v13: späte Annahme rettet — der Zustand einer Aufgabe ist nach einer verstrichenen Nachweis-Frist nicht mehr endgültig; v12: Nachweise mit eigener Fälligkeit — je Nachweis `dueAt`; eine Aufgabe kann seither MITTEN in ihrer Laufzeit versäumt sein und aus openTasks fallen (der damals mit angekündigte Nachweis-Zustand `overdue` kommt dort nie vor, korrigiert 16.08.2026); v11: openTasks zeigt nur noch AUSGELÖSTE Aufgaben — terminierte stehen in scheduledDirectives; v10: openTasks.holdUntil ist das WIRKSAME Ende (Dauer-Modus: startedAt + holdDurationMin); v9: openControl → openControls (je Ziel eine Kontrolle); v8: openTasks enthält auch `awaitingReview` (+ awaitingYourReview); v7: openControl.code nullable; v6: openLockRequest = die DRINGENDSTE von mehreren
    // Die Keyholder-Regeln reicht das Dashboard aus dem (lean) Overview durch.
    expect(result.keyholderInstructions).toBe(TEST_USER.mcpKeyholderInstructions);
  });

  it("currentRun und nextRelevant behalten ihre Unterfelder", async () => {
    const result = await keyholderDashboard("sub");
    expect(Object.keys(result.currentRun).sort()).toEqual(
      ["isLocked", "since", "currentSegmentSince", "durationHours", "currentSegmentDurationHours", "deviceName", "deviceDeclared", "deviceConfidence", "personalBestHours", "vsPersonalBestPct", "todayIncludesPriorSession", "keyInBox"].sort(),
    );
    expect(Object.keys(result.nextRelevant).sort()).toEqual(["openControls", "activeLockPeriod", "interruptedLockPeriod", "openOrgasmWindow", "openLockRequest", "openLockRequests", "openTasks"].sort());
  });

  /** Die Grösse des Einstiegs-Calls (#105) — warum sie überhaupt eine Schranke braucht, steht bei
   *  `NOTE_TEXT_LIMIT` in `dashboard.ts`. */
  describe("gepinnte Notizen", () => {
    const note = (over: Record<string, unknown> = {}) => ({
      id: "n1", type: "DIRECTIVE", status: "active", pinned: true, source: "keyholder",
      confidence: null, kg: null, kategorie: null, text: "kurz", doDont: null,
      validFrom: null, validUntil: null, supersedesId: null,
      createdAt: new Date("2026-09-01T10:00:00Z"), version: 1, refs: [],
      ...over,
    });
    const lang = "x".repeat(NOTE_TEXT_LIMIT + 500);

    it("kappt den Fliesstext und sagt es an der Notiz", async () => {
      db.keyholderNote.findMany.mockResolvedValue([note({ text: lang })]);
      const [d] = (await keyholderDashboard("sub")).standingDirectives;
      expect(d.text).toHaveLength(NOTE_TEXT_LIMIT);
      expect(d.textTruncated).toBe(true);
    });

    /** Bei einer BOUNDARY steht die eigentliche Anweisung in `doDont` — sie ist kurz und muss
     *  vollständig ankommen, sonst kappt die Grenze genau dort, wo sie gilt. */
    it("lässt doDont einer Grenze unangetastet", async () => {
      const doDont = JSON.stringify({ do: ["fragen"], dont: ["öffnen"] });
      db.keyholderNote.findMany.mockResolvedValue([note({ type: "BOUNDARY", text: lang, doDont })]);
      const [b] = (await keyholderDashboard("sub")).boundaries;
      expect(b.doDont).toEqual({ do: ["fragen"], dont: ["öffnen"] });
    });

    it("kurze Notizen bleiben unberührt und ohne Marker", async () => {
      db.keyholderNote.findMany.mockResolvedValue([note()]);
      const result = await keyholderDashboard("sub");
      const [d] = result.standingDirectives;
      expect(d.text).toBe("kurz");
      expect(d.textTruncated).toBeUndefined();
      expect(result.notesOmitted).toBe(0);
    });

    /** Weggelassen heisst NICHT „es gibt keine": die Zahl ist der Unterschied, und ohne sie
     *  handelte eine Keyholderin, als gäbe es ihre Grenzen nicht. Sie kommt aus einem `count` —
     *  abgewählte Notizen werden gar nicht erst geladen, sonst spart der Schalter nichts. */
    it("includeNotes:false lädt sie nicht und nennt die Zahl", async () => {
      db.keyholderNote.findMany.mockResolvedValue([note(), note({ id: "n2", type: "BOUNDARY" })]);
      db.keyholderNote.count.mockResolvedValue(2);
      const result = await keyholderDashboard("sub", { includeNotes: false });
      expect(result.standingDirectives).toEqual([]);
      expect(result.boundaries).toEqual([]);
      expect(result.notesOmitted).toBe(2);
      expect(db.keyholderNote.findMany).not.toHaveBeenCalled();
    });
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
// false, wenn der Offline-Failsafe seit dem letzten Sync gefeuert hat (staleLock) ODER die Öffnung
// scharfgestellt ist (openArmed: Frist verstrichen/SOLL offen — seit FW 0.2.34 öffnet die Box dann
// nicht mehr autonom, sondern beim nächsten Knopf/USB; ein Druck genügt, also „hält" sie nicht mehr).
describe("hardwareEnforced / openArmed / staleLock — Vollstreckung minus Selbst-Öffner und Scharfstellung", () => {
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

  it("locked + Schlüssel drin + frischer Sync → hardwareEnforced, nicht stale, nicht scharf", async () => {
    db.boxStatus.findFirst.mockResolvedValue(boxRow({}));
    const { boxState } = await getBoxState("sub");
    expect(boxState?.hardwareEnforced).toBe(true);
    expect(boxState?.staleLock).toBe(false);
    expect(boxState?.hardwareEnforcedReason).toBeNull(); // A-07: true → kein Grund
    expect(boxState?.openArmed).toBe(false);
  });

  it("offline länger als offlineOpenHours → staleLock, hardwareEnforced false, SOLL bleibt", async () => {
    db.boxStatus.findFirst.mockResolvedValue(boxRow({ lastSyncAt: new Date(Date.now() - 25 * HOUR) }));
    const { boxState } = await getBoxState("sub");
    expect(boxState?.staleLock).toBe(true);
    expect(boxState?.hardwareEnforced).toBe(false);
    expect(boxState?.hardwareEnforcedReason).toBe("stale-lock"); // A-07
    expect(boxState?.locked).toBe(true); // die Absicht bleibt, nur die Vollstreckung ist unbestätigt
  });

  it("SOLL offen ohne IST-Report (locked:false, reportedLocked unset) → 'soll-open' (A-07)", async () => {
    db.boxStatus.findFirst.mockResolvedValue(boxRow({ locked: false })); // reportedLocked undefined → effectiveLocked = locked = false
    const { boxState } = await getBoxState("sub");
    expect(boxState?.hardwareEnforced).toBe(false);
    expect(boxState?.hardwareEnforcedReason).toBe("soll-open");
  });

  it("SOLL offen ABER IST noch zu (locked:false, reportedLocked:true) → key/stale gewinnt, NICHT 'soll-open' (A-07 B1)", async () => {
    // effectiveLocked = reportedLocked ?? locked = true → die Box ist wirksam zu; der Grund für
    // hardwareEnforced:false ist der fehlende Schlüssel, nicht das SOLL.
    db.entry.findMany.mockResolvedValue([{ ...LOCKED_ENTRY, keyInBox: false }]);
    db.entry.findFirst.mockResolvedValue({ ...LOCKED_ENTRY, keyInBox: false });
    db.boxStatus.findFirst.mockResolvedValue(boxRow({ locked: false, reportedLocked: true }));
    const { boxState } = await getBoxState("sub");
    expect(boxState?.hardwareEnforced).toBe(false);
    expect(boxState?.hardwareEnforcedReason).toBe("key-not-in-box");
  });

  it("Schlüssel beim Sub (keyInBox:false) → hardwareEnforcedReason 'key-not-in-box' (A-07)", async () => {
    db.entry.findMany.mockResolvedValue([{ ...LOCKED_ENTRY, keyInBox: false }]);
    db.entry.findFirst.mockResolvedValue({ ...LOCKED_ENTRY, keyInBox: false });
    db.boxStatus.findFirst.mockResolvedValue(boxRow({}));
    const { boxState } = await getBoxState("sub");
    expect(boxState?.hardwareEnforced).toBe(false);
    expect(boxState?.hardwareEnforcedReason).toBe("key-not-in-box");
  });

  // FW ≥ 0.2.34: eine verstrichene Frist öffnet die Box nicht mehr von selbst — sie stellt die
  // Öffnung nur scharf. Der gemeldete Zu-Stand bleibt also verlässlich (kein staleLock), aber
  // „hält fest" darf nicht mehr behauptet werden: ein Knopfdruck genügt.
  it("verstrichene Frist → openArmed (nicht staleLock), hardwareEnforced false", async () => {
    db.boxStatus.findFirst.mockResolvedValue(
      boxRow({ lockUntil: new Date(Date.now() - HOUR), offlineOpenHours: null }),
    );
    const { boxState } = await getBoxState("sub");
    expect(boxState?.openArmed).toBe(true);
    expect(boxState?.staleLock).toBe(false);
    expect(boxState?.hardwareEnforced).toBe(false);
  });

  // Der Vorfall vom 16.07: Sperrzeit abgelaufen → Server-SOLL offen, Box (laut IST) noch zu.
  // Früher öffnete sie am Heartbeat ins Leere; jetzt wartet sie scharfgestellt auf den Knopf.
  it("SOLL offen, IST zu → openArmed, hardwareEnforced false", async () => {
    db.boxStatus.findFirst.mockResolvedValue(boxRow({ locked: false, reportedLocked: true }));
    const { boxState } = await getBoxState("sub");
    expect(boxState?.openArmed).toBe(true);
    expect(boxState?.staleLock).toBe(false);
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
    expect(boxState?.hardwareEnforcedReason).toBe("reported-open"); // A-07: locked:true aber IST offen
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

  // reportedLocked:true + keyInBox:true reicht NICHT, wenn die Öffnung scharfgestellt ist (openArmed:
  // Frist verstrichen, Box öffnet beim nächsten Knopf) — der gemeldete "zu"-Stand ist dann nicht mehr
  // gesichert, dieselbe Bedingung wie bei hardwareEnforced (FW 0.2.34: verstrichene Frist → openArmed,
  // nicht mehr staleLock).
  it("reportedLocked:true + keyInBox:true, aber openArmed (Frist verstrichen) → keySecured false", async () => {
    db.entry.findFirst.mockResolvedValue(entryWithKeyInBox(true));
    db.boxStatus.findFirst.mockResolvedValue(
      boxRow({ reportedLocked: true, lockUntil: new Date(Date.now() - 60 * 60 * 1000) }),
    );
    const { boxState } = await getBoxState("sub");
    expect(boxState?.openArmed).toBe(true);
    expect(boxState?.staleLock).toBe(false);
    expect(boxState?.hardwareEnforced).toBe(false);
    expect(boxState?.keySecured).toBe(false);
  });
});
