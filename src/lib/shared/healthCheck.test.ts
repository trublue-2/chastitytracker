import { describe, it, expect } from "vitest";
import { evaluateProbe, type BackendState } from "./healthCheck";

const HOUR = 60 * 60 * 1000;
const up: BackendState = { down: false, lastAlertAt: 0 };

describe("evaluateProbe — Zustandswechsel + stündliche Erinnerung", () => {
  it("up → up: keine Meldung", () => {
    const r = evaluateProbe(up, true, 1000);
    expect(r.action).toBe("none");
    expect(r.next.down).toBe(false);
  });

  it("up → down: einmalige down-Meldung, lastAlertAt gesetzt", () => {
    const r = evaluateProbe(up, false, 5000);
    expect(r.action).toBe("down");
    expect(r.next).toEqual({ down: true, lastAlertAt: 5000 });
  });

  it("down → down innerhalb der Stunde: keine Meldung, lastAlertAt unverändert", () => {
    const prev: BackendState = { down: true, lastAlertAt: 5000 };
    const r = evaluateProbe(prev, false, 5000 + HOUR - 1);
    expect(r.action).toBe("none");
    expect(r.next.lastAlertAt).toBe(5000);
  });

  it("down → down nach ≥1h: Erinnerung, lastAlertAt aktualisiert", () => {
    const prev: BackendState = { down: true, lastAlertAt: 5000 };
    const r = evaluateProbe(prev, false, 5000 + HOUR);
    expect(r.action).toBe("still_down");
    expect(r.next.lastAlertAt).toBe(5000 + HOUR);
  });

  it("down → up: recovered-Meldung", () => {
    const prev: BackendState = { down: true, lastAlertAt: 5000 };
    const r = evaluateProbe(prev, true, 9999);
    expect(r.action).toBe("recovered");
    expect(r.next.down).toBe(false);
  });

  it("Erst-Probe direkt down (frischer State): meldet down", () => {
    const r = evaluateProbe(up, false, 1);
    expect(r.action).toBe("down");
  });
});
