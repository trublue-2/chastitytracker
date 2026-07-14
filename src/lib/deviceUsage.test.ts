import { describe, it, expect } from "vitest";
import { buildDeviceUsage, type UsageDevice, type UsageSession } from "./deviceUsage";

const H = 3_600_000;

const devices: UsageDevice[] = [
  { id: "d1", name: "Flatty", purchasePrice: 200, currency: "CHF" },
  { id: "d2", name: "Plug A", purchasePrice: null, currency: null },
];
const deviceById = new Map(devices.map((d) => [d.id, d]));

/** Eine Session; `day` ist der Julitag 2026, an dem sie beginnt (treibt „zuletzt getragen"). */
const s = (deviceId: string | null, hours: number, day = 1): UsageSession => ({
  deviceId,
  durationMs: hours * H,
  start: new Date(`2026-07-${String(day).padStart(2, "0")}T10:00:00Z`),
});

describe("buildDeviceUsage", () => {
  it("summiert Sessions je Gerät, längste Nutzung zuerst", () => {
    const rows = buildDeviceUsage([s("d2", 2), s("d1", 10), s("d1", 30)], deviceById, "unbekannt");

    expect(rows.map((r) => r.name)).toEqual(["Flatty", "Plug A"]);  // 40h vor 2h
    expect(rows[0]).toMatchObject({ id: "d1", count: 2, totalMs: 40 * H, avgMs: 20 * H });
    expect(rows[1]).toMatchObject({ id: "d2", count: 1, totalMs: 2 * H, avgMs: 2 * H });
  });

  it("Median, Min und Max über die EINZELNEN Sessions", () => {
    const [row] = buildDeviceUsage([s("d1", 1), s("d1", 2), s("d1", 9)], deviceById, "unbekannt");

    expect(row).toMatchObject({ count: 3, medianMs: 2 * H, minMs: 1 * H, maxMs: 9 * H });
    expect(row.avgMs).toBe(4 * H);   // Ø 4h ≠ Median 2h: ein Ausreisser zieht den Schnitt hoch
  });

  it("Median bei gerader Anzahl mittelt die beiden mittleren Sessions", () => {
    const [row] = buildDeviceUsage([s("d1", 1), s("d1", 2), s("d1", 4), s("d1", 9)], deviceById, "unbekannt");

    expect(row.medianMs).toBe(3 * H);   // (2h + 4h) / 2
  });

  it("zuletzt getragen = Beginn der jüngsten Session, nicht der zuletzt gelieferten", () => {
    const [row] = buildDeviceUsage(
      [s("d1", 1, 14), s("d1", 2, 3)],   // jüngste zuerst geliefert
      deviceById,
      "unbekannt",
    );

    expect(row.lastWorn).toEqual(new Date("2026-07-14T10:00:00Z"));
  });

  it("Kosten pro Stunde nur mit Kaufpreis", () => {
    const [flatty, plug] = buildDeviceUsage([s("d1", 40), s("d2", 2)], deviceById, "unbekannt");

    expect(flatty.costPerHour).toBe(5);        // 200 CHF / 40h
    expect(flatty.currency).toBe("CHF");
    expect(plug.costPerHour).toBeNull();       // kein Kaufpreis hinterlegt
  });

  it("Sessions ohne Gerät werden zu einer Zeile mit dem Unbekannt-Label", () => {
    const rows = buildDeviceUsage([s(null, 1), s(null, 3)], deviceById, "(ohne Gerät)");

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: null, name: "(ohne Gerät)", count: 2, totalMs: 4 * H });
    expect(rows[0].costPerHour).toBeNull();
  });

  it("ein gelöschtes/unbekanntes Gerät erfindet keine Kosten", () => {
    const [row] = buildDeviceUsage([s("weg", 5)], deviceById, "unbekannt");

    expect(row).toMatchObject({ id: "weg", name: "unbekannt", costPerHour: null, currency: null });
  });

  it("ohne Sessions keine Zeilen", () => {
    expect(buildDeviceUsage([], deviceById, "unbekannt")).toEqual([]);
  });
});
