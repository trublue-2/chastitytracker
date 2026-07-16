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

import { deviceStats, type DeviceStatsResult } from "./stats";

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
