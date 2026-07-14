import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Mehrere offene Sperrzeiten können koexistieren: eine geplante überlebt eine Öffnung (sie ist noch
 * nicht aktiv), und schliesst sich der Sub danach über eine Verschluss-Anforderung wieder ein, legt
 * `entries/route.ts` eine zweite, sofort aktive an. Die alte Auswahl in `mcpEditLockPeriod`
 * (`findFirst` + `orderBy createdAt desc`) traf die richtige nur zufällig — und der `withdraw`-Rückzug
 * meldete ein nacktes `count`, ohne zu sagen, dass eine geplante mitgegangen ist.
 */

vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: vi.fn() } },
}));
vi.mock("@/lib/queries", () => ({
  getUserDeviceOptions: vi.fn(),
  getKeyholderSperrzeiten: vi.fn(),
}));
vi.mock("@/lib/verschlussAnforderungService", () => ({
  createVerschlussAnforderung: vi.fn(),
  updateSperrzeitEnde: vi.fn(),
  withdrawVerschlussAnforderung: vi.fn(),
}));

import { mcpEditLockPeriod, mcpWithdraw } from "./mcpWrite";
import { prisma } from "@/lib/prisma";
import { getKeyholderSperrzeiten } from "@/lib/queries";
import { updateSperrzeitEnde, withdrawVerschlussAnforderung } from "@/lib/verschlussAnforderungService";

const userFind = prisma.user.findUnique as unknown as ReturnType<typeof vi.fn>;
const openMock = getKeyholderSperrzeiten as unknown as ReturnType<typeof vi.fn>;
const updateEndeMock = updateSperrzeitEnde as unknown as ReturnType<typeof vi.fn>;
const withdrawMock = withdrawVerschlussAnforderung as unknown as ReturnType<typeof vi.fn>;

const NEUES_ENDE = "2026-09-01T00:00:00.000Z";
const IN_DREI_WOCHEN = new Date("2026-08-04T00:00:00Z");

/** S1: von der Keyholderin für in drei Wochen geplant — dem Sub unbekannt. Älter (zuerst angelegt). */
const geplant = {
  id: "s1",
  wirksamAb: IN_DREI_WOCHEN,
  benachrichtigtAt: null,
  endetAt: new Date("2026-08-11T00:00:00Z"),
};
/** S2: beim Selbst-Einschluss auto-erzeugt (`entries/route.ts`) — sofort aktiv, dem Sub bekannt. Neuer. */
const ausgeloest = {
  id: "s2",
  wirksamAb: null,
  benachrichtigtAt: null, // die Falle: auto-erzeugt, trotzdem NICHT verborgen (wirksamAb === null)
  endetAt: new Date("2026-07-20T00:00:00Z"),
};

beforeEach(() => {
  userFind.mockReset().mockResolvedValue({ id: "u1" });
  openMock.mockReset();
  updateEndeMock.mockReset().mockResolvedValue({ ok: true, data: { id: "x", userId: "u1", notified: true } });
  withdrawMock.mockReset();
});

describe("mcpEditLockPeriod — Zielwahl bei mehreren offenen Sperrzeiten", () => {
  it("nimmt die AUSGELÖSTE, nicht die zuletzt angelegte", async () => {
    // Der Kern des Bugs: sortiert man nach createdAt desc, gewinnt mal die eine, mal die andere.
    // Gemeint ist immer die laufende — die, die der Sub kennt und die gerade durchsetzt.
    openMock.mockResolvedValue([geplant, ausgeloest]); // geplante zuerst = "neueste" in der alten Logik
    const res = await mcpEditLockPeriod("kg", { untilAt: NEUES_ENDE });

    expect(updateEndeMock).toHaveBeenCalledWith("s2", new Date(NEUES_ENDE));
    expect(res.id).toBe("s2");
  });

  it("macht die Mehrdeutigkeit sichtbar: die unangetastete geplante wird als Datum gemeldet", async () => {
    openMock.mockResolvedValue([geplant, ausgeloest]);
    const res = await mcpEditLockPeriod("kg", { untilAt: NEUES_ENDE });

    expect(res.untouched).toEqual([{
      id: "s1",
      status: "scheduled",
      scheduledFor: IN_DREI_WOCHEN.toISOString(),
      endsAt: geplant.endetAt.toISOString(),
    }]);
    expect(res.message).toContain("2 lock periods are open");
  });

  it("EINE offene Sperrzeit → nichts Unangetastetes, keine Mehrdeutigkeits-Notiz", async () => {
    openMock.mockResolvedValue([ausgeloest]);
    const res = await mcpEditLockPeriod("kg", { untilAt: NEUES_ENDE });

    expect(res.untouched).toEqual([]);
    expect(res.message).not.toContain("lock periods are open");
  });

  it("nur GEPLANTE offen → die neueste, und die Antwort sagt: nicht benachrichtigt", async () => {
    const zweiteGeplante = { ...geplant, id: "s3" };
    openMock.mockResolvedValue([zweiteGeplante, geplant]);
    updateEndeMock.mockResolvedValue({ ok: true, data: { id: "s3", userId: "u1", notified: false } });

    const res = await mcpEditLockPeriod("kg", { untilAt: NEUES_ENDE });
    expect(res.id).toBe("s3");
    expect(res.message).toContain("SCHEDULED");
    expect(res.message).toContain("NOT notified");
  });

  it("mit id lässt sich die geplante gezielt ansprechen", async () => {
    openMock.mockResolvedValue([geplant, ausgeloest]);
    const res = await mcpEditLockPeriod("kg", { untilAt: NEUES_ENDE, id: "s1" });

    expect(updateEndeMock).toHaveBeenCalledWith("s1", new Date(NEUES_ENDE));
    expect(res.id).toBe("s1");
  });

  it("eine fremde/geschlossene id wird abgelehnt, statt still die falsche zu ändern", async () => {
    openMock.mockResolvedValue([ausgeloest]);
    await expect(mcpEditLockPeriod("kg", { untilAt: NEUES_ENDE, id: "fremd" })).rejects.toThrow(/No open lock period with id/);
    expect(updateEndeMock).not.toHaveBeenCalled();
  });

  it("keine offene Sperrzeit → Fehler, kein Schreibzugriff", async () => {
    openMock.mockResolvedValue([]);
    await expect(mcpEditLockPeriod("kg", { indefinite: true })).rejects.toThrow(/No open lock period/);
    expect(updateEndeMock).not.toHaveBeenCalled();
  });
});

describe("mcpWithdraw target=lock_period — was genau ging mit?", () => {
  it("aktiv + geplant getroffen → die Meldung benennt beide Anteile", async () => {
    withdrawMock.mockResolvedValue({ ok: true, data: { count: 2, hidden: 1, notified: true } });
    const res = await mcpWithdraw("kg", { target: "lock_period" });

    expect(res.withdrawn).toBe(2);
    expect(res.hidden).toBe(1);
    expect(res.message).toContain("1 already triggered");
    expect(res.message).toContain("1 still SCHEDULED");
    expect(res.message).toContain("withdrawn silently");
  });

  it("nur Ausgelöste getroffen → keine Aufschlüsselung, Meldung wie bisher", async () => {
    withdrawMock.mockResolvedValue({ ok: true, data: { count: 1, hidden: 0, notified: true } });
    const res = await mcpWithdraw("kg", { target: "lock_period" });

    expect(res.message).toContain("Withdrew 1 lock_period;");
    expect(res.message).not.toContain("SCHEDULED");
  });

  it("nur Geplante getroffen → der Sub erfuhr nichts, und die Antwort sagt das", async () => {
    withdrawMock.mockResolvedValue({ ok: true, data: { count: 1, hidden: 1, notified: false } });
    const res = await mcpWithdraw("kg", { target: "lock_period" });

    expect(res.message).toContain("NOT notified");
  });
});
