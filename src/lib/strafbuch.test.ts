import { describe, it, expect } from "vitest";
import { isLateLock, reinigungRelockDeadline, isCleaningNotRelocked } from "./strafbuch";

describe("isLateLock", () => {
  const endetAt = new Date("2026-07-09T18:00:00Z");

  it("is late when still open past the deadline", () => {
    const now = new Date("2026-07-09T18:00:01Z");
    expect(isLateLock({ endetAt, fulfilledAt: null }, now)).toBe(true);
  });

  it("is not late when still open before the deadline", () => {
    const now = new Date("2026-07-09T17:59:59Z");
    expect(isLateLock({ endetAt, fulfilledAt: null }, now)).toBe(false);
  });

  it("is late when fulfilled after the deadline", () => {
    const fulfilledAt = new Date("2026-07-09T18:00:01Z");
    expect(isLateLock({ endetAt, fulfilledAt }, new Date("2026-07-10T00:00:00Z"))).toBe(true);
  });

  it("is not late when fulfilled on or before the deadline", () => {
    const fulfilledAt = new Date("2026-07-09T18:00:00Z");
    expect(isLateLock({ endetAt, fulfilledAt }, new Date("2026-07-10T00:00:00Z"))).toBe(false);
  });
});

describe("reinigungRelockDeadline", () => {
  const tz = "Europe/Zurich"; // UTC+2 (CEST) in July

  it("falls back to open time + maxMinuten when no window is configured", () => {
    const openStart = new Date("2026-07-09T18:00:00Z"); // 20:00 Zurich
    expect(reinigungRelockDeadline(openStart, 15, [], tz).toISOString()).toBe("2026-07-09T18:15:00.000Z");
  });

  it("uses the active window's end when the opening falls inside a configured window", () => {
    const openStart = new Date("2026-07-09T18:00:00Z"); // 20:00 Zurich
    const fenster = [{ start: "20:00", end: "22:00" }];
    expect(reinigungRelockDeadline(openStart, 15, fenster, tz).toISOString()).toBe("2026-07-09T20:00:00.000Z");
  });

  it("falls back to maxMinuten when windows are configured but the opening falls outside all of them", () => {
    const openStart = new Date("2026-07-09T18:00:00Z"); // 20:00 Zurich
    const fenster = [{ start: "08:00", end: "09:00" }];
    expect(reinigungRelockDeadline(openStart, 15, fenster, tz).toISOString()).toBe("2026-07-09T18:15:00.000Z");
  });

  it("resolves a window end correctly across a same-day DST transition (spring-forward)", () => {
    // 2026-03-29 is the EU spring-forward day: clocks jump 02:00 CET -> 03:00 CEST at 01:00 UTC.
    // Opening falls pre-transition (01:30 CET, offset +1); the window end (04:00) is post-transition
    // (offset +2). A naive flat-ms-from-midnight calculation would misresolve this.
    const openStart = new Date("2026-03-29T00:30:00Z"); // 01:30 CET
    const fenster = [{ start: "01:30", end: "04:00" }];
    expect(reinigungRelockDeadline(openStart, 15, fenster, tz).toISOString()).toBe("2026-03-29T02:00:00.000Z"); // 04:00 CEST
  });
});

describe("isCleaningNotRelocked", () => {
  const deadline = new Date("2026-07-09T20:15:00Z");

  it("is not-relocked when still open past the deadline", () => {
    expect(isCleaningNotRelocked(deadline, null, new Date("2026-07-09T20:15:01Z"))).toBe(true);
  });

  it("is not flagged when still open before the deadline", () => {
    expect(isCleaningNotRelocked(deadline, null, new Date("2026-07-09T20:14:59Z"))).toBe(false);
  });

  it("is not-relocked when the VERSCHLUSS came after the deadline", () => {
    const relockAt = new Date("2026-07-09T20:15:01Z");
    expect(isCleaningNotRelocked(deadline, relockAt, new Date("2026-07-10T00:00:00Z"))).toBe(true);
  });

  it("is not flagged when the VERSCHLUSS came on or before the deadline", () => {
    const relockAt = new Date("2026-07-09T20:15:00Z");
    expect(isCleaningNotRelocked(deadline, relockAt, new Date("2026-07-10T00:00:00Z"))).toBe(false);
  });
});
