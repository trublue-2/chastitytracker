import { describe, it, expect } from "vitest";
import { parseOfflineCapture } from "@/lib/offlineCapture";

const NOW = new Date("2026-09-06T12:00:00.000Z");

describe("parseOfflineCapture — die Client-Zeit zählt NUR über das Offline-Flag", () => {
  it("ohne Flag ist es nicht offline — eine mitgelieferte capturedAt allein zählt nicht", () => {
    expect(parseOfflineCapture({ capturedAt: "2026-09-06T09:00:00Z" }, NOW))
      .toEqual({ capturedOffline: false, capturedAt: null });
  });

  it("nur ein echtes `true` zählt — ein truthy-String öffnet den Pfad NICHT", () => {
    // Sonst genügte ein handgeschriebenes `capturedOffline: "true"`, um online rückzudatieren.
    for (const flag of ["true", 1, {}, "yes"] as unknown[]) {
      expect(parseOfflineCapture({ capturedOffline: flag, capturedAt: "2026-09-06T09:00:00Z" }, NOW).capturedOffline)
        .toBe(false);
    }
  });

  it("Flag + lesbare Zeit → die Client-Erfassungszeit wird übernommen", () => {
    const res = parseOfflineCapture({ capturedOffline: true, capturedAt: "2026-09-06T09:00:00.000Z" }, NOW);
    expect(res.capturedOffline).toBe(true);
    expect(res.capturedAt?.toISOString()).toBe("2026-09-06T09:00:00.000Z");
  });

  it("Flag ohne lesbare Zeit → offline, aber ohne Stichtag (dann fällt der Aufrufer auf die Server-Uhr)", () => {
    expect(parseOfflineCapture({ capturedOffline: true }, NOW)).toEqual({ capturedOffline: true, capturedAt: null });
    expect(parseOfflineCapture({ capturedOffline: true, capturedAt: "kein Datum" }, NOW))
      .toEqual({ capturedOffline: true, capturedAt: null });
    expect(parseOfflineCapture({ capturedOffline: true, capturedAt: 123 }, NOW).capturedAt).toBeNull();
  });

  it("eine Erfassungszeit in der ZUKUNFT wird auf die Server-Uhr geklemmt", () => {
    // Eine offline „in der Zukunft" erfasste Handlung gibt es nicht; ein vordatierter Stichtag darf
    // nicht durchrutschen.
    const res = parseOfflineCapture({ capturedOffline: true, capturedAt: "2026-09-06T18:00:00Z" }, NOW);
    expect(res.capturedAt).toEqual(NOW);
  });
});
