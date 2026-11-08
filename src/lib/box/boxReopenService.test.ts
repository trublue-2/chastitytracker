import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Der Reparaturweg „Tracker offen, Box zu" (`requestBoxReopen`). Gepinnt wird vor allem, WANN er
 * NICHT greift: nach einer Sperrbruch-Öffnung hielte der Knopf sonst die Strafe auf, indem der
 * Träger sich selbst öffnet.
 */

const findMany = vi.fn();
vi.mock("@/lib/shared/prisma", () => ({ prisma: { boxStatus: { findMany: (...a: unknown[]) => findMany(...a) } } }));
vi.mock("@/lib/entries/queries", () => ({ getIsLocked: vi.fn(), getInterruptedLockPeriod: vi.fn() }));
vi.mock("@/lib/box/boxCommand", () => ({ setBoxCommandForUser: vi.fn() }));
vi.mock("@/lib/box/boxCommandNotify", () => ({ announceBoxCommand: vi.fn() }));

import { boxReopenBlockReason, requestBoxReopen } from "./boxReopenService";
import { getIsLocked, getInterruptedLockPeriod } from "@/lib/entries/queries";
import { setBoxCommandForUser } from "@/lib/box/boxCommand";
import { announceBoxCommand } from "@/lib/box/boxCommandNotify";

const fn = <T>(f: T) => f as unknown as ReturnType<typeof vi.fn>;
const BOX_ZU = { kind: "lockmebox", locked: true, reportedLocked: true, pendingCommand: null };
const BOX_OFFEN = { kind: "lockmebox", locked: false, reportedLocked: false, pendingCommand: null };

beforeEach(() => {
  vi.clearAllMocks();
  findMany.mockResolvedValue([BOX_ZU]);
  fn(getIsLocked).mockResolvedValue(false);
  fn(getInterruptedLockPeriod).mockResolvedValue(null);
  fn(setBoxCommandForUser).mockResolvedValue(true);
});

describe("boxReopenBlockReason", () => {
  it("erlaubt es, wenn der Tracker offen ist und die Box zu meldet", async () => {
    expect(await boxReopenBlockReason("u1", [BOX_ZU])).toBeNull();
  });

  it("nichts zu reparieren, solange keine Box den Riegel als zu meldet", async () => {
    expect(await boxReopenBlockReason("u1", [BOX_OFFEN])).toBe("BOX_REOPEN_NOT_LOCKED");
    expect(await boxReopenBlockReason("u1", [])).toBe("BOX_REOPEN_NOT_LOCKED");
  });

  it("bei Heimdall nie: dort ist „Tracker offen, Box wartet auf den Knopf\" der Normalfall", async () => {
    expect(await boxReopenBlockReason("u1", [{ ...BOX_ZU, kind: "heimdall" }])).toBe("BOX_REOPEN_NOT_LOCKED");
  });

  it("nicht, solange der Öffnen-Befehl noch wartet — er ist ja nicht verloren", async () => {
    expect(await boxReopenBlockReason("u1", [{ ...BOX_ZU, pendingCommand: "open" }])).toBe("BOX_REOPEN_NOT_LOCKED");
  });

  it("nichts zu öffnen, solange der Tracker selbst verschlossen ist", async () => {
    fn(getIsLocked).mockResolvedValue(true);
    expect(await boxReopenBlockReason("u1", [BOX_ZU])).toBe("BOX_REOPEN_NOT_OPEN");
  });

  it("nicht nach einer Sperrbruch-Öffnung — die Box bleibt dann mit Absicht zu", async () => {
    fn(getInterruptedLockPeriod).mockResolvedValue({ endsAt: new Date(), withdrawnAt: new Date(), message: null });
    expect(await boxReopenBlockReason("u1", [BOX_ZU])).toBe("BOX_REOPEN_HELD");
  });
});

describe("requestBoxReopen", () => {
  it("setzt den Öffnen-Befehl und sagt ihn an", async () => {
    expect(await requestBoxReopen("u1")).toEqual({ ok: true, data: null });
    expect(setBoxCommandForUser).toHaveBeenCalledWith(expect.anything(), "u1", "open");
    expect(announceBoxCommand).toHaveBeenCalledWith("u1", "open");
  });

  it("sagt nichts an, wenn kein Kommando gesetzt wurde", async () => {
    fn(setBoxCommandForUser).mockResolvedValue(false);
    await requestBoxReopen("u1");
    expect(announceBoxCommand).not.toHaveBeenCalled();
  });

  it("lehnt mit 409 und dem Grund ab und setzt dann nichts", async () => {
    fn(getInterruptedLockPeriod).mockResolvedValue({ endsAt: new Date(), withdrawnAt: new Date(), message: null });
    expect(await requestBoxReopen("u1")).toMatchObject({ ok: false, status: 409, error: "BOX_REOPEN_HELD" });
    expect(setBoxCommandForUser).not.toHaveBeenCalled();
  });
});
