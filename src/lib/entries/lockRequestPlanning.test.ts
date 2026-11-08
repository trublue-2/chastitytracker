import { describe, it, expect } from "vitest";
import { resolveLockFormArt, LOCK_FORM_PLAN_MODE } from "./lockRequestPlanning";

describe("resolveLockFormArt", () => {
  it("unverschlossen: immer die Anforderung", () => {
    expect(resolveLockFormArt(false, undefined)).toBe("ANFORDERUNG");
    expect(resolveLockFormArt(false, LOCK_FORM_PLAN_MODE)).toBe("ANFORDERUNG");
  });

  it("verschlossen ohne Modus: die Sperrzeit wie bisher", () => {
    expect(resolveLockFormArt(true, undefined)).toBe("SPERRZEIT");
    expect(resolveLockFormArt(true, "sonstwas")).toBe("SPERRZEIT");
  });

  it("verschlossen mit ?mode=plan: die (nur terminierte) Anforderung", () => {
    expect(resolveLockFormArt(true, LOCK_FORM_PLAN_MODE)).toBe("ANFORDERUNG");
  });

  it("ein doppelter Parameter öffnet nichts Unerwartetes", () => {
    expect(resolveLockFormArt(true, [LOCK_FORM_PLAN_MODE, LOCK_FORM_PLAN_MODE])).toBe("SPERRZEIT");
  });
});
