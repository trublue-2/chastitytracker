import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", async () => {
  const { createPrismaMock } = await import("@/test/prismaMock");
  return { prisma: createPrismaMock() };
});

import { upsertNoteDef, queryNotes } from "./notes";
import { NOTE_TEXT_LIMIT } from "./common";
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

  it("Pin einer DIRECTIVE → diff {pinned:[false,true]}", async () => {
    db.keyholderNote.findFirst.mockResolvedValue(noteRow({ type: "DIRECTIVE" }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await executeWrite(upsertNoteDef, ctx, { id: "n1", pinned: true } as never, { reason: "t", dryRun: true }) as any;
    expect(res.diff).toEqual({ pinned: [false, true] });
  });

  // Pins ausser DIRECTIVE/BOUNDARY werden nicht ausgespielt → statt still zu ignorieren: Ablehnung.
  it("Pin einer OBSERVATION (Ist-Typ aus DB, kein type-Arg) → Ablehnung", async () => {
    db.keyholderNote.findFirst.mockResolvedValue(noteRow()); // OBSERVATION
    await expect(
      executeWrite(upsertNoteDef, ctx, { id: "n1", pinned: true } as never, { reason: "t", dryRun: true }),
    ).rejects.toThrow(/cannot be pinned/i);
  });

  it("Neue OBSERVATION mit pinned:true → Ablehnung (Default-Typ)", () => {
    expect(() => upsertNoteDef.validate!({ text: "x", pinned: true })).toThrow(/cannot be pinned/i);
  });

  // Typ-Wechsel einer bereits gepinnten DIRECTIVE auf OBSERVATION (pinned NICHT angefasst) darf
  // keinen verwaisten Pin hinterlassen → Effektiv-Stand wird geprüft.
  it("gepinnte DIRECTIVE → OBSERVATION ohne pinned-Arg → Ablehnung", async () => {
    db.keyholderNote.findFirst.mockResolvedValue(noteRow({ type: "DIRECTIVE", pinned: true }));
    await expect(
      executeWrite(upsertNoteDef, ctx, { id: "n1", type: "OBSERVATION" } as never, { reason: "t", dryRun: true }),
    ).rejects.toThrow(/cannot be pinned/i);
  });

  it("gepinnte DIRECTIVE → OBSERVATION + pinned:false → erlaubt", async () => {
    db.keyholderNote.findFirst.mockResolvedValue(noteRow({ type: "DIRECTIVE", pinned: true }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await executeWrite(upsertNoteDef, ctx, { id: "n1", type: "OBSERVATION", pinned: false } as never, { reason: "t", dryRun: true }) as any;
    expect(res.wouldSucceed).toBe(true);
    expect(res.diff).toEqual({ type: ["DIRECTIVE", "OBSERVATION"], pinned: [true, false] });
  });
});

// K-13 (returnedCount + unknownRef) + K-22 (isLatest) — MCP-Restliste 2026-07-17.
describe("queryNotes — K-13 returnedCount/unknownRef + K-22 isLatest", () => {
  const qNote = (over: Record<string, unknown> = {}) => ({
    id: "n1", type: "OBSERVATION", status: "active", pinned: false, source: "inferred",
    confidence: null, kg: null, kategorie: null, text: "t", doDont: null,
    validFrom: null, validUntil: null, supersedesId: null, createdAt: new Date("2026-07-01T00:00:00Z"),
    version: 1, refs: [], ...over,
  });
  beforeEach(() => {
    vi.clearAllMocks();
    db.user.findUnique.mockResolvedValue({ id: "u1", timezone: "Europe/Zurich" });
  });

  it("returnedCount = Anzahl; isLatest false bei superseded, true sonst", async () => {
    db.keyholderNote.findMany.mockResolvedValue([qNote({ status: "active" }), qNote({ id: "n2", status: "superseded" })]);
    const res = await queryNotes("sub", { status: "all" });
    expect(res.returnedCount).toBe(2);
    expect(res.notes[0].isLatest).toBe(true);
    expect(res.notes[1].isLatest).toBe(false);
  });

  it("unknownRef true, wenn ein konkretes entityType+entityId nicht existiert", async () => {
    db.device.findFirst.mockResolvedValue(null);
    const res = await queryNotes("sub", { entityType: "device", entityId: "ghost" });
    expect(res.unknownRef).toBe(true);
  });

  it("unknownRef false, wenn das Objekt existiert", async () => {
    db.device.findFirst.mockResolvedValue({ id: "d1" });
    const res = await queryNotes("sub", { entityType: "device", entityId: "d1" });
    expect(res.unknownRef).toBe(false);
  });
});

// #109: der Einstiegs-Aufruf einer Sitzung (pinned+active) gab alle gepinnten Dokumente im
// Volltext aus — auf einer Fremd-Instanz 182 KB in EINER Antwort. Die Kappung des Dashboards galt
// ausgerechnet auf dem Weg nicht, den man geht, WEIL man die Dokumente braucht.
describe("queryNotes — Textkappung (#109)", () => {
  const long = "x".repeat(NOTE_TEXT_LIMIT + 500);
  const qNote = (over: Record<string, unknown> = {}) => ({
    id: "n1", type: "DIRECTIVE", status: "active", pinned: true, source: "user-stated",
    confidence: null, kg: null, kategorie: null, text: long, doDont: null,
    validFrom: null, validUntil: null, supersedesId: null, createdAt: new Date("2026-07-01T00:00:00Z"),
    version: 1, refs: [], ...over,
  });
  beforeEach(() => {
    vi.clearAllMocks();
    db.user.findUnique.mockResolvedValue({ id: "u1", timezone: "Europe/Zurich" });
    db.keyholderNote.findMany.mockResolvedValue([qNote()]);
  });

  it("kappt ohne Angabe auf NOTE_TEXT_LIMIT und sagt es", async () => {
    const res = await queryNotes("sub", { pinned: true, status: "active" });
    expect(res.notes[0].text.length).toBeLessThanOrEqual(NOTE_TEXT_LIMIT);
    expect(res.notes[0].textTruncated).toBe(true);
  });

  it("textLimit 0 liefert den Volltext — `0` darf nicht als falsy auf die Vorgabe zurückfallen", async () => {
    const res = await queryNotes("sub", { textLimit: 0 });
    expect(res.notes[0].text).toBe(long);
    expect(res.notes[0].textTruncated).toBeUndefined();
  });

  it("id sucht ohne Status-Filter — eine ersetzte Notiz bleibt gezielt abrufbar", async () => {
    await queryNotes("sub", { id: "n1" });
    const where = db.keyholderNote.findMany.mock.calls[0][0].where;
    expect(where.id).toBe("n1");
    expect(where.status).toBeUndefined();
  });

  it("ein ausdrücklicher status gilt auch neben id", async () => {
    await queryNotes("sub", { id: "n1", status: "superseded" });
    expect(db.keyholderNote.findMany.mock.calls[0][0].where.status).toBe("superseded");
  });
});
