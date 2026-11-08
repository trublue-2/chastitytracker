import { describe, it, expect, vi, beforeEach } from "vitest";

const tx = {
  entry: { findUnique: vi.fn(), create: vi.fn() },
};
vi.mock("@/lib/shared/prisma", () => ({
  prisma: { $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)) },
}));
vi.mock("@/lib/entries/queries", () => ({ getKgNeighbors: vi.fn() }));

import { createEntryGapForUser, validateEntryGap } from "./entryGapService";
import { getKgNeighbors } from "@/lib/entries/queries";

const neighbors = getKgNeighbors as unknown as ReturnType<typeof vi.fn>;
const USER = { id: "u1", orgasmusArtenConfig: null, oeffnenGruendeConfig: null };
const at = (h: number) => new Date(Date.UTC(2026, 9, 1, h));
const INPUT = { kind: "break" as const, openAt: at(10), lockAt: at(12), oeffnenGrund: "KEYHOLDER", note: "vergessen" };

beforeEach(() => {
  vi.clearAllMocks();
  tx.entry.findUnique.mockResolvedValue({ deviceId: "d1" });
  tx.entry.create.mockImplementation(async ({ data }: { data: object }) => ({ id: "x", ...data }));
});

describe("createEntryGapForUser", () => {
  it("schreibt Öffnen und Wiederverschluss, Gerät vom umgebenden Verschluss", async () => {
    neighbors.mockResolvedValue({ prev: { id: "p", type: "VERSCHLUSS", startTime: at(8) }, next: { id: "n", type: "OEFFNEN", startTime: at(20) } });
    const res = await createEntryGapForUser(USER, INPUT);
    expect(res.ok).toBe(true);
    const [open, lock] = tx.entry.create.mock.calls.map((c) => c[0].data);
    expect(open).toMatchObject({ type: "OEFFNEN", startTime: INPUT.openAt, oeffnenGrund: "KEYHOLDER" });
    expect(lock).toMatchObject({ type: "VERSCHLUSS", startTime: INPUT.lockAt, deviceId: "d1", boltConfirmedAt: INPUT.lockAt });
  });

  it("erlaubt die laufende Tragephase (kein Nachbar danach)", async () => {
    neighbors.mockResolvedValue({ prev: { id: "p", type: "VERSCHLUSS", startTime: at(8) }, next: null });
    expect((await createEntryGapForUser(USER, INPUT)).ok).toBe(true);
  });

  it("lehnt ab, wenn der Träger zum Öffnungszeitpunkt nicht verschlossen war", async () => {
    neighbors.mockResolvedValue({ prev: { id: "p", type: "OEFFNEN", startTime: at(8) }, next: null });
    expect(await createEntryGapForUser(USER, INPUT)).toEqual({ ok: false, error: "GAP_NOT_LOCKED" });
    neighbors.mockResolvedValue({ prev: null, next: null });
    expect(await createEntryGapForUser(USER, INPUT)).toEqual({ ok: false, error: "GAP_NOT_LOCKED" });
    expect(tx.entry.create).not.toHaveBeenCalled();
  });

  it("lehnt ab, wenn das Paar über das nächste bestehende Öffnen hinausreicht", async () => {
    neighbors.mockResolvedValue({ prev: { id: "p", type: "VERSCHLUSS", startTime: at(8) }, next: { id: "n", type: "OEFFNEN", startTime: at(11) } });
    expect(await createEntryGapForUser(USER, INPUT)).toEqual({ ok: false, error: "INVALID_ORDER" });
  });

  it("verlangt Abstand zum vorherigen Verschluss", async () => {
    neighbors.mockResolvedValue({ prev: { id: "p", type: "VERSCHLUSS", startTime: at(10) }, next: null });
    expect(await createEntryGapForUser(USER, INPUT)).toEqual({ ok: false, error: "INVALID_ORDER" });
  });
});

describe("createEntryGapForUser — kind: session (Tragezeit in einer offenen Phase)", () => {
  // lockAt VOR openAt: zuerst verschlossen, dann geöffnet.
  const SESSION = { kind: "session" as const, lockAt: at(10), openAt: at(12), oeffnenGrund: "KEYHOLDER", note: "vergessen" };

  it("schreibt Verschluss und Öffnung, ohne Gerät, in zeitlicher Reihenfolge", async () => {
    neighbors.mockResolvedValue({ prev: { id: "p", type: "OEFFNEN", startTime: at(8) }, next: { id: "n", type: "VERSCHLUSS", startTime: at(20) } });
    const res = await createEntryGapForUser(USER, SESSION);
    expect(res.ok).toBe(true);
    const [lock, open] = tx.entry.create.mock.calls.map((c) => c[0].data);
    expect(lock).toMatchObject({ type: "VERSCHLUSS", startTime: SESSION.lockAt, boltConfirmedAt: SESSION.lockAt });
    expect(lock.deviceId).toBeNull();
    expect(open).toMatchObject({ type: "OEFFNEN", startTime: SESSION.openAt, oeffnenGrund: "KEYHOLDER", note: "vergessen" });
    expect(neighbors).toHaveBeenCalledWith("u1", SESSION.lockAt, tx);
  });

  it("erlaubt eine Tragezeit vor dem ersten Eintrag", async () => {
    neighbors.mockResolvedValue({ prev: null, next: { id: "n", type: "VERSCHLUSS", startTime: at(20) } });
    expect((await createEntryGapForUser(USER, SESSION)).ok).toBe(true);
  });

  it("erlaubt eine Tragezeit nach der letzten Öffnung (kein Nachbar danach)", async () => {
    neighbors.mockResolvedValue({ prev: { id: "p", type: "OEFFNEN", startTime: at(8) }, next: null });
    expect((await createEntryGapForUser(USER, SESSION)).ok).toBe(true);
  });

  it("lehnt ab, wenn der Träger zum Verschlusszeitpunkt schon verschlossen war", async () => {
    neighbors.mockResolvedValue({ prev: { id: "p", type: "VERSCHLUSS", startTime: at(8) }, next: null });
    expect(await createEntryGapForUser(USER, SESSION)).toEqual({ ok: false, error: "GAP_NOT_OPEN" });
    expect(tx.entry.create).not.toHaveBeenCalled();
  });

  it("lehnt ab, wenn die Öffnung über den nächsten bestehenden Verschluss hinausreicht", async () => {
    neighbors.mockResolvedValue({ prev: { id: "p", type: "OEFFNEN", startTime: at(8) }, next: { id: "n", type: "VERSCHLUSS", startTime: at(11) } });
    expect(await createEntryGapForUser(USER, SESSION)).toEqual({ ok: false, error: "INVALID_ORDER" });
  });

  it("lehnt eine Kette ab, deren Nachbar danach ein Öffnen ist (Anomalie)", async () => {
    neighbors.mockResolvedValue({ prev: null, next: { id: "n", type: "OEFFNEN", startTime: at(20) } });
    expect(await createEntryGapForUser(USER, SESSION)).toEqual({ ok: false, error: "INVALID_ORDER" });
  });

  it("verlangt Abstand zur vorherigen Öffnung", async () => {
    neighbors.mockResolvedValue({ prev: { id: "p", type: "OEFFNEN", startTime: at(10) }, next: null });
    expect(await createEntryGapForUser(USER, SESSION)).toEqual({ ok: false, error: "INVALID_ORDER" });
  });
});

describe("validateEntryGap", () => {
  it("Öffnen muss vor dem Wiederverschluss liegen", () => {
    expect(validateEntryGap(USER, { ...INPUT, openAt: at(12), lockAt: at(10) })).toBe("INVALID_ORDER");
  });
  it("kind session: Verschluss muss vor der Öffnung liegen", () => {
    expect(validateEntryGap(USER, { ...INPUT, kind: "session", lockAt: at(12), openAt: at(10) })).toBe("INVALID_ORDER");
    expect(validateEntryGap(USER, { ...INPUT, kind: "session", lockAt: at(10), openAt: at(12) })).toBeNull();
  });
  it("verlangt Notiz und Grund wie das Einzel-Öffnen", () => {
    expect(validateEntryGap(USER, { ...INPUT, note: " " })).toBe("NOTE_REQUIRED");
    expect(validateEntryGap(USER, { ...INPUT, oeffnenGrund: "" })).toBe("OPENING_REASON_REQUIRED");
  });
  it("lehnt die Zukunft ab", () => {
    const far = new Date(Date.now() + 3_600_000);
    expect(validateEntryGap(USER, { ...INPUT, openAt: new Date(Date.now() - 1000), lockAt: far })).toBe("TIME_IN_FUTURE");
  });
});

describe("entryGapEnabled", () => {
  it("ist ohne ALLOW_ENTRY_GAP aus", async () => {
    const { entryGapEnabled } = await import("./entryGapService");
    delete process.env.ALLOW_ENTRY_GAP;
    expect(entryGapEnabled()).toBe(false);
    process.env.ALLOW_ENTRY_GAP = "true";
    expect(entryGapEnabled()).toBe(true);
    delete process.env.ALLOW_ENTRY_GAP;
  });
});
