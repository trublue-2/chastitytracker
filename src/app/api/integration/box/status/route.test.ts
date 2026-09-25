import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * Eine Box je Träger (`boxPairing.ts`) auf dem Heimdall-Weg: eine NEUE Box wird abgelehnt, solange
 * der Träger eine andere führt — eine BESTEHENDE meldet sich weiter wie immer, auch bei einem
 * Alt-Träger, der aus der Zeit vor der Regel noch zwei Boxen hat.
 */
vi.mock("@/lib/prisma", async () => {
  const { createPrismaMock } = await import("@/test/prismaMock");
  return { prisma: createPrismaMock() };
});
vi.mock("@/lib/boxSync", () => ({ requireBoxSync: vi.fn(() => null) }));
vi.mock("@/lib/lockCommit", () => ({
  commitPendingLockSafe: vi.fn(),
  findPendingLockTx: vi.fn(),
  findPendingOpenTx: vi.fn(),
}));

import { POST } from "./route";
import { prisma } from "@/lib/prisma";
import type { PrismaMock } from "@/test/prismaMock";

const db = prisma as unknown as PrismaMock;

const req = () =>
  new NextRequest("http://x/api/integration/box/status", {
    method: "POST",
    body: JSON.stringify({ username: "sub", boxId: "heimdall-2", name: "Box 2", locked: false }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  db.user.findUnique.mockResolvedValue({ id: "u1" });
  db.boxStatus.findUnique.mockResolvedValue(null);
  db.boxStatus.findFirst.mockResolvedValue(null);
  db.boxStatus.upsert.mockResolvedValue({});
});

describe("POST /api/integration/box/status — eine Box je Träger", () => {
  it("legt die erste Box des Trägers an", async () => {
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(db.boxStatus.upsert).toHaveBeenCalled();
  });

  it("lehnt eine neue Box ab, solange der Träger eine andere führt", async () => {
    db.boxStatus.findFirst.mockResolvedValue({ id: "lockmebox-row" });
    const res = await POST(req());
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "BOX_ONE_PER_USER" });
    expect(db.boxStatus.upsert).not.toHaveBeenCalled();
  });

  it("eine bestehende Box meldet sich weiter, auch wenn es daneben eine zweite gibt", async () => {
    db.boxStatus.findUnique.mockResolvedValue({ pendingCommand: null });
    db.boxStatus.findFirst.mockResolvedValue({ id: "andere" });
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(db.boxStatus.findFirst).not.toHaveBeenCalled();
    expect(db.boxStatus.upsert).toHaveBeenCalled();
  });
});
