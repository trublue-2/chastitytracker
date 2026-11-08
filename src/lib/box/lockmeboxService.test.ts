import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Der Erstkontakt der LockMeBox-Brücke (`lockmeboxRelayStep`): er koppelt — aber nur, solange der
 * Träger keine andere Box führt (eine Box je Träger, `boxPairing.ts`), und nie mit zwei Passwörtern,
 * auch wenn zwei Erstkontakte gleichzeitig ankommen.
 */
vi.mock("@/lib/prisma", async () => {
  const { createPrismaMock } = await import("@/test/prismaMock");
  return { prisma: createPrismaMock() };
});
vi.mock("@/lib/lockCommit", () => ({
  commitPendingLockSafe: vi.fn(),
  commitPendingOpenSafe: vi.fn(),
  findPendingLockTx: vi.fn(),
  findPendingOpenTx: vi.fn(),
}));

import { lockmeboxRelayStep } from "./lockmeboxService";
import { prisma } from "@/lib/prisma";
import type { PrismaMock } from "@/test/prismaMock";

const db = prisma as unknown as PrismaMock;
const BOX = "LOCKMEBOX-1";
const PAIRED = { kind: "lockmebox", lockPassword: "Abc1234567", pendingCommand: null };
const FIRST_CONTACT = { boxId: BOX, line: null, sent: null };

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("BLE_BRIDGE_KEY", "000102030405060708090a0b0c0d0e0f");
  db.boxStatus.findUnique.mockResolvedValue(null);
  db.boxStatus.findFirst.mockResolvedValue(null);
  db.boxStatus.create.mockResolvedValue(PAIRED);
});
afterEach(() => vi.unstubAllEnvs());

describe("lockmeboxRelayStep — Erstkontakt", () => {
  it("koppelt eine unbekannte Box samt Passwort und fragt ihren Status ab", async () => {
    const result = await lockmeboxRelayStep("u1", FIRST_CONTACT);
    expect(result.ok && result.data.send?.command).toBe("status");
    expect(db.boxStatus.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ userId: "u1", boxId: BOX, kind: "lockmebox", lockPassword: expect.any(String) }),
    }));
  });

  it("lehnt eine zweite Box ab, solange der Träger eine andere führt", async () => {
    db.boxStatus.findFirst.mockResolvedValue({ id: "heimdall-row" });
    expect(await lockmeboxRelayStep("u1", FIRST_CONTACT)).toMatchObject({ ok: false, status: 409, error: "BOX_ONE_PER_USER" });
    expect(db.boxStatus.create).not.toHaveBeenCalled();
  });

  it("lässt eine schon gekoppelte Box unangetastet — keine Prüfung, kein neues Passwort", async () => {
    db.boxStatus.findUnique.mockResolvedValue(PAIRED);
    expect((await lockmeboxRelayStep("u1", FIRST_CONTACT)).ok).toBe(true);
    expect(db.boxStatus.findFirst).not.toHaveBeenCalled();
    expect(db.boxStatus.create).not.toHaveBeenCalled();
  });

  it("zwei gleichzeitige Erstkontakte: der zweite liest die eben angelegte Zeile statt zu scheitern", async () => {
    db.boxStatus.create.mockRejectedValue({ code: "P2002", meta: { target: ["userId", "boxId"] } });
    db.boxStatus.findUniqueOrThrow.mockResolvedValue(PAIRED);
    expect((await lockmeboxRelayStep("u1", FIRST_CONTACT)).ok).toBe(true);
    expect(db.boxStatus.findUniqueOrThrow).toHaveBeenCalled();
  });
});

describe("lockmeboxRelayStep — Schliessbefehl", () => {
  // 17 Felder + Schlussstrich; Feld 1 = verriegelt (0 = offen), Feld 14 = Firmware.
  const OPEN_LINE = "<S/0/0/0/1/80/0/0/0/0/0/0/0/0/15/1/1/>";

  it("markiert die Box ab dem Senden als „vermutlich zu“ — SOLL zu, IST unbekannt", async () => {
    db.boxStatus.findUnique.mockResolvedValue({ ...PAIRED, pendingCommand: "lock" });
    db.boxStatus.update.mockResolvedValue({});
    const result = await lockmeboxRelayStep("u1", { boxId: BOX, line: OPEN_LINE, sent: null });
    expect(result.ok && result.data.send?.command).toBe("lock");
    expect(db.boxStatus.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ locked: true, reportedLocked: null }),
    }));
  });

  it("ohne Schliessbefehl übernimmt die Zeile den gemeldeten Zustand", async () => {
    db.boxStatus.update.mockResolvedValue({});
    db.boxStatus.findUnique.mockResolvedValue(PAIRED);
    await lockmeboxRelayStep("u1", { boxId: BOX, line: OPEN_LINE, sent: null });
    expect(db.boxStatus.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ locked: false, reportedLocked: false }),
    }));
  });
});
