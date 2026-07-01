import { describe, it, expect, vi, beforeEach } from "vitest";

// withdrawVerschlussAnforderung nutzt nur prisma.updateMany + notifyUser — beides mocken.
vi.mock("@/lib/prisma", () => ({ prisma: { verschlussAnforderung: { updateMany: vi.fn() } } }));
vi.mock("@/lib/notify", () => ({ notifyUser: vi.fn() }));

import { withdrawVerschlussAnforderung } from "./verschlussAnforderungService";
import { prisma } from "@/lib/prisma";
import { notifyUser } from "@/lib/notify";

const updateManyMock = prisma.verschlussAnforderung.updateMany as unknown as ReturnType<typeof vi.fn>;
const notifyMock = notifyUser as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  updateManyMock.mockReset().mockResolvedValue({ count: 1 });
  notifyMock.mockReset().mockResolvedValue(undefined);
});

// Regression: der virtuelle Keyholder beobachtete einmal withdrawn:0 bei einer nur TERMINIERTEN
// (wirksamAb in der Zukunft) Anforderung. Diese Tests fixieren, dass die Where-Klausel NICHT nach
// wirksamAb filtert — geplante Direktiven werden also mit-storniert (nicht nur bereits ausgelöste).
describe("withdrawVerschlussAnforderung — storniert auch TERMINIERTE Direktiven", () => {
  it("ANFORDERUNG: Where filtert nicht nach wirksamAb (geplante inklusive)", async () => {
    const res = await withdrawVerschlussAnforderung("u1", "ANFORDERUNG");
    expect(res).toEqual({ ok: true, data: { count: 1 } });

    const arg = updateManyMock.mock.calls[0][0];
    expect(arg.where).toMatchObject({ userId: "u1", art: "ANFORDERUNG", fulfilledAt: null, withdrawnAt: null });
    // Kernaussage: kein wirksamAb-Gate → wirksamAb-in-der-Zukunft-Zeilen fallen NICHT raus.
    expect(JSON.stringify(arg.where)).not.toContain("wirksamAb");
    expect(arg.data).toHaveProperty("withdrawnAt");
    expect(notifyMock).toHaveBeenCalledTimes(1);
  });

  it("SPERRZEIT: Where filtert nicht nach wirksamAb (geplante inklusive)", async () => {
    const res = await withdrawVerschlussAnforderung("u1", "SPERRZEIT");
    expect(res.ok).toBe(true);

    const arg = updateManyMock.mock.calls[0][0];
    expect(arg.where).toMatchObject({ userId: "u1", art: "SPERRZEIT", withdrawnAt: null });
    expect(JSON.stringify(arg.where)).not.toContain("wirksamAb");
  });

  it("count 0 → keine Benachrichtigung", async () => {
    updateManyMock.mockResolvedValue({ count: 0 });
    const res = await withdrawVerschlussAnforderung("u1", "ANFORDERUNG");
    expect(res.data.count).toBe(0);
    expect(notifyMock).not.toHaveBeenCalled();
  });
});
