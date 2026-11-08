import { describe, it, expect, vi, beforeEach } from "vitest";

const findUnique = vi.fn();
const updateMany = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: { strafeRecord: { findUnique: (...a: unknown[]) => findUnique(...a), updateMany: (...a: unknown[]) => updateMany(...a) } },
}));

import { reportPenaltyDone } from "./penaltyReport";

/**
 * Der Rückkanal des Trägers zu einer verhängten Strafe. Er schliesst nichts — abschliessen kann nur
 * die Keyholderin —, aber sie erfährt davon, statt es zufällig im Strafbuch zu finden.
 */
const OPEN = { userId: "u1", status: "PUNISHED", erledigtAt: null, reportedDoneAt: null, reason: "Halsband anlegen" };

describe("reportPenaltyDone", () => {
  beforeEach(() => {
    findUnique.mockReset();
    updateMany.mockReset();
  });

  it("stempelt eine offene Strafe einmal und nennt den Straftext für die Meldung", async () => {
    findUnique.mockResolvedValue(OPEN);
    updateMany.mockResolvedValue({ count: 1 });
    const r = await reportPenaltyDone("u1", "ref-1");
    expect(r).toEqual({ ok: true, data: { reported: true, penalty: "Halsband anlegen" } });
    expect(updateMany.mock.calls[0][0].where).toMatchObject({ refId: "ref-1", userId: "u1", erledigtAt: null, reportedDoneAt: null });
  });

  it("eine fremde Strafe ist für ihn so unbekannt wie eine, die es nicht gibt", async () => {
    findUnique.mockResolvedValue({ ...OPEN, userId: "u2" });
    const r = await reportPenaltyDone("u1", "ref-1");
    expect(r.ok).toBe(false);
    expect(JSON.stringify(r)).toContain("JUDGMENT_NOT_FOUND");
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("ein verworfenes Vergehen hat keine Strafe, die er melden könnte", async () => {
    findUnique.mockResolvedValue({ ...OPEN, status: "DISMISSED" });
    const r = await reportPenaltyDone("u1", "ref-1");
    expect(JSON.stringify(r)).toContain("PENALTY_NOT_PUNISHED");
  });

  it("schon gemeldet oder schon erledigt: nichts Neues, keine zweite Meldung", async () => {
    findUnique.mockResolvedValue({ ...OPEN, reportedDoneAt: new Date() });
    expect(await reportPenaltyDone("u1", "ref-1")).toEqual({ ok: true, data: { reported: false, penalty: "Halsband anlegen" } });
    findUnique.mockResolvedValue({ ...OPEN, erledigtAt: new Date() });
    expect(await reportPenaltyDone("u1", "ref-1")).toEqual({ ok: true, data: { reported: false, penalty: "Halsband anlegen" } });
    expect(updateMany).not.toHaveBeenCalled();
  });
});
