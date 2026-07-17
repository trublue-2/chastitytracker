import { describe, it, expect, vi } from "vitest";

/**
 * Gemeldet 14.07.2026: `device_stats` zeigte ausschliesslich KG-Geräte. Ein Plug mit sauber
 * geloggtem WEAR_BEGIN→WEAR_END-Zyklus („njoy pure plug large", 14:39–15:56) tauchte NIRGENDS auf —
 * weder unter seinem Namen noch im „ohne Gerät"-Topf. Die Rohdaten waren korrekt; der Aggregator
 * kannte nur VERSCHLUSS/OEFFNEN.
 */

const loadTrackingContext = vi.fn();
// device_stats liest die Kategorien aus IHRER Tabelle (nicht aus den Geräten) — sonst hätte ein
// Sammel-Posten ohne Gerät keine Kategorie.
vi.mock("@/lib/prisma", () => ({
  prisma: {
    deviceCategory: {
      findMany: vi.fn().mockResolvedValue([
        { id: "cat-kg", name: "KG", isBuiltIn: true },
        { id: "cat-plug", name: "Plug", isBuiltIn: false },
        { id: "cat-collar", name: "Halsband", isBuiltIn: false },
      ]),
    },
  },
}));
vi.mock("@/lib/mcp/common", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  loadTrackingContext: (...a: unknown[]) => loadTrackingContext(...a),
}));

import { deviceStats, records, denialTrend, type DeviceStatsResult } from "./stats";

const NOW = new Date("2026-07-14T18:00:00+02:00");
const KG = { id: "cat-kg", name: "KG", isBuiltIn: true };
const PLUG = { id: "cat-plug", name: "Plug", isBuiltIn: false };
const COLLAR = { id: "cat-collar", name: "Halsband", isBuiltIn: false };

const KAEFIG = { id: "d-kg", name: "Flatty", categoryId: KG.id };
const PLUG_DEV = { id: "d-plug", name: "njoy pure plug large", categoryId: PLUG.id };
const COLLAR_DEV = { id: "d-collar", name: "Ali-Collar", categoryId: COLLAR.id };
const PLUG_DEV2 = { id: "d-plug2", name: "Zweiter Plug", categoryId: PLUG.id };

let seq = 0;
const entry = (type: string, time: string, device: object | null) => ({
  id: `e${++seq}`, type, startTime: new Date(time), device,
  oeffnenGrund: null, orgasmusArt: null, kontrollCode: null, verifikationStatus: null,
  deviceCheck: null, deviceCheckNote: null, deviceCheckExpected: null, keyInBox: null,
});

function ctx(entries: object[]) {
  return {
    userId: "u1", timezone: "Europe/Zurich", now: NOW,
    reinigung: { erlaubt: false, maxMinuten: 15 },
    keyholderInstructions: null,
    entries: [...entries].sort((a, b) => (b as { startTime: Date }).startTime.getTime() - (a as { startTime: Date }).startTime.getTime()),
    devices: [
      { id: KAEFIG.id, name: KAEFIG.name, lookalikeClusterId: null },
      { id: PLUG_DEV.id, name: PLUG_DEV.name, lookalikeClusterId: null },
      { id: COLLAR_DEV.id, name: COLLAR_DEV.name, lookalikeClusterId: null },
      { id: PLUG_DEV2.id, name: PLUG_DEV2.name, lookalikeClusterId: null },
    ],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

const rowFor = (r: DeviceStatsResult, name: string) => r.devices.find((d) => d.deviceName === name);

describe("device_stats — alle Kategorien, nicht nur KG", () => {
  it("KERN-BUG 14.07.: der Plug-Zyklus erscheint mit seinen Stunden", async () => {
    const result = await deviceStats("sub", ctx([
      entry("WEAR_BEGIN", "2026-07-14T14:39:00+02:00", PLUG_DEV),
      entry("WEAR_END", "2026-07-14T15:56:00+02:00", PLUG_DEV),
    ]));

    const plug = rowFor(result, "njoy pure plug large");
    expect(plug).toBeDefined();               // vorher: undefined — das war der Bug
    expect(plug!.category).toBe("Plug");
    expect(plug!.sessionCount).toBe(1);
    expect(plug!.totalHours).toBeCloseTo(1.28, 1); // 14:39 → 15:56 = 77 min
  });

  it("KG und Nicht-KG stehen nebeneinander, jeweils mit ihrer Kategorie", async () => {
    const result = await deviceStats("sub", ctx([
      entry("VERSCHLUSS", "2026-07-10T10:00:00+02:00", KAEFIG),
      entry("OEFFNEN", "2026-07-11T10:00:00+02:00", KAEFIG),
      entry("WEAR_BEGIN", "2026-07-14T14:39:00+02:00", PLUG_DEV),
      entry("WEAR_END", "2026-07-14T15:56:00+02:00", PLUG_DEV),
    ]));

    expect(rowFor(result, "Flatty")!.category).toBe("KG");
    expect(rowFor(result, "Flatty")!.totalHours).toBeCloseTo(24, 1);
    expect(rowFor(result, "njoy pure plug large")!.category).toBe("Plug");
    // Nach Gesamtstunden sortiert: der KG-Käfig (24h) vor dem Plug (1.3h).
    expect(result.devices.map((d) => d.deviceName)).toEqual(["Flatty", "njoy pure plug large"]);
  });

  it("jede Kategorie wird EINZELN gepaart — ein Plug-Beginn schliesst keine Halsband-Session", async () => {
    // Verschränkt: Halsband auf, Plug rein+raus, Halsband zu. Bei gemeinsamer Paarung würde der
    // Plug-WEAR_BEGIN die offene Halsband-Session beenden und beide Dauern wären falsch.
    const result = await deviceStats("sub", ctx([
      entry("WEAR_BEGIN", "2026-07-14T10:00:00+02:00", COLLAR_DEV),
      entry("WEAR_BEGIN", "2026-07-14T11:00:00+02:00", PLUG_DEV),
      entry("WEAR_END", "2026-07-14T12:00:00+02:00", PLUG_DEV),
      entry("WEAR_END", "2026-07-14T14:00:00+02:00", COLLAR_DEV),
    ]));

    expect(rowFor(result, "Ali-Collar")!.totalHours).toBeCloseTo(4, 1);           // 10–14
    expect(rowFor(result, "njoy pure plug large")!.totalHours).toBeCloseTo(1, 1); // 11–12
  });


  it("zwei Geräte DERSELBEN Kategorie gleichzeitig — jedes bekommt seine eigene Dauer", async () => {
    // Plug A rein, Plug B rein, Plug A raus. Würde je KATEGORIE gepaart (statt je Gerät), schlösse
    // As WEAR_END auf Bs WEAR_BEGIN: B bekäme As Endzeit, A liefe scheinbar bis jetzt weiter.
    // Beide Dauern wären frei erfunden. Der Live-Zustand (getActiveWearSessions) zählt ebenfalls
    // pro Gerät — die Aggregation muss derselben Wahrheit folgen.
    const result = await deviceStats("sub", ctx([
      entry("WEAR_BEGIN", "2026-07-14T10:00:00+02:00", PLUG_DEV),
      entry("WEAR_BEGIN", "2026-07-14T11:00:00+02:00", PLUG_DEV2),
      entry("WEAR_END", "2026-07-14T12:00:00+02:00", PLUG_DEV),
    ]));

    expect(rowFor(result, "njoy pure plug large")!.totalHours).toBeCloseTo(2, 1); // 10–12, abgeschlossen
    expect(rowFor(result, "Zweiter Plug")!.totalHours).toBeCloseTo(7, 1);         // 11 → JETZT (18:00), noch offen
  });

  it("eine noch LAUFENDE Wear-Session zählt bis jetzt — sonst wäre das getragene Gerät unsichtbar", async () => {
    const result = await deviceStats("sub", ctx([
      entry("WEAR_BEGIN", "2026-07-14T16:00:00+02:00", PLUG_DEV), // kein WEAR_END
    ]));

    const plug = rowFor(result, "njoy pure plug large")!;
    expect(plug.sessionCount).toBe(1);
    expect(plug.totalHours).toBeCloseTo(2, 1); // 16:00 → NOW 18:00
  });

  it("der Sammel-Posten ohne Gerät steht separat in `unassigned` (als KG gekennzeichnet), nicht in devices", async () => {
    const result = await deviceStats("sub", ctx([
      entry("VERSCHLUSS", "2026-07-10T10:00:00+02:00", null),
      entry("OEFFNEN", "2026-07-11T10:00:00+02:00", null),
    ]));

    // v4: kein Pseudo-Gerät mehr zwischen den echten Zeilen — eigenes Feld.
    expect(result.devices.find((d) => d.deviceName === "(ohne Gerät / unzugeordnet)")).toBeUndefined();
    expect(result.unassigned).not.toBeNull();
    expect(result.unassigned!.deviceName).toBe("(ohne Gerät / unzugeordnet)");
    expect(result.unassigned!.category).toBe("KG");
    expect(result.unassigned!.totalHours).toBeCloseTo(24, 1);
  });
});

// ─── Sessions statt Segmente ───────────────────────────────────────────────

describe("device_stats — gezählt werden SESSIONS, nicht Segmente", () => {
  /** Wie `ctx`, aber mit erlaubter Reinigung — sonst beendet jede REINIGUNG-Öffnung die Session. */
  const cleaningCtx = (entries: object[]) => ({
    ...ctx(entries),
    reinigung: { erlaubt: true, maxMinuten: 30 },
  });

  const cleaningOpen = (time: string, device: object | null) => ({
    ...entry("OEFFNEN", time, device),
    oeffnenGrund: "REINIGUNG",
  });

  it("eine Reinigungspause zerlegt EINE Tragezeit nicht in mehrere Sessions", async () => {
    // Käfig 10:00–12:00, Reinigungspause bis 12:15, danach derselbe Käfig weiter bis 14:00.
    // Das ist EINE Session mit zwei Segmenten. Bis v4.50.41 zählte die Spalte die Segmente — der
    // Sub sah zwei „Nutzungen", wo er das Ding nur einmal angelegt hatte.
    const result = await deviceStats("sub", cleaningCtx([
      entry("VERSCHLUSS", "2026-07-14T10:00:00+02:00", KAEFIG),
      cleaningOpen("2026-07-14T12:00:00+02:00", KAEFIG),
      entry("VERSCHLUSS", "2026-07-14T12:15:00+02:00", KAEFIG),
      entry("OEFFNEN", "2026-07-14T14:00:00+02:00", KAEFIG),
    ]));

    const kg = rowFor(result, "Flatty")!;
    expect(kg.sessionCount).toBe(1);
    expect(kg.totalHours).toBe(3.8);   // 2h + 1.75h, auf eine Stelle gerundet — Pause bleibt abgezogen
    expect(kg.maxHours).toBe(3.8);     // längste SESSION, nicht längstes Segment (2h)
  });

  it("wechselt das Gerät über die Pause, zählt die Session für BEIDE Geräte je einmal", async () => {
    // Käfig bis zur Pause, danach ein anderes Gerät — die Session gehört anteilig beiden.
    const result = await deviceStats("sub", cleaningCtx([
      entry("VERSCHLUSS", "2026-07-14T10:00:00+02:00", KAEFIG),
      cleaningOpen("2026-07-14T12:00:00+02:00", KAEFIG),
      entry("VERSCHLUSS", "2026-07-14T12:15:00+02:00", PLUG_DEV),
      entry("OEFFNEN", "2026-07-14T14:00:00+02:00", PLUG_DEV),
    ]));

    expect(rowFor(result, "Flatty")!.sessionCount).toBe(1);
    expect(rowFor(result, "Flatty")!.totalHours).toBeCloseTo(2, 1);
    expect(rowFor(result, "njoy pure plug large")!.sessionCount).toBe(1);
    expect(rowFor(result, "njoy pure plug large")!.totalHours).toBe(1.8);  // 12:15–14:00, gerundet
  });

  it("zwei getrennte Tragezeiten bleiben zwei Sessions", async () => {
    const result = await deviceStats("sub", ctx([
      entry("VERSCHLUSS", "2026-07-10T10:00:00+02:00", KAEFIG),
      entry("OEFFNEN", "2026-07-10T12:00:00+02:00", KAEFIG),
      entry("VERSCHLUSS", "2026-07-12T10:00:00+02:00", KAEFIG),
      entry("OEFFNEN", "2026-07-12T13:00:00+02:00", KAEFIG),
    ]));

    const kg = rowFor(result, "Flatty")!;
    expect(kg.sessionCount).toBe(2);
    expect(kg.totalHours).toBeCloseTo(5, 1);
    expect(kg.minHours).toBeCloseTo(2, 1);
    expect(kg.maxHours).toBeCloseTo(3, 1);
  });
});

// ─── A-14: die ehrliche Dauertrage-Marke ist ein SEGMENT, keine SESSION ────────

describe("records — longestUnbrokenSegmentHours (A-14, MCP-Befundliste 2026-07-17)", () => {
  const cleaningCtx = (entries: object[]) => ({ ...ctx(entries), reinigung: { erlaubt: true, maxMinuten: 30 } });
  const cleaningOpen = (time: string, device: object | null) => ({ ...entry("OEFFNEN", time, device), oeffnenGrund: "REINIGUNG" });

  it("eine Session mit mehreren Segmenten schlägt eine lückenlose Session als Bruttosumme — aber NICHT als Bestmarke", async () => {
    // Session A (geschlossen): 3 Segmente à 2h/1h/1h = 4h Bruttosumme, längstes Einzelsegment 2h.
    // Session B (geschlossen): 1 durchgehendes Segment, 3h — länger als jedes Segment aus A, aber
    // kürzer als A's Bruttosumme. Die ehrliche Bestmarke ist B's 3h, nicht A's 4h und nicht A's
    // grösstes Segment (2h) — der Test beweist, dass ALLE Segmente ALLER Sessions verglichen werden.
    const result = await records("sub", cleaningCtx([
      // Session A: 10:00–12:00 (2h), Pause, 12:15–13:15 (1h), Pause, 13:30–14:30 (1h), OEFFNEN (Ende).
      entry("VERSCHLUSS", "2026-07-10T10:00:00+02:00", KAEFIG),
      cleaningOpen("2026-07-10T12:00:00+02:00", KAEFIG),
      entry("VERSCHLUSS", "2026-07-10T12:15:00+02:00", KAEFIG),
      cleaningOpen("2026-07-10T13:15:00+02:00", KAEFIG),
      entry("VERSCHLUSS", "2026-07-10T13:30:00+02:00", KAEFIG),
      entry("OEFFNEN", "2026-07-10T14:30:00+02:00", KAEFIG),
      // Session B: 20:00–23:00 (3h), durchgehend, ein Segment.
      entry("VERSCHLUSS", "2026-07-10T20:00:00+02:00", KAEFIG),
      entry("OEFFNEN", "2026-07-10T23:00:00+02:00", KAEFIG),
    ]));

    expect(result.longestRunHours).toBe(4); // Session A gewinnt als Bruttosumme
    expect(result.longestUnbrokenSegmentHours).toBe(3); // Session B's einzelnes Segment gewinnt ehrlich
    expect(result.longestUnbrokenSegmentDeviceName).toBe("Flatty");
  });

  it("das aktuell laufende (offene) Segment wird separat gegen die Bestmarke verglichen", async () => {
    const result = await records("sub", cleaningCtx([
      // Abgeschlossenes Bestmarken-Segment: 5h.
      entry("VERSCHLUSS", "2026-07-09T10:00:00+02:00", KAEFIG),
      entry("OEFFNEN", "2026-07-09T15:00:00+02:00", KAEFIG),
      // Aktuell offen seit 1h (now = 2026-07-14T18:00:00+02:00 laut ctx()).
      entry("VERSCHLUSS", "2026-07-14T17:00:00+02:00", KAEFIG),
    ]));

    expect(result.longestUnbrokenSegmentHours).toBe(5);
    expect(result.currentUnbrokenSegmentHours).toBe(1);
    expect(result.currentUnbrokenVsBestPct).toBe(20); // 1h von 5h
  });

  it("ohne abgeschlossenes Segment liefert die Bestmarke null statt 0", async () => {
    const result = await records("sub", cleaningCtx([]));
    expect(result.longestUnbrokenSegmentHours).toBeNull();
    expect(result.longestUnbrokenSegmentEndedAt).toBeNull();
    expect(result.longestUnbrokenSegmentDeviceName).toBeNull();
    expect(result.currentUnbrokenSegmentHours).toBeNull();
    expect(result.currentUnbrokenVsBestPct).toBeNull();
  });
});

// ─── A-10: trendRising robust gegen einen einzelnen Ausreisser ────────────────

describe("denial_trend — trendRising (A-10, MCP-Befundliste 2026-07-17)", () => {
  // Baut ORGASMUS-Einträge aus einer Liste von Intervallen (Stunden), beginnend bei t0.
  const orgasmEntries = (t0: string, intervalsH: number[]) => {
    let t = new Date(t0).getTime();
    const out = [entry("ORGASMUS", new Date(t).toISOString(), null)];
    for (const h of intervalsH) {
      t += h * 3_600_000;
      out.push(entry("ORGASMUS", new Date(t).toISOString(), null));
    }
    return out;
  };

  it("ein einzelner Ausreisser im jüngsten Fenster kippt den ALTEN Mittelwert-Vergleich, aber nicht den MEDIAN-Vergleich", async () => {
    // 5 ältere Intervalle à 150h (Median 150), dann ein Ausreisser (500h) gefolgt von zwei kurzen
    // (100h, 90h) — der eigentliche jüngste Trend fällt, aber der alte Mittelwert-Vergleich
    // (avg(500,100,90)=230 >= avg aller 8 =180) hätte fälschlich "steigend" gemeldet.
    const older = [150, 150, 150, 150, 150];
    const recent = [500, 100, 90];
    const result = await denialTrend("sub", {}, ctx(orgasmEntries("2026-01-01T00:00:00Z", [...older, ...recent])));

    expect(result.recentWindowN).toBe(3);
    expect(result.trendConfidence).toBe("medium"); // n=8
    // MEDIAN(recent)=100 < MEDIAN(older)=150 → fallend, nicht steigend.
    expect(result.trendRising).toBe(false);
  });

  it("weniger als 8 Intervalle → trendRising:null statt einer vorgetäuschten Aussage", async () => {
    const result = await denialTrend("sub", {}, ctx(orgasmEntries("2026-01-01T00:00:00Z", [100, 100, 100, 100, 100])));
    expect(result.trendRising).toBeNull();
    expect(result.trendConfidence).toBe("low");
    expect(result.recentWindowN).toBe(3); // recentAvgIntervalH bleibt informativ befüllt
  });

  it("ohne jeden Orgasmus-Eintrag bleibt alles null (kein n=0-Sonderfall, der 'low' vortäuscht)", async () => {
    const result = await denialTrend("sub", {}, ctx([]));
    expect(result.trendRising).toBeNull();
    expect(result.trendConfidence).toBeNull();
    expect(result.recentWindowN).toBeNull();
    expect(result.avgIntervalH).toBeNull();
  });

  it("≥15 Intervalle → trendConfidence high", async () => {
    const intervals = Array.from({ length: 16 }, () => 100);
    const result = await denialTrend("sub", {}, ctx(orgasmEntries("2026-01-01T00:00:00Z", intervals)));
    expect(result.trendConfidence).toBe("high");
  });

  it("eindeutig steigende Intervalle → trendRising true", async () => {
    const older = [50, 50, 50, 50, 50];
    const recent = [200, 220, 210];
    const result = await denialTrend("sub", {}, ctx(orgasmEntries("2026-01-01T00:00:00Z", [...older, ...recent])));
    expect(result.trendRising).toBe(true);
  });
});
