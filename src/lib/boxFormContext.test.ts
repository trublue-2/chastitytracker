import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * `getBoxFormContext`: was Formulare und Einstellungen über die Box des Trägers wissen. `boltAlways` ist
 * die Auskunft, dass der Schalter der Keyholderin bei einer LockMeBox nicht wirkt (`lockAwaitsBolt`).
 */
vi.mock("@/lib/prisma", async () => {
  const { createPrismaMock } = await import("@/test/prismaMock");
  return { prisma: createPrismaMock() };
});

import { getBoxFormContext } from "./queries";
import { prisma } from "@/lib/prisma";
import type { PrismaMock } from "@/test/prismaMock";

const db = prisma as unknown as PrismaMock;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("HEIMDALL_SYNC_SECRET", "s3cret");
  vi.stubEnv("BLE_BRIDGE_KEY", "000102030405060708090a0b0c0d0e0f");
});
afterEach(() => vi.unstubAllEnvs());

describe("getBoxFormContext", () => {
  it("LockMeBox: der Riegel gilt immer, der Schalter wirkt nicht", async () => {
    const rows = [{ name: "LOCKMEBOX-1", kind: "lockmebox", boxId: "LOCKMEBOX-1" }];
    db.boxStatus.findMany.mockResolvedValue(rows);
    expect(await getBoxFormContext("u1")).toEqual({ boxConfirm: true, boxName: "LOCKMEBOX-1", requiresBolt: true, boltAlways: true, boxes: rows });
    expect(db.user.findUnique).not.toHaveBeenCalled();
  });

  it("Heimdall: der Schalter der Keyholderin entscheidet", async () => {
    db.boxStatus.findMany.mockResolvedValue([{ name: "Küche", kind: "heimdall", boxId: "hd-42" }]);
    db.user.findUnique.mockResolvedValue({ lockRequiresBolt: false });
    expect(await getBoxFormContext("u1")).toMatchObject({ boxConfirm: true, requiresBolt: false, boltAlways: false, boxes: [{ kind: "heimdall", boxId: "hd-42", name: "Küche" }] });
    db.user.findUnique.mockResolvedValue({ lockRequiresBolt: true });
    expect(await getBoxFormContext("u1")).toMatchObject({ requiresBolt: true, boltAlways: false });
  });

  it("ohne Box: nichts zu fragen und nichts erzwungen", async () => {
    db.boxStatus.findMany.mockResolvedValue([]);
    expect(await getBoxFormContext("u1")).toEqual({ boxConfirm: false, boxName: "", requiresBolt: false, boltAlways: false, boxes: [] });
  });
});
