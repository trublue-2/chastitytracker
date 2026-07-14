import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Eine Sperrzeit kann auf drei Arten enden, und sie sahen alle gleich aus: `withdrawnAt` gesetzt.
 * Damit war für den Keyholder — Mensch wie KI — nicht mehr unterscheidbar, ob eine Konsequenz
 * bewusst erlassen, vom Sub aufgebrochen oder nie gesetzt worden war. Eine 14-Tage-Sperre verschwand
 * spurlos aus dem Dashboard (gemeldet 11.07.2026).
 *
 * `endedReason` hält die Endart fest. Und die wichtigste Regel steht darüber: eine VERMUTETE Öffnung
 * bricht gar nichts.
 */

const tx = {
  verschlussAnforderung: { findMany: vi.fn(), updateMany: vi.fn() },
  user: { findUnique: vi.fn() },
};

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { releaseSperrzeitenOnOpen } from "./queries";
import { mapInterruptedSperrzeit } from "./mcp/liveState";

const NOW = new Date("2026-07-11T17:53:00+02:00");
const fmt = (d: Date) => d.toISOString();

beforeEach(() => {
  vi.clearAllMocks();
  tx.verschlussAnforderung.findMany.mockReset().mockResolvedValue([{ id: "s1", reinigungErlaubt: false }]);
  tx.verschlussAnforderung.updateMany.mockReset().mockResolvedValue({ count: 1 });
  tx.user.findUnique.mockReset().mockResolvedValue({ reinigungErlaubt: false, reinigungsFenster: null, timezone: "Europe/Zurich" });
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asTx = () => tx as any;

describe("releaseSperrzeitenOnOpen", () => {
  it("KERN-BUG 11.07.: eine SYSTEM-Öffnung bricht die Sperrzeit NICHT", async () => {
    // Die Eskalation bucht das Gerät als „vermutlich abgenommen", weil der Sub eine Kontrolle nie
    // beantwortet hat. Das ist keine Handlung des Subs (das Strafbuch schliesst sie aus den
    // unerlaubten Öffnungen aus) und sie öffnet die Box nicht einmal. Zöge sie die Sperrzeit zurück,
    // räumte ausgerechnet ein Versäumnis die Konsequenz aus dem Weg, die es nach sich ziehen soll.
    const broke = await releaseSperrzeitenOnOpen("u1", "AUTO_ENTFERNT", asTx(), "system");

    expect(broke).toBe(false);
    expect(tx.verschlussAnforderung.updateMany).not.toHaveBeenCalled();
    expect(tx.verschlussAnforderung.findMany).not.toHaveBeenCalled(); // gar nicht erst nachgesehen
  });

  it("eine willentliche Öffnung bricht sie — und markiert sie als unterbrochen, nicht als zurückgezogen", async () => {
    const broke = await releaseSperrzeitenOnOpen("u1", "ANDERES", asTx(), "user");

    expect(broke).toBe(true);
    expect(tx.verschlussAnforderung.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["s1"] } },
      data: { withdrawnAt: expect.any(Date), endedReason: "opening" },
    });
  });

  it("ohne laufende Sperrzeit passiert nichts", async () => {
    tx.verschlussAnforderung.findMany.mockResolvedValue([]);
    expect(await releaseSperrzeitenOnOpen("u1", "ANDERES", asTx(), "user")).toBe(false);
    expect(tx.verschlussAnforderung.updateMany).not.toHaveBeenCalled();
  });
});

describe("mapInterruptedSperrzeit", () => {
  it("zeigt das URSPRÜNGLICHE Ende und den Zeitpunkt des Aufbrechens", async () => {
    const view = mapInterruptedSperrzeit(
      { endetAt: new Date("2026-07-25T00:00:00+02:00"), withdrawnAt: NOW, nachricht: "14 Tage, Konsequenz" },
      fmt,
    )!;
    expect(view.originalEndetAt).toBe("2026-07-24T22:00:00.000Z");
    expect(view.indefinite).toBe(false);
    expect(view.interruptedAt).toBe(NOW.toISOString());
    expect(view.message).toBe("14 Tage, Konsequenz");
  });

  it("eine unbefristete Sperrzeit trägt indefinite=true", () => {
    const view = mapInterruptedSperrzeit({ endetAt: null, withdrawnAt: NOW, nachricht: null }, fmt)!;
    expect(view.indefinite).toBe(true);
    expect(view.originalEndetAt).toBeNull();
  });

  it("null bleibt null", () => {
    expect(mapInterruptedSperrzeit(null, fmt)).toBeNull();
    // Ohne withdrawnAt gibt es nichts zu unterbrechen — defensiv, die Query filtert bereits.
    expect(mapInterruptedSperrzeit({ endetAt: null, withdrawnAt: null, nachricht: null }, fmt)).toBeNull();
  });
});
