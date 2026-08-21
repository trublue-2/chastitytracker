/**
 * Die Aufbewahrung des Posteingangs.
 *
 * `Message` hatte keine Aufräum-Regel — nur vom Nutzer ausgelöstes Löschen. Auf einer Instanz mit
 * automatischen Kontrollen und Vergehens-Meldungen wächst die Tabelle monoton, und ihre Indizes
 * hängen an der Glocke in der Kopfzeile, also an jeder Dashboard-Seite.
 *
 * Der Punkt, den diese Tests festhalten: die Frist hängt am ZUSTAND, nicht nur am Alter. Eine nie
 * gelesene Meldung bleibt liegen, egal wie alt — sonst verschwände eine Zustellung folgenlos.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    message: {
      findMany: vi.fn(async () => [] as { id: string }[]),
      deleteMany: vi.fn(async () => ({ count: 0 })),
    },
  },
}));

import { pruneExpiredMessages, messageRetentionDays } from "./messageService";
import { prisma } from "@/lib/prisma";

const NOW = new Date("2026-08-21T12:00:00Z");
const day = 86_400_000;

beforeEach(() => vi.clearAllMocks());
afterEach(() => { delete process.env.MESSAGE_RETENTION_DAYS; });

describe("Aufbewahrungsfrist", () => {
  it("nimmt ein Jahr, wenn nichts konfiguriert ist", () => {
    expect(messageRetentionDays()).toBe(365);
  });

  it("nimmt den konfigurierten Wert", () => {
    process.env.MESSAGE_RETENTION_DAYS = "30";
    expect(messageRetentionDays()).toBe(30);
  });

  it("fällt bei Unsinn auf die Vorgabe zurück statt auf NaN", () => {
    // Aus NaN entstünde ein Stichtag `Invalid Date` und ein Lauf, der lautlos nichts tut.
    process.env.MESSAGE_RETENTION_DAYS = "bald";
    expect(messageRetentionDays()).toBe(365);
    process.env.MESSAGE_RETENTION_DAYS = "-5";
    expect(messageRetentionDays()).toBe(365);
  });
});

describe("Beschneiden", () => {
  it("sucht nur GELESENE Zeilen jenseits des Stichtags", async () => {
    process.env.MESSAGE_RETENTION_DAYS = "30";
    await pruneExpiredMessages(NOW);
    const args = vi.mocked(prisma.message.findMany).mock.calls[0]?.[0] as {
      where: { createdAt: { lt: Date }; reads: unknown };
      take: number;
    };
    expect(args.where.createdAt.lt).toEqual(new Date(NOW.getTime() - 30 * day));
    expect(args.where.reads).toEqual({ some: {} });
    expect(args.take).toBeGreaterThan(0);
  });

  it("löscht nichts, wenn die Frist auf 0 steht", async () => {
    process.env.MESSAGE_RETENTION_DAYS = "0";
    expect(await pruneExpiredMessages(NOW)).toBe(0);
    expect(prisma.message.findMany).not.toHaveBeenCalled();
  });

  it("löscht nichts, wenn nichts fällig ist — ohne Löschbefehl", async () => {
    expect(await pruneExpiredMessages(NOW)).toBe(0);
    expect(prisma.message.deleteMany).not.toHaveBeenCalled();
  });

  it("löscht genau die gefundenen Zeilen und meldet die Anzahl", async () => {
    vi.mocked(prisma.message.findMany).mockResolvedValueOnce([{ id: "m1" }, { id: "m2" }]);
    vi.mocked(prisma.message.deleteMany).mockResolvedValueOnce({ count: 2 });
    expect(await pruneExpiredMessages(NOW)).toBe(2);
    expect(vi.mocked(prisma.message.deleteMany).mock.calls[0]?.[0]).toEqual({ where: { id: { in: ["m1", "m2"] } } });
  });
});
