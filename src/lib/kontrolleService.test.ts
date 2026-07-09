import { describe, it, expect, vi, beforeEach } from "vitest";

// hasActiveKontrolle nutzt nur prisma.kontrollAnforderung.findFirst — mocken.
vi.mock("@/lib/prisma", () => ({ prisma: { kontrollAnforderung: { findFirst: vi.fn() } } }));

import { hasActiveKontrolle } from "./kontrolleService";
import { prisma } from "@/lib/prisma";

const findFirstMock = prisma.kontrollAnforderung.findFirst as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  findFirstMock.mockReset();
});

describe("hasActiveKontrolle — Überschneidungs-Guard", () => {
  const NOW = new Date("2026-07-09T12:00:00Z");

  it("true, wenn eine sichtbare (unmittelbare) Kontrolle existiert", async () => {
    findFirstMock.mockResolvedValue({ id: "ka1" });
    const result = await hasActiveKontrolle("u1", NOW);
    expect(result).toBe(true);
  });

  it("false, wenn keine passende Zeile gefunden wird", async () => {
    findFirstMock.mockResolvedValue(null);
    const result = await hasActiveKontrolle("u1", NOW);
    expect(result).toBe(false);
  });

  it("Query filtert entryId:null, withdrawnAt:null und (wirksamAb:null ODER bereits erreicht)", async () => {
    findFirstMock.mockResolvedValue(null);
    await hasActiveKontrolle("u1", NOW);
    const arg = findFirstMock.mock.calls[0][0];
    expect(arg.where).toMatchObject({ userId: "u1", entryId: null, withdrawnAt: null });
    expect(arg.where.OR).toEqual([{ wirksamAb: null }, { wirksamAb: { lte: NOW } }]);
    // Eine noch in der Zukunft geplante (unsichtbare) Kontrolle darf NICHT als aktiv zählen —
    // sichergestellt dadurch, dass die Query wirksamAb explizit auf "erreicht" beschränkt statt
    // jede nicht-null wirksamAb zuzulassen.
    expect(arg.where.wirksamAb).toBeUndefined();
  });

  it("blockiert nur LAUFENDE: deadline muss noch in der Zukunft liegen (überfällige zählen nicht)", async () => {
    findFirstMock.mockResolvedValue(null);
    await hasActiveKontrolle("u1", NOW);
    const arg = findFirstMock.mock.calls[0][0];
    // deadline >= now grenzt Status "open" von "overdue" ab. Eine überfällige, nie beantwortete
    // Kontrolle (deadline < now) würde sonst jede künftige (auch Auto-)Kontrolle dauerhaft
    // blockieren — genau das verhindert diese Bedingung.
    expect(arg.where.deadline).toEqual({ gte: NOW });
  });

  it("excludeId schliesst die geprüfte Zeile selbst aus (Poller-Fall: 'irgendeine ANDERE aktive')", async () => {
    findFirstMock.mockResolvedValue(null);
    await hasActiveKontrolle("u1", NOW, { excludeId: "self-id" });
    const arg = findFirstMock.mock.calls[0][0];
    expect(arg.where.id).toEqual({ not: "self-id" });
  });

  it("ohne excludeId wird kein id-Filter gesetzt (requestKontrolle-Fall: neue Zeile existiert noch nicht)", async () => {
    findFirstMock.mockResolvedValue(null);
    await hasActiveKontrolle("u1", NOW);
    const arg = findFirstMock.mock.calls[0][0];
    expect(arg.where.id).toBeUndefined();
  });
});
