import { describe, it, expect } from "vitest";
import { setHealthHoldDef, upsertRecurringContextDef } from "./context";

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
