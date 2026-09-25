import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Eine Box je Träger (`boxPairing.ts`). Gepinnt wird vor allem, wann `removeBox` NICHT löscht: jeder
 * dieser Fälle hängt an der Box — bei einer verschlossenen LockMeBox ginge mit der Zeile das
 * Passwort verloren, und die Box liesse sich nie mehr öffnen.
 */

type Box = { id: string; pendingCommand: string | null; locked: boolean; reportedLocked: boolean | null };

const state = vi.hoisted(() => ({
  box: null as Box | null,
  locked: false,
  pendingLock: null as { id: string } | null,
  pendingOpen: null as { id: string } | null,
  deleted: [] as string[],
}));

vi.mock("@/lib/prisma", () => {
  const tx = {
    boxStatus: {
      findUnique: vi.fn(async () => state.box),
      delete: vi.fn(async ({ where }: { where: { id: string } }) => { state.deleted.push(where.id); }),
    },
  };
  return { prisma: { $transaction: (fn: (t: typeof tx) => unknown) => fn(tx) } };
});
vi.mock("@/lib/queries", () => ({ getIsLocked: vi.fn(async () => state.locked) }));
vi.mock("@/lib/lockCommit", () => ({
  findPendingLockTx: vi.fn(async () => state.pendingLock),
  findPendingOpenTx: vi.fn(async () => state.pendingOpen),
}));

import { otherBoxExists, removeBox } from "./boxPairing";

const OPEN_BOX: Box = { id: "row1", pendingCommand: null, locked: false, reportedLocked: false };

beforeEach(() => {
  state.box = { ...OPEN_BOX };
  state.locked = false;
  state.pendingLock = null;
  state.pendingOpen = null;
  state.deleted = [];
});

describe("removeBox", () => {
  it("entfernt eine offene Box ohne wartenden Aufruf", async () => {
    expect(await removeBox("u1", "LOCKMEBOX-1")).toEqual({ ok: true, data: null });
    expect(state.deleted).toEqual(["row1"]);
  });

  it("kennt die Box nicht → 404, nichts gelöscht", async () => {
    state.box = null;
    expect(await removeBox("u1", "LOCKMEBOX-1")).toMatchObject({ ok: false, status: 404, error: "NOT_FOUND" });
    expect(state.deleted).toEqual([]);
  });

  it.each([
    ["der Träger verschlossen ist", () => { state.locked = true; }],
    ["ein Verschluss-Aufruf wartet", () => { state.pendingLock = { id: "e1" }; }],
    ["eine Öffnung wartet", () => { state.pendingOpen = { id: "e2" }; }],
    ["die Box ein unerledigtes Kommando hat", () => { state.box!.pendingCommand = "open"; }],
    ["die Box sich als zu gemeldet hat", () => { state.box!.reportedLocked = true; }],
    ["die Box ohne IST-Meldung zu sein soll", () => { state.box!.reportedLocked = null; state.box!.locked = true; }],
  ])("verweigert, wenn %s", async (_label, arrange) => {
    arrange();
    expect(await removeBox("u1", "LOCKMEBOX-1")).toMatchObject({ ok: false, status: 409, error: "BOX_REMOVE_BLOCKED" });
    expect(state.deleted).toEqual([]);
  });

  it("entfernt eine Box, die noch nie ihren Riegel gemeldet hat und offen sein soll", async () => {
    state.box!.reportedLocked = null;
    expect((await removeBox("u1", "HEIMDALL-1")).ok).toBe(true);
  });
});

describe("otherBoxExists", () => {
  it("fragt nach einer Box des Trägers mit ANDERER Kennung", async () => {
    const findFirst = vi.fn().mockResolvedValue({ id: "x" });
    const db = { boxStatus: { findFirst } } as unknown as Parameters<typeof otherBoxExists>[0];
    expect(await otherBoxExists(db, "u1", "LOCKMEBOX-1")).toBe(true);
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: "u1", NOT: { boxId: "LOCKMEBOX-1" } } }));
    findFirst.mockResolvedValue(null);
    expect(await otherBoxExists(db, "u1", "LOCKMEBOX-1")).toBe(false);
  });
});
