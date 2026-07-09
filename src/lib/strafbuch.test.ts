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
  it("adds maxMinuten to the open time", () => {
    const openStart = new Date("2026-07-09T20:00:00Z");
    expect(reinigungRelockDeadline(openStart, 15).toISOString()).toBe("2026-07-09T20:15:00.000Z");
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
