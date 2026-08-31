import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";

vi.mock("@/lib/prisma", async () => {
  const { createPrismaMock } = await import("@/test/prismaMock");
  return { prisma: createPrismaMock() };
});

const { buildBoxCleaningView } = await import("./boxCleaning");

/**
 * Die NAHT zwischen Karte und Regel — und der Grund, warum sie einen eigenen Test braucht.
 *
 * Dass `boxCleaningWindowOpenLabel` bei `windowsBinding: false` schweigt, prüft `boxStatus.test.ts`.
 * Das ist aber nur der Wächter. Der Fehler, den es hier zu verhindern gilt, sass eine Schicht
 * darunter: die Karte fragte `cleaningBlockReason(user, lockPeriod ? [lockPeriod] : [], now)`, und
 * eine LEERE Liste liest die Funktion als „jede Sperrzeit erlaubt es" — „keine Sperrzeit" und
 * „Sperrzeit erlaubt Reinigung" fielen also zu demselben `null` zusammen. Die Karte meldete dann
 * „Reinigungsfenster offen bis 20:00", obwohl gar nichts einschränkte.
 *
 * Ohne diesen Test bliebe genau diese Zeile ungeprüft: man könnte sie zurückdrehen, und alle
 * Wächter-Tests blieben grün.
 */
const TZ = "Europe/Zurich";
const FENSTER = [{ start: "19:00", end: "20:00" }];
const IM_FENSTER = new Date("2026-07-10T17:30:00Z"); // 19:30 Ortszeit
const NACHTS = new Date("2026-07-10T01:00:00Z");     // 03:00 Ortszeit

const user = { cleaningAllowed: true, cleaningMaxMinutes: 15, cleaningMaxPerDay: 0, cleaningWindows: FENSTER };

let vorher: string | undefined;
beforeAll(() => { vorher = process.env.HEIMDALL_SYNC_SECRET; process.env.HEIMDALL_SYNC_SECRET = "t"; });
afterAll(() => {
  if (vorher === undefined) delete process.env.HEIMDALL_SYNC_SECRET;
  else process.env.HEIMDALL_SYNC_SECRET = vorher;
});

describe("buildBoxCleaningView — bindet das Fenster gerade?", () => {
  it("OHNE Sperrzeit bindet es nicht, auch mitten im Fenster", () => {
    expect(buildBoxCleaningView(user, null, IM_FENSTER, TZ)).toMatchObject({ windowsBinding: false });
  });

  it("MIT reinigungserlaubender Sperrzeit bindet es", () => {
    expect(buildBoxCleaningView(user, { cleaningAllowed: true }, IM_FENSTER, TZ))
      .toMatchObject({ windowsBinding: true, windowOpenNow: { until: "20:00" } });
  });

  it("eine Sperrzeit, die Reinigung verbietet, bindet ebenfalls nicht", () => {
    expect(buildBoxCleaningView(user, { cleaningAllowed: false }, IM_FENSTER, TZ))
      .toMatchObject({ windowsBinding: false });
  });

  it("das Ende des Fensters kommt aus der Uhr, nicht aus dem Status", () => {
    // `cleaningWindowBindingStatus` sagt nur OB — das „bis wann" ist der Grund, warum daneben noch
    // `activeCleaningWindow` steht.
    expect(buildBoxCleaningView(user, { cleaningAllowed: true }, NACHTS, TZ))
      .toMatchObject({ windowsBinding: true, windowOpenNow: null });
  });

  it("ohne Heimdall gibt es die Karte nicht", () => {
    const secret = process.env.HEIMDALL_SYNC_SECRET;
    delete process.env.HEIMDALL_SYNC_SECRET;
    expect(buildBoxCleaningView(user, { cleaningAllowed: true }, IM_FENSTER, TZ)).toBeNull();
    process.env.HEIMDALL_SYNC_SECRET = secret;
  });
});
