import { describe, it, expect, vi, beforeEach } from "vitest";

/** Eigener Doppelgänger statt `createPrismaMock`: der deckt nur Lesepfade ab und wirft bei
 *  `$transaction` — hier steht genau der Schreibpfad zur Prüfung. Die Transaktion reicht dieselben
 *  Modell-Mocks durch, damit der Test sieht, was INNEN geschrieben wurde. */
vi.mock("@/lib/prisma", () => {
  const cleaningRuleChange = {
    count: vi.fn(async () => 0),
    createMany: vi.fn(async () => ({ count: 0 })),
  };
  const user = {
    findUnique: vi.fn(async () => null as unknown),
    update: vi.fn(async () => ({})),
  };
  return {
    prisma: {
      user,
      cleaningRuleChange,
      $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn({ user, cleaningRuleChange })),
    },
  };
});

import { setCleaningSettings } from "./cleaningService";
import { prisma } from "@/lib/prisma";

const db = prisma as unknown as {
  user: { findUnique: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
  cleaningRuleChange: { count: ReturnType<typeof vi.fn>; createMany: ReturnType<typeof vi.fn> };
};

const NOW = new Date("2026-08-19T07:00:00Z");
const BESTAND = {
  cleaningAllowed: true,
  cleaningMaxMinutes: 15,
  cleaningMaxPerDay: 2,
  cleaningWindows: null,
};

/** Die Zeilen, die `createMany` bekommen hat — in der Reihenfolge, in der sie geschrieben wurden. */
const geschriebeneZeilen = () => db.cleaningRuleChange.createMany.mock.calls[0]?.[0]?.data ?? [];

describe("setCleaningSettings — die Historie der Reinigungs-Regeln", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.user.findUnique.mockResolvedValue(BESTAND);
    db.cleaningRuleChange.count.mockResolvedValue(0);
  });

  it("die erste Änderung schreibt den Ausgangsstand mit — sonst fiele die Vergangenheit auf den neuen Wert", async () => {
    await setCleaningSettings("u1", { maxPerDay: 1, changedBy: "lady", now: NOW });

    const zeilen = geschriebeneZeilen();
    expect(zeilen).toHaveLength(2);
    // Grundzeile: der alte Stand, gültig seit jeher, von niemandem gesetzt.
    expect(zeilen[0]).toMatchObject({ userId: "u1", maxPerDay: 2, effectiveFrom: new Date(0), changedBy: null });
    // Neue Fassung: ab jetzt, mit dem Handelnden.
    expect(zeilen[1]).toMatchObject({ userId: "u1", maxPerDay: 1, effectiveFrom: NOW, changedBy: "lady" });
  });

  it("mit bestehender Historie kommt keine zweite Grundzeile dazu", async () => {
    db.cleaningRuleChange.count.mockResolvedValue(1);
    await setCleaningSettings("u1", { maxPerDay: 1, now: NOW });

    const zeilen = geschriebeneZeilen();
    expect(zeilen).toHaveLength(1);
    expect(zeilen[0]).toMatchObject({ maxPerDay: 1, effectiveFrom: NOW });
  });

  it("ein Speichern, das nichts ändert, schreibt keine Zeile", async () => {
    await setCleaningSettings("u1", { maxPerDay: 2, changedBy: "lady", now: NOW });

    expect(db.cleaningRuleChange.createMany).not.toHaveBeenCalled();
    expect(db.user.update).toHaveBeenCalled();
  });

  it("die neue Zeile trägt ALLE vier Werte, nicht nur den geänderten", async () => {
    await setCleaningSettings("u1", { allowed: false, now: NOW });

    const [, neu] = geschriebeneZeilen();
    expect(neu).toMatchObject({ allowed: false, maxMinutes: 15, maxPerDay: 2, windows: null });
  });

  it("die Fenster gehen als JSON-String in die Historie — dieselbe Form wie in der Spalte", async () => {
    await setCleaningSettings("u1", { windows: [{ start: "19:00", end: "20:00" }], now: NOW });

    const [, neu] = geschriebeneZeilen();
    // Mit den Wochentagen — die Historie hält die Fenster so fest, wie sie in der Spalte stehen.
    expect(neu.windows).toBe('[{"start":"19:00","end":"20:00","days":127}]');
  });

  it("eine ungültige Fenster-Liste wird abgelehnt, bevor irgendetwas geschrieben wird", async () => {
    const r = await setCleaningSettings("u1", { windows: [{ start: "19:00", end: "18:00" }], now: NOW });

    expect(r.ok).toBe(false);
    expect(db.cleaningRuleChange.createMany).not.toHaveBeenCalled();
    expect(db.user.update).not.toHaveBeenCalled();
  });
});
