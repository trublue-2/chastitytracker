import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", async () => {
  const { createPrismaMock } = await import("@/test/prismaMock");
  return { prisma: createPrismaMock() };
});

import { setHealthHoldDef, upsertAppointmentDef, upsertRecurringContextDef } from "./context";
import { executeWrite } from "./writeFramework";
import { prisma } from "@/lib/prisma";
import { type PrismaMock } from "@/test/prismaMock";

const db = prisma as unknown as PrismaMock;

// windowsBinding/windowsBindingReason/openingAllowedNow (A-02) sind bei `cleaningWindowBindingStatus`
// in src/lib/queries.ts getestet — colocated mit `cleaningBlockReason`, dessen Einordnung sie ist.

// Regression: runV2Write (route.ts) destructures `reason` out of the raw tool args as the
// mandatory AUDIT field before the domain-specific args ever reach validate()/apply(). The
// set_health_hold domain field was originally ALSO named `reason` — same name, different meaning —
// so it was silently swallowed and validate() always saw undefined, making "active hold" fail with
// "requires a reason" even when a reason was given. Renamed to `healthReason`; these tests pin it.
describe("setHealthHoldDef.validate", () => {
  it("accepts activation with a healthReason", () => {
    const args = { active: true, healthReason: "Migräne/Aura" };
    expect(setHealthHoldDef.validate!(args)).toEqual(args);
  });

  it("rejects activation without a healthReason", () => {
    expect(() => setHealthHoldDef.validate!({ active: true })).toThrow(/requires a reason/i);
  });

  it("rejects activation with a blank healthReason", () => {
    expect(() => setHealthHoldDef.validate!({ active: true, healthReason: "   " })).toThrow(/requires a reason/i);
  });

  it("clearing (active:false) needs no healthReason", () => {
    const args = { active: false };
    expect(setHealthHoldDef.validate!(args)).toEqual(args);
  });
});

// Regression: ordinal lets a recurring context apply only to the n-th (1..5) or last (-1)
// occurrence of a weekday in the month — e.g. "erster Mittwoch im Monat" = weekday:3, ordinal:1 —
// instead of living only as unstructured free-text.
describe("upsertRecurringContextDef.validate — ordinal", () => {
  it("accepts a new slot with ordinal:1 (n-ter Wochentag)", () => {
    const args = { label: "Midweek-Party", weekday: 3, ordinal: 1 };
    expect(upsertRecurringContextDef.validate!(args)).toEqual(args);
  });

  it("accepts ordinal:-1 (letzter Wochentag im Monat)", () => {
    const args = { label: "Monatsabschluss", weekday: 5, ordinal: -1 };
    expect(upsertRecurringContextDef.validate!(args)).toEqual(args);
  });

  it("accepts omitted/null ordinal (jede Woche — bisheriges Verhalten)", () => {
    const args = { label: "Pilates", weekday: 2 };
    expect(upsertRecurringContextDef.validate!(args)).toEqual(args);
  });

  it("rejects ordinal:0 and out-of-range values", () => {
    expect(() => upsertRecurringContextDef.validate!({ label: "x", weekday: 1, ordinal: 0 })).toThrow(/ordinal/i);
    expect(() => upsertRecurringContextDef.validate!({ label: "x", weekday: 1, ordinal: 6 })).toThrow(/ordinal/i);
    expect(() => upsertRecurringContextDef.validate!({ label: "x", weekday: 1, ordinal: -2 })).toThrow(/ordinal/i);
  });
});

// Ausnahme-Daten (exclusionDates): der Slot fällt an diesen Tagen aus, damit „Findet am X statt?"
// aus der API beantwortbar ist statt aus dem Notiz-Freitext (MCP-Restliste 2026-07-18).
describe("upsertRecurringContextDef.validate — exclusionDates", () => {
  it("accepts valid YYYY-MM-DD exclusion dates", () => {
    const args = { label: "Pilates", weekday: 2, exclusionDates: ["2026-07-21", "2026-07-28"] };
    expect(upsertRecurringContextDef.validate!(args)).toEqual(args);
  });
  it("rejects malformed or impossible dates", () => {
    expect(() => upsertRecurringContextDef.validate!({ label: "x", weekday: 2, exclusionDates: ["21.07.2026"] })).toThrow(/exclusionDates/i);
    expect(() => upsertRecurringContextDef.validate!({ label: "x", weekday: 2, exclusionDates: ["2026-13-40"] })).toThrow(/exclusionDates/i);
    // Kalender-unmögliche Tage: Date rollt sie sonst weiter (2026-02-30 → März 2) und die Ausnahme
    // träfe nie ein echtes Datum → muss abgewiesen werden.
    expect(() => upsertRecurringContextDef.validate!({ label: "x", weekday: 2, exclusionDates: ["2026-02-30"] })).toThrow(/exclusionDates/i);
    expect(() => upsertRecurringContextDef.validate!({ label: "x", weekday: 2, exclusionDates: ["2026-06-31"] })).toThrow(/exclusionDates/i);
  });
});

// Wiring-Check: beide Kontext-Edit-Tools rufen den zentralen OCC-Validate-Guard
// (assertVersionRequiresId, writeFramework) auf — die Helper-Semantik selbst ist dort getestet.
describe("expectedVersion requires id (OCC wiring)", () => {
  it("upsert_appointment rejects expectedVersion without id", () => {
    expect(() => upsertAppointmentDef.validate!({ when: "2026-07-16T10:00:00Z", expectedVersion: 1 })).toThrow(/expectedVersion.*id/i);
  });

  it("upsert_recurring_context rejects expectedVersion without id", () => {
    expect(() => upsertRecurringContextDef.validate!({ label: "HO", weekday: 1, expectedVersion: 1 })).toThrow(/expectedVersion.*id/i);
  });
});

// N-15 (MCP-Restliste 2026-07-17): der V2-dryRun liefert jetzt diff/after/wouldSucceed wie V1.
describe("upsert_appointment / set_health_hold dryRun — N-15 diff/after", () => {
  const ctx = { targetUserId: "u1", targetUsername: "sub" };
  beforeEach(() => {
    vi.clearAllMocks();
    db.user.findUnique.mockResolvedValue({ id: "u1", timezone: "Europe/Zurich" });
  });

  it("upsert_appointment Edit → diff [alt,neu] + after, ohne Commit", async () => {
    db.appointment.findFirst.mockResolvedValue({ id: "a1", when: new Date("2026-08-01T10:00:00Z"), typ: null, deviceFree: false, note: null, version: 1 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await executeWrite(upsertAppointmentDef, ctx, { id: "a1", deviceFree: true } as never, { reason: "t", dryRun: true }) as any;
    expect(res.wouldSucceed).toBe(true);
    expect(res.diff).toEqual({ deviceFree: [false, true] });
    expect(res.after.deviceFree).toBe(true);
    expect(db.appointment.update).not.toHaveBeenCalled();
  });

  it("upsert_recurring_context Edit → exclusionDates als Array in diff/after (JSON-Spalte)", async () => {
    db.recurringContext.findFirst.mockResolvedValue({ id: "r1", label: "Pilates", weekday: 2, ordinal: null, deviceFree: false, exclusionDates: null, note: null, version: 1 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await executeWrite(upsertRecurringContextDef, ctx, { id: "r1", exclusionDates: ["2026-07-21", "2026-07-28"] } as never, { reason: "t", dryRun: true }) as any;
    expect(res.wouldSucceed).toBe(true);
    expect(res.after.exclusionDates).toEqual(["2026-07-21", "2026-07-28"]);
    expect(res.diff).toEqual({ exclusionDates: [[], ["2026-07-21", "2026-07-28"]] });
    expect(db.recurringContext.update).not.toHaveBeenCalled();
  });

  it("set_health_hold aktivieren → diff active [false,true] + reason", async () => {
    db.healthHold.findFirst.mockResolvedValue(null); // kein aktiver Hold
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await executeWrite(setHealthHoldDef, ctx, { active: true, healthReason: "krank" } as never, { reason: "t", dryRun: true }) as any;
    expect(res.wouldSucceed).toBe(true);
    expect(res.diff).toEqual({ active: [false, true], reason: [null, "krank"] });
  });

  it("set_health_hold deaktivieren OHNE aktiven Hold → leerer diff (No-op, nicht [true,false])", async () => {
    db.healthHold.findFirst.mockResolvedValue(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await executeWrite(setHealthHoldDef, ctx, { active: false } as never, { reason: "t", dryRun: true }) as any;
    expect(res.diff).toEqual({});
  });
});
