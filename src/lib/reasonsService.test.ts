import { describe, it, expect } from "vitest";
import {
  parseReasonConfig,
  generateReasonCode,
  resolveReasonLabel,
  resolveReasonList,
  validOrgasmusCodes,
  validOeffnenCodes,
  PROTECTED_OPENING_CODE,
  type ReasonEntry,
} from "./reasonsService";
import { ORGASMUS_ARTEN, OEFFNEN_GRUENDE } from "./constants";

const t = (k: string) => `T:${k}`;

describe("parseReasonConfig — defaults & backward-compat", () => {
  it("null → built-in orgasm list (order + codes unchanged)", () => {
    expect(parseReasonConfig(null, "orgasm")).toEqual(ORGASMUS_ARTEN.map((code) => ({ code })));
  });
  it("null → built-in opening list (REINIGUNG first)", () => {
    expect(parseReasonConfig(null, "opening")).toEqual(OEFFNEN_GRUENDE.map((code) => ({ code })));
  });
  it("garbage string → defaults", () => {
    expect(parseReasonConfig("not json", "orgasm")).toEqual(ORGASMUS_ARTEN.map((code) => ({ code })));
    expect(parseReasonConfig("{}", "opening")).toEqual(OEFFNEN_GRUENDE.map((code) => ({ code })));
  });
  it("accepts a JSON string (stored form)", () => {
    const stored = JSON.stringify([{ code: "KEYHOLDER" }, { code: "REINIGUNG", label: "Putzen" }]);
    expect(parseReasonConfig(stored, "opening")).toEqual([{ code: "KEYHOLDER" }, { code: "REINIGUNG", label: "Putzen" }]);
  });
});

describe("parseReasonConfig — REINIGUNG invariant", () => {
  it("re-injects REINIGUNG at front when missing", () => {
    const out = parseReasonConfig([{ code: "KEYHOLDER" }], "opening");
    expect(out[0]).toEqual({ code: PROTECTED_OPENING_CODE });
    expect(out.map((e) => e.code)).toContain("KEYHOLDER");
  });
  it("preserves a renamed REINIGUNG label + position", () => {
    const out = parseReasonConfig([{ code: "KEYHOLDER" }, { code: "REINIGUNG", label: "Putzen" }], "opening");
    expect(out.find((e) => e.code === "REINIGUNG")).toEqual({ code: "REINIGUNG", label: "Putzen" });
    expect(out.map((e) => e.code)).toEqual(["KEYHOLDER", "REINIGUNG"]);
  });
});

describe("parseReasonConfig — normalization", () => {
  it("dedups by code (first wins)", () => {
    expect(parseReasonConfig([{ code: "Orgasmus" }, { code: "Orgasmus", label: "dup" }], "orgasm")).toEqual([{ code: "Orgasmus" }]);
  });
  it("caps at 12 entries", () => {
    const many = Array.from({ length: 15 }, (_, i) => ({ code: `c_${"0".repeat(8)}${i}` }));
    expect(parseReasonConfig(many, "orgasm").length).toBe(12);
  });
  it("strips control chars but KEEPS internal spaces, trims, caps 40", () => {
    const TAB = String.fromCharCode(9), NUL = String.fromCharCode(0);
    const out = parseReasonConfig([{ code: "Orgasmus", label: `  a${TAB}b${NUL} c  ` }], "orgasm");
    expect(out[0].label).toBe("ab c"); // TAB+NUL removed, the space in "b c" kept, outer trimmed
    const long = parseReasonConfig([{ code: "Orgasmus", label: "x".repeat(60) }], "orgasm");
    expect(long[0].label).toBe("x".repeat(40));
  });
  it("multi-word label keeps its spaces", () => {
    expect(parseReasonConfig([{ code: "Orgasmus", label: "sanfter Hoehepunkt" }], "orgasm")[0].label).toBe("sanfter Hoehepunkt");
  });
  it("whitespace-only label → no label field", () => {
    expect(parseReasonConfig([{ code: "Orgasmus", label: "   " }], "orgasm")).toEqual([{ code: "Orgasmus" }]);
  });
  it("a row without a valid code gets a generated custom code", () => {
    const out = parseReasonConfig([{ label: "Quickie" }], "orgasm");
    expect(out).toHaveLength(1);
    expect(out[0].code).toMatch(/^c_[0-9a-f]{8,}$/);
    expect(out[0].label).toBe("Quickie");
  });
  it("preserves an existing custom code", () => {
    expect(parseReasonConfig([{ code: "c_0011223344", label: "Quickie" }], "orgasm")[0].code).toBe("c_0011223344");
  });
  it("ignores a client-supplied non-reserved, non-custom code (generates instead)", () => {
    expect(parseReasonConfig([{ code: "hacktastic", label: "x" }], "orgasm")[0].code).toMatch(/^c_[0-9a-f]{8,}$/);
  });
});

describe("generateReasonCode", () => {
  it("never collides with a reserved code and is unique vs existing", () => {
    const existing = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const c = generateReasonCode(existing, "opening");
      expect(OEFFNEN_GRUENDE as readonly string[]).not.toContain(c);
      expect(existing.has(c)).toBe(false);
      existing.add(c);
    }
  });
});

describe("resolveReasonLabel — fallback chain", () => {
  const cfg: ReasonEntry[] = [{ code: "REINIGUNG", label: "Putzen" }, { code: "KEYHOLDER" }, { code: "c_abcd1234ef" }];
  it("custom label wins", () => {
    expect(resolveReasonLabel("REINIGUNG", cfg, "opening", t)).toBe("Putzen");
  });
  it("built-in i18n when no label override", () => {
    expect(resolveReasonLabel("KEYHOLDER", cfg, "opening", t)).toBe("T:grundKeyholder");
  });
  it("raw code for a custom entry without label", () => {
    expect(resolveReasonLabel("c_abcd1234ef", cfg, "opening", t)).toBe("c_abcd1234ef");
  });
  it("unknown/removed code → raw code, never throws", () => {
    expect(resolveReasonLabel("c_gone", cfg, "opening", t)).toBe("c_gone");
  });
});

describe("resolveReasonList + valid*Codes", () => {
  it("resolveReasonList maps every entry to a display label", () => {
    expect(resolveReasonList(parseReasonConfig(null, "orgasm"), "orgasm", t)).toEqual([
      { code: "Orgasmus", label: "T:artOrgasmus" },
      { code: "ruinierter Orgasmus", label: "T:artRuiniert" },
      { code: "feuchter Traum", label: "T:artTraum" },
    ]);
  });
  it("valid*Codes returns built-ins for null config", () => {
    expect(validOrgasmusCodes(null)).toEqual(new Set(ORGASMUS_ARTEN));
    expect(validOeffnenCodes(null)).toEqual(new Set(OEFFNEN_GRUENDE));
  });
  it("valid opening codes always include REINIGUNG", () => {
    expect(validOeffnenCodes([{ code: "KEYHOLDER" }]).has("REINIGUNG")).toBe(true);
  });
});
