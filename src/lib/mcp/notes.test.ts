import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", async () => {
  const { createPrismaMock } = await import("@/test/prismaMock");
  return { prisma: createPrismaMock() };
});

import { upsertNoteDef } from "./notes";
import { executeWrite } from "./writeFramework";
import { prisma } from "@/lib/prisma";
import { type PrismaMock } from "@/test/prismaMock";

const db = prisma as unknown as PrismaMock;

// Wiring-Check: upsert_note ruft den zentralen OCC-Validate-Guard (assertVersionRequiresId,
// writeFramework) auf — die Helper-Semantik selbst ist in writeFramework.test.ts getestet.
describe("upsertNoteDef.validate — expectedVersion requires id (OCC wiring)", () => {
  it("rejects expectedVersion without id", () => {
    expect(() => upsertNoteDef.validate!({ text: "x", expectedVersion: 1 })).toThrow(/expectedVersion.*id/i);
  });

  it("accepts expectedVersion with id", () => {
    const args = { id: "n1", text: "x", expectedVersion: 2 };
    expect(upsertNoteDef.validate!(args)).toEqual(args);
  });
});

// N-15 (MCP-Restliste 2026-07-17): der V2-dryRun liefert jetzt diff/after/wouldSucceed wie V1.
describe("upsert_note dryRun — N-15 diff/after (Edit)", () => {
  const ctx = { targetUserId: "u1", targetUsername: "sub" };
  const noteRow = (over: Record<string, unknown> = {}) => ({
    id: "n1", type: "OBSERVATION", text: "alt", kg: null, kategorie: null, pinned: false,
    source: "inferred", confidence: null, status: "active", validFrom: null, validUntil: null,
    doDont: null, supersedesId: null, createdAt: new Date("2026-07-01T00:00:00Z"), version: 1, refs: [], ...over,
  });
  beforeEach(() => {
    vi.clearAllMocks();
    db.user.findUnique.mockResolvedValue({ id: "u1", timezone: "Europe/Zurich" });
  });

  it("Text-Edit → diff {text:[alt,neu]} + after, ohne Commit", async () => {
    db.keyholderNote.findFirst.mockResolvedValue(noteRow());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await executeWrite(upsertNoteDef, ctx, { id: "n1", text: "neu" } as never, { reason: "t", dryRun: true }) as any;
    expect(res.wouldSucceed).toBe(true);
    expect(res.diff).toEqual({ text: ["alt", "neu"] });
    expect(res.after.text).toBe("neu");
    expect(db.keyholderNote.update).not.toHaveBeenCalled();
  });

  it("Pin einer OBSERVATION → diff {pinned:[false,true]}", async () => {
    db.keyholderNote.findFirst.mockResolvedValue(noteRow());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await executeWrite(upsertNoteDef, ctx, { id: "n1", pinned: true } as never, { reason: "t", dryRun: true }) as any;
    expect(res.diff).toEqual({ pinned: [false, true] });
  });
});
