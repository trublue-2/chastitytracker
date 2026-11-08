import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * `processDueOrgasmusAnforderungen` — der Poller-Pfad, der eine terminierte Orgasmus-Anweisung zustellt.
 *
 * Zwei Zusagen: (1) zieht die Keyholderin zwischen Auswahl und Versand zurück, geht keine Meldung
 * raus und der Stempel weckt die Zeile nicht auf; (2) der Zustellstempel kommt erst NACH dem
 * Versand — ein Absturz dazwischen ist höchstens eine doppelte Meldung, nie ein stiller Verlust.
 */
vi.mock("@/lib/prisma", () => ({
  prisma: { orgasmusAnforderung: { findMany: vi.fn(), count: vi.fn(), update: vi.fn(), updateMany: vi.fn() } },
}));
vi.mock("@/lib/orgasmusAnforderungService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/orgasmusAnforderungService")>();
  return { ...actual, sendOrgasmusAnforderungNotifications: vi.fn() };
});

import { processDueOrgasmusAnforderungen } from "./kontrollen/kontrollePoller";
import { prisma } from "@/lib/prisma";
import { sendOrgasmusAnforderungNotifications } from "@/lib/orgasmusAnforderungService";

const db = prisma.orgasmusAnforderung as unknown as Record<"findMany" | "count" | "update" | "updateMany", ReturnType<typeof vi.fn>>;
const send = sendOrgasmusAnforderungNotifications as unknown as ReturnType<typeof vi.fn>;

const NOW = new Date("2026-07-25T15:00:00Z");
const due = {
  id: "oa1", userId: "u1", art: "GELEGENHEIT", message: null, requiredType: null, openingAllowed: false,
  beginsAt: new Date("2026-07-25T15:00:00Z"), endsAt: new Date("2026-07-26T15:00:00Z"),
  wirksamAb: new Date("2026-07-25T15:00:00Z"), createdBy: "kh", user: { email: "x", username: "sub", orgasmusArtenConfig: null, locale: "de" },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  db.findMany.mockResolvedValue([due]);
  db.count.mockResolvedValue(1);
  db.updateMany.mockResolvedValue({ count: 1 });
});

describe("processDueOrgasmusAnforderungen", () => {
  it("offene Zeile: frisch gelesen, versendet, danach gestempelt (Reihenfolge Lesen → Senden → Stempel)", async () => {
    await processDueOrgasmusAnforderungen(NOW);
    expect(db.count).toHaveBeenCalledWith({ where: expect.objectContaining({ id: "oa1", withdrawnAt: null, benachrichtigtAt: null }) });
    expect(send).toHaveBeenCalledTimes(1);
    expect(db.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: "oa1", withdrawnAt: null }),
      data: expect.objectContaining({ benachrichtigtAt: expect.any(Date) }),
    }));
    const order = (m: ReturnType<typeof vi.fn>) => m.mock.invocationCallOrder[0];
    expect(order(db.count)).toBeLessThan(order(send));
    expect(order(send)).toBeLessThan(order(db.updateMany));
  });

  it("zwischen Auswahl und Versand zurückgezogen: keine Meldung, kein Stempel", async () => {
    db.count.mockResolvedValue(0);
    await processDueOrgasmusAnforderungen(NOW);
    expect(send).not.toHaveBeenCalled();
    expect(db.updateMany).not.toHaveBeenCalled();
  });

  it("der Stempel steht NICHT vor dem Versand: scheitert die Meldung, ist nichts gestempelt (Retry, kein stiller Verlust)", async () => {
    send.mockRejectedValueOnce(new Error("smtp down"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    await processDueOrgasmusAnforderungen(NOW);
    expect(db.updateMany).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });

  it("Container-Tod zwischen Versand und Stempel: die Zeile bleibt ungestempelt fällig (nächster Tick sendet höchstens doppelt)", async () => {
    db.updateMany.mockRejectedValueOnce(new Error("killed"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    await processDueOrgasmusAnforderungen(NOW);
    expect(send).toHaveBeenCalledTimes(1);
    // nichts hat benachrichtigtAt gesetzt → dueForDispatchWhere trifft die Zeile im nächsten Tick wieder
    expect(db.updateMany).toHaveBeenCalledTimes(1);
  });
});
