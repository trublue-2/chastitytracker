import { describe, it, expect } from "vitest";
import { goalOutlook } from "@/lib/goalOutlook";

const H = 3_600_000;

describe("goalOutlook — steht der Träger gut da?", () => {
  it("ohne Ziel gibt es nichts zu bewerten", () => {
    expect(goalOutlook(5, 0, 10 * H)).toBeNull();
    expect(goalOutlook(5, -1, 10 * H)).toBeNull();
    expect(goalOutlook(5, NaN, 10 * H)).toBeNull();
  });

  it("erreicht bleibt erreicht, auch wenn der Zeitraum vorbei ist", () => {
    expect(goalOutlook(20, 20, 0)).toEqual({ kind: "reached" });
    expect(goalOutlook(25, 20, -5 * H)).toEqual({ kind: "reached" });
  });

  /** Der Fall, um den es geht: dieselbe Zahl, zwei Lagen. */
  it("dieselben 8h41 von 20h sind morgens gut und abends verloren", () => {
    const actual = 8 + 41 / 60;
    // 09:00 — bis Mitternacht bleiben 15 Stunden, es fehlen 11h19.
    expect(goalOutlook(actual, 20, 15 * H)?.kind).toBe("ahead");
    // 22:00 — es bleiben 2 Stunden, es fehlen unverändert 11h19.
    expect(goalOutlook(actual, 20, 2 * H)?.kind).toBe("missed");
  });

  it("knapp heisst: erreichbar, aber nur bei nahezu durchgehendem Tragen", () => {
    // 11h fehlen, 11h30 bleiben → 30min Puffer, Schwelle ist 1h.
    expect(goalOutlook(9, 20, 11.5 * H)).toEqual({ kind: "tight", missingH: 11 });
    // 11h fehlen, 13h bleiben → 2h Puffer, über der Schwelle.
    expect(goalOutlook(9, 20, 13 * H)?.kind).toBe("ahead");
  });

  it("die Knapp-Schwelle wächst mit dem Ziel, aber nicht ins Uferlose", () => {
    // Jahresziel: 200h fehlen. 10 % wären 20h — gedeckelt auf 12h.
    expect(goalOutlook(300, 500, 210 * H)?.kind).toBe("tight");   // 10h Puffer < 12h
    expect(goalOutlook(300, 500, 215 * H)?.kind).toBe("ahead");   // 15h Puffer > 12h
    // Kleines Ziel: 2h fehlen. 10 % wären 12min — die absolute Stunde greift.
    expect(goalOutlook(0, 2, 2.5 * H)?.kind).toBe("tight");
    expect(goalOutlook(0, 2, 3.5 * H)?.kind).toBe("ahead");
  });

  it("ein abgelaufener Zeitraum hat keine Zukunft mehr", () => {
    // Negative Restzeit darf nicht als Guthaben durchgehen.
    expect(goalOutlook(5, 20, -100 * H)).toEqual({ kind: "missed", missingH: 15 });
  });

  it("nennt immer, wie viel fehlt", () => {
    for (const rest of [0, 5 * H, 100 * H]) {
      const o = goalOutlook(8, 20, rest);
      expect(o).not.toBeNull();
      if (o!.kind !== "reached") expect(o!.missingH).toBeCloseTo(12);
    }
  });
});
