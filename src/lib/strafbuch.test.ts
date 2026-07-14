import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", async () => {
  const { createPrismaMock } = await import("@/test/prismaMock");
  return { prisma: createPrismaMock() };
});

import { isLateLock, reinigungRelockDeadline, isCleaningNotRelocked, buildStrafbuch } from "./strafbuch";
import { prisma } from "@/lib/prisma";
import type { PrismaMock } from "@/test/prismaMock";

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

/**
 * Das Strafbuch muss dieselbe Regel anwenden wie die Durchsetzung. Einmal tat es das nicht: es prüfte
 * das User-Flag und das Sperrzeit-Flag, aber NICHT das Reinigungsfenster. Eine Reinigungsöffnung
 * ausserhalb des Fensters zog die Sperrzeit zurück (`releaseSperrzeitenOnOpen`) und galt hier
 * trotzdem als erlaubt — kein unerlaubtes Öffnen, stattdessen eine Wiederverschluss-Frist. Die Sperre
 * brach, und nichts stand im Buch.
 */
describe("buildStrafbuch — die Reinigungsöffnung und das Zeitfenster", () => {
  const db = prisma as unknown as PrismaMock;
  const TZ = "Europe/Zurich";

  const USER = {
    reinigungErlaubt: true,
    reinigungMaxProTag: 0, // 0 = unbegrenzt → kein Kontingent-Verstoss dazwischen
    reinigungMaxMinuten: 15,
    reinigungsFenster: [{ start: "19:00", end: "20:00" }],
    timezone: TZ,
  };

  // 2026-07-10 ist CEST (UTC+2).
  const IM_FENSTER = new Date("2026-07-10T17:30:00Z"); // 19:30 Ortszeit
  const NACHTS = new Date("2026-07-10T01:00:00Z"); // 03:00 Ortszeit
  const NOW = new Date("2026-07-10T22:00:00Z");

  /** Aktive, reinigungserlaubte Sperrzeit über den ganzen Tag. */
  const SPERRE = {
    id: "s1",
    createdAt: new Date("2026-07-09T22:00:00Z"),
    endetAt: new Date("2026-07-11T22:00:00Z"),
    withdrawnAt: null,
    reinigungErlaubt: true,
    wirksamAb: null,
    fulfilledAt: null,
  };

  const oeffnung = (startTime: Date) => ({
    id: "e1", type: "OEFFNEN", startTime, oeffnenGrund: "REINIGUNG", note: null, source: "user",
  });

  /** Zwei findMany auf derselben Tabelle (SPERRZEIT + ANFORDERUNG) — nach `art` unterscheiden,
   *  statt sich auf die Aufrufreihenfolge im Promise.all zu verlassen. */
  const mockSperrzeiten = (rows: unknown[]) =>
    db.verschlussAnforderung.findMany.mockImplementation((args: { where?: { art?: string } }) =>
      Promise.resolve(args?.where?.art === "SPERRZEIT" ? rows : []),
    );

  const mockOeffnung = (o: ReturnType<typeof oeffnung>) =>
    db.entry.findMany.mockImplementation((args: { where?: { type?: string } }) =>
      Promise.resolve(args?.where?.type === "OEFFNEN" ? [o] : []),
    );

  beforeEach(() => {
    vi.clearAllMocks();
    db.user.findUnique.mockResolvedValue(USER);
    mockSperrzeiten([SPERRE]);
  });

  it("innerhalb des Fensters: kein unerlaubtes Öffnen", async () => {
    mockOeffnung(oeffnung(IM_FENSTER));
    expect((await buildStrafbuch("u1", NOW)).unauthorizedOpenings).toHaveLength(0);
  });

  it("AUSSERHALB des Fensters: unerlaubtes Öffnen — und KEINE Wiederverschluss-Frist", async () => {
    mockOeffnung(oeffnung(NACHTS));
    const s = await buildStrafbuch("u1", NOW);
    expect(s.unauthorizedOpenings).toHaveLength(1);
    expect(s.unauthorizedOpenings[0].startTime).toEqual(NACHTS);
    // Ein gebrochenes Siegel ist kein versäumter Wiederverschluss.
    expect(s.cleaningNotRelocked).toHaveLength(0);
  });

  it("ohne konfigurierte Fenster ist Reinigung nicht zeitgebunden — auch nachts erlaubt", async () => {
    db.user.findUnique.mockResolvedValue({ ...USER, reinigungsFenster: [] });
    mockOeffnung(oeffnung(NACHTS));
    expect((await buildStrafbuch("u1", NOW)).unauthorizedOpenings).toHaveLength(0);
  });

  it("Öffnungen VOR dem Stichtag werden nicht rückwirkend zu Vergehen", async () => {
    // Das Strafbuch ist eine Live-Ableitung. Ohne Stichtag erschienen mit dem Deploy Vergehen für
    // Handlungen, die es zur Zeit der Tat noch gar nicht gab (die Fenster-Schranke ist neu).
    const VORHER = new Date("2026-07-05T01:00:00Z"); // 03:00 Ortszeit, ausserhalb des Fensters
    mockSperrzeiten([{ ...SPERRE, createdAt: new Date("2026-07-01T00:00:00Z") }]);
    mockOeffnung(oeffnung(VORHER));
    expect((await buildStrafbuch("u1", NOW)).unauthorizedOpenings).toHaveLength(0);
  });

  it("die Sperrzeit verbietet Reinigung: unerlaubtes Öffnen, auch im Fenster", async () => {
    mockSperrzeiten([{ ...SPERRE, reinigungErlaubt: false }]);
    mockOeffnung(oeffnung(IM_FENSTER));
    expect((await buildStrafbuch("u1", NOW)).unauthorizedOpenings).toHaveLength(1);
  });

  it("der User darf gar nicht reinigen: unerlaubtes Öffnen, auch im Fenster", async () => {
    db.user.findUnique.mockResolvedValue({ ...USER, reinigungErlaubt: false });
    mockOeffnung(oeffnung(IM_FENSTER));
    expect((await buildStrafbuch("u1", NOW)).unauthorizedOpenings).toHaveLength(1);
  });
});
