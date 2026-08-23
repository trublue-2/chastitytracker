import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Die Schranken der Auslösung — die Fälle, in denen die Vorgabe NICHT feuern darf.
 *
 * Die Rechnung selbst steht in `weightRelease.test.ts` und ist datenbankfrei. Hier geht es um das,
 * was nur der Bestand beantwortet: Gesundheits-Halt, eine bereits offene Anforderung und die
 * Nachwiege-Sperre. Jeder dieser drei Fälle erzeugt sonst eine Direktive, die niemand gestellt hat.
 */
vi.mock("@/lib/prisma", async () => {
  const { createPrismaMock } = await import("@/test/prismaMock");
  const mock = createPrismaMock();
  // `$transaction` deckt der geteilte Mock bewusst nicht ab (nur Lesepfade). Hier reicht der
  // einfachste Doppelgänger: die Callback-Form, die dieselbe Mock-Wurzel als `tx` durchreicht.
  return {
    prisma: new Proxy(mock, {
      get: (target, prop) =>
        prop === "$transaction"
          ? transaction
          : Reflect.get(target, prop),
    }),
  };
});
const transaction = vi.fn(async (fn: (tx: unknown) => unknown) => fn(await import("@/lib/prisma").then((m) => m.prisma)));
vi.mock("@/lib/orgasmusAnforderungService", () => ({ createOrgasmusAnforderung: vi.fn() }));
vi.mock("@/lib/notify", () => ({ notifyUser: vi.fn(), notifyControllers: vi.fn() }));
vi.mock("@/lib/keyholder", () => ({ getControllersOfUser: vi.fn().mockResolvedValue([]) }));
vi.mock("@/lib/constants", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  weightTrackingEnabled: () => true,
}));

import { applyWeightRelease, setWeightRelease } from "@/lib/weightReleaseService";
import { prisma } from "@/lib/prisma";
import { createOrgasmusAnforderung } from "@/lib/orgasmusAnforderungService";
import type { PrismaMock } from "@/test/prismaMock";

const db = prisma as unknown as PrismaMock;
const USER = "u1";
const NOW = new Date("2026-08-23T07:00:00+02:00");

/** Eine Vorgabe, die nach der Reihe unten ERFÜLLT wäre — damit jeder Fehlschlag unten wirklich an
 *  der geprüften Schranke liegt und nicht daran, dass die Rechnung ohnehin nicht aufginge. */
const RELEASE = {
  id: "r1", thresholdKg: 75, direction: "below", averageDays: 3, minMeasurements: 2,
  stepKg: 0, notBeforeAt: new Date("2026-08-20T00:00:00Z"), windowHours: 24,
  openingAllowed: false, message: null, armedAt: new Date("2026-08-20T00:00:00Z"),
  createdAt: new Date("2026-08-20T00:00:00Z"), createdBy: "kh",
};
const POINTS = [
  { dayKey: "2026-08-22", weightKg: 74.0, inWindow: true },
  { dayKey: "2026-08-23", weightKg: 73.8, inWindow: true },
];

beforeEach(() => {
  vi.clearAllMocks();
  db.weightRelease.findFirst.mockResolvedValue(RELEASE);
  db.weightEntry.findMany.mockResolvedValue(POINTS);
  db.user.findUnique.mockResolvedValue({ timezone: "Europe/Zurich", username: "sub", unitSystem: "metric" });
  db.healthHold.findFirst.mockResolvedValue(null);
  db.orgasmusAnforderung.findFirst.mockResolvedValue(null);
  db.weightRelease.updateMany.mockResolvedValue({ count: 1 });
  vi.mocked(createOrgasmusAnforderung).mockResolvedValue({ ok: true, data: { id: "oa1", scheduledFor: null } });
});

describe("die Freigabe-Vorgabe löst aus", () => {
  it("öffnet ein Fenster, wenn das Mittel die Schwelle erreicht", async () => {
    const res = await applyWeightRelease(USER, NOW);
    expect(res).toEqual({ releasedId: "oa1" });
    // GELEGENHEIT, nicht ANWEISUNG: die Freigabe ist ein Preis, keine Pflicht — als Anweisung
    // würde ihr Verstreichen zu einem `missed_orgasm`-Vergehen.
    expect(vi.mocked(createOrgasmusAnforderung).mock.calls[0][0]).toMatchObject({ art: "GELEGENHEIT" });
  });

  it("verbraucht die Vorgabe — sie kann nicht zweimal öffnen", async () => {
    await applyWeightRelease(USER, NOW);
    expect(db.weightRelease.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: "r1", releasedAt: null, withdrawnAt: null }) }),
    );
  });
});

describe("die Freigabe-Vorgabe löst NICHT aus", () => {
  it("wenn keine Vorgabe steht", async () => {
    db.weightRelease.findFirst.mockResolvedValue(null);
    expect(await applyWeightRelease(USER, NOW)).toBeNull();
    expect(createOrgasmusAnforderung).not.toHaveBeenCalled();
  });

  it("bei aktivem Gesundheits-Halt — die Vorgabe ruht, wie die Meldepflicht", async () => {
    db.healthHold.findFirst.mockResolvedValue({ id: "h1" });
    expect(await applyWeightRelease(USER, NOW)).toBeNull();
    expect(createOrgasmusAnforderung).not.toHaveBeenCalled();
  });

  it("wenn schon eine Anforderung offen ist — eine Automatik räumt keine Anweisung weg", async () => {
    db.orgasmusAnforderung.findFirst.mockResolvedValue({ id: "oa-open" });
    expect(await applyWeightRelease(USER, NOW)).toBeNull();
    expect(createOrgasmusAnforderung).not.toHaveBeenCalled();
    // Und die Vorgabe bleibt stehen: sie greift beim nächsten Wiegen wieder.
    expect(db.weightRelease.updateMany).not.toHaveBeenCalled();
  });

  it("wenn das Mittel die Schwelle nicht erreicht", async () => {
    db.weightEntry.findMany.mockResolvedValue([
      { dayKey: "2026-08-22", weightKg: 76.0, inWindow: true },
      { dayKey: "2026-08-23", weightKg: 75.8, inWindow: true },
    ]);
    expect(await applyWeightRelease(USER, NOW)).toBeNull();
    expect(createOrgasmusAnforderung).not.toHaveBeenCalled();
  });

  it("wenn zu wenige Messungen für ein Mittel vorliegen", async () => {
    db.weightEntry.findMany.mockResolvedValue([POINTS[1]]);
    expect(await applyWeightRelease(USER, NOW)).toBeNull();
  });

  it("vor der Mindestlaufzeit — auch bei erfülltem Gewicht", async () => {
    db.weightRelease.findFirst.mockResolvedValue({ ...RELEASE, notBeforeAt: new Date("2026-09-01T00:00:00Z") });
    expect(await applyWeightRelease(USER, NOW)).toBeNull();
    expect(createOrgasmusAnforderung).not.toHaveBeenCalled();
  });
});

describe("welche Messungen überhaupt zählen", () => {
  it("nur die innerhalb der Wiege-Fenster — sonst misst die Freigabe die Tageszeit mit", async () => {
    await applyWeightRelease(USER, NOW);
    expect(db.weightEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ inWindow: true }) }),
    );
  });
});

describe("was aus dem rohen Request-Body kommt", () => {
  it("macht aus einem unbrauchbaren Anstieg 0, statt NaN in die Spalte zu schreiben", async () => {
    // Der Body geht ungeprüft in den Dienst; `Math.max(0, Math.min(5, "abc"))` wäre NaN, und eine
    // NaN-Schwelle macht jede spätere Rechnung still unbrauchbar.
    db.user.findUnique.mockResolvedValue({ weightTrackingEnabled: true, heightCm: 180 });
    db.weightRelease.create.mockResolvedValue({ id: "r2" });

    const res = await setWeightRelease({
      userId: USER,
      thresholdKg: 75,
      notBeforeAt: new Date(Date.now() + 864e5),
      stepKg: "abc" as unknown as number,
    }, "kh");

    expect(res.ok).toBe(true);
    expect(db.weightRelease.create.mock.calls[0][0].data.stepKg).toBe(0);
  });
});
