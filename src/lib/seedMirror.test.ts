import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { DEFAULT_ORGASM_ARTEN, backfillOrgasmusArtenConfig, ART_SEP } from "./reasonsService";

// scripts/seed.js ist Plain-CJS (kann nicht aus src importieren) und spiegelt Teile von
// reasonsService.ts. Dieser Test sichert den Mirror gegen stille Drift ab: er lädt die echten
// seed.js-Exports und vergleicht sie mit dem TS-Original.
const require = createRequire(import.meta.url);
const seed = require("../../scripts/seed.js") as {
  ART_SEP: string;
  ORGASM_MAIN_WITH_SUBS: Record<string, string[]>;
  backfillOrgasmusArtenConfig: (raw: unknown) => string | null;
};

describe("seed.js mirror stays in sync with reasonsService", () => {
  it("ART_SEP matches", () => {
    expect(seed.ART_SEP).toBe(ART_SEP);
  });

  it("ORGASM_MAIN_WITH_SUBS equals the map derived from DEFAULT_ORGASM_ARTEN", () => {
    const derived: Record<string, string[]> = {};
    for (const code of DEFAULT_ORGASM_ARTEN) {
      const i = code.indexOf(ART_SEP);
      if (i === -1) continue;
      (derived[code.slice(0, i)] ??= []).push(code);
    }
    expect(seed.ORGASM_MAIN_WITH_SUBS).toEqual(derived);
  });

  it("backfill output is identical to the TS original", () => {
    const cases: unknown[] = [
      null,
      JSON.stringify([{ code: "Orgasmus" }, { code: "ruinierter Orgasmus" }, { code: "feuchter Traum" }]),
      JSON.stringify([{ code: "Orgasmus", label: "Höhepunkt" }]),
      JSON.stringify(DEFAULT_ORGASM_ARTEN.map((code) => ({ code }))),
      JSON.stringify([{ code: "Orgasmus – Masturbation" }, { code: "Orgasmus" }]),
      "garbage",
    ];
    for (const c of cases) {
      expect(seed.backfillOrgasmusArtenConfig(c)).toBe(backfillOrgasmusArtenConfig(c));
    }
  });
});
