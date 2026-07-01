import { describe, it, expect } from "vitest";
import { setHealthHoldDef } from "./context";

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
