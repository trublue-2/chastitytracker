import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * `setLockRequiresBolt`: der Schalter der Keyholderin — bei einer LockMeBox ohne Wirkung. Der Riegel gilt
 * dort immer (`lockAwaitsBolt`); ein Abschalten, das einen wartenden Aufruf OHNE Riegel vollzöge, widerspräche
 * dieser Regel.
 */
vi.mock("@/lib/prisma", async () => {
  const { createPrismaMock } = await import("@/test/prismaMock");
  return { prisma: createPrismaMock() };
});
vi.mock("@/lib/boxPhotoDueService", () => ({ markBoxPhotoDue: vi.fn() }));

import { setLockRequiresBolt } from "./lockCommit";
import { prisma } from "@/lib/prisma";
import type { PrismaMock } from "@/test/prismaMock";

const db = prisma as unknown as PrismaMock;

beforeEach(() => {
  vi.clearAllMocks();
  db.entry.findFirst.mockResolvedValue(null); // kein wartender Aufruf
});

describe("setLockRequiresBolt", () => {
  it("LockMeBox: schreibt nichts und vollzieht nichts", async () => {
    db.boxStatus.findMany.mockResolvedValue([{ kind: "lockmebox" }]);
    expect(await setLockRequiresBolt("u1", false)).toBe(false);
    expect(db.user.update).not.toHaveBeenCalled();
    expect(db.entry.findFirst).not.toHaveBeenCalled();
  });

  it("Heimdall: setzt den Schalter", async () => {
    db.boxStatus.findMany.mockResolvedValue([{ kind: "heimdall" }]);
    expect(await setLockRequiresBolt("u1", true)).toBe(true);
    expect(db.user.update).toHaveBeenCalledWith({ where: { id: "u1" }, data: { lockRequiresBolt: true } });
  });

  it("Heimdall: das Abschalten sucht einen wartenden Aufruf, um ihn zu vollziehen", async () => {
    db.boxStatus.findMany.mockResolvedValue([{ kind: "heimdall" }]);
    expect(await setLockRequiresBolt("u1", false)).toBe(true);
    expect(db.entry.findFirst).toHaveBeenCalled();
  });

  it("ohne Box: der Schalter bleibt setzbar (wirkt erst, wenn eine Box meldet)", async () => {
    db.boxStatus.findMany.mockResolvedValue([]);
    expect(await setLockRequiresBolt("u1", true)).toBe(true);
    expect(db.user.update).toHaveBeenCalled();
  });
});
