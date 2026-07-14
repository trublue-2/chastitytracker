import { describe, it, expect } from "vitest";
import { buildDeviceUsage, type UsageDevice } from "./deviceUsage";

const H = 3_600_000;

const devices: UsageDevice[] = [
  { id: "d1", name: "Flatty", purchasePrice: 200, currency: "CHF" },
  { id: "d2", name: "Plug A", purchasePrice: null, currency: null },
];
const deviceById = new Map(devices.map((d) => [d.id, d]));

describe("buildDeviceUsage", () => {
  it("summiert Sessions je Gerät, längste Nutzung zuerst", () => {
    const rows = buildDeviceUsage(
      [
        { deviceId: "d2", durationMs: 2 * H },
        { deviceId: "d1", durationMs: 10 * H },
        { deviceId: "d1", durationMs: 30 * H },
      ],
      deviceById,
      "unbekannt",
    );

    expect(rows.map((r) => r.name)).toEqual(["Flatty", "Plug A"]);  // 40h vor 2h
    expect(rows[0]).toMatchObject({ id: "d1", count: 2, totalMs: 40 * H, avgMs: 20 * H });
    expect(rows[1]).toMatchObject({ id: "d2", count: 1, totalMs: 2 * H, avgMs: 2 * H });
  });

  it("Kosten pro Stunde nur mit Kaufpreis", () => {
    const [flatty, plug] = buildDeviceUsage(
      [
        { deviceId: "d1", durationMs: 40 * H },
        { deviceId: "d2", durationMs: 2 * H },
      ],
      deviceById,
      "unbekannt",
    );

    expect(flatty.costPerHour).toBe(5);        // 200 CHF / 40h
    expect(flatty.currency).toBe("CHF");
    expect(plug.costPerHour).toBeNull();       // kein Kaufpreis hinterlegt
  });

  it("Sessions ohne Gerät werden zu einer Zeile mit dem Unbekannt-Label", () => {
    const rows = buildDeviceUsage(
      [
        { deviceId: null, durationMs: 1 * H },
        { deviceId: null, durationMs: 3 * H },
      ],
      deviceById,
      "(ohne Gerät)",
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: null, name: "(ohne Gerät)", count: 2, totalMs: 4 * H });
    expect(rows[0].costPerHour).toBeNull();
  });

  it("ein gelöschtes/unbekanntes Gerät erfindet keine Kosten", () => {
    const [row] = buildDeviceUsage([{ deviceId: "weg", durationMs: 5 * H }], deviceById, "unbekannt");

    expect(row).toMatchObject({ id: "weg", name: "unbekannt", costPerHour: null, currency: null });
  });

  it("ohne Sessions keine Zeilen", () => {
    expect(buildDeviceUsage([], deviceById, "unbekannt")).toEqual([]);
  });
});
