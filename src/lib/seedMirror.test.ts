import { describe, it, expect, vi, afterEach } from "vitest";
import { createRequire } from "node:module";
import { DEFAULT_ORGASM_ARTEN, backfillOrgasmusArtenConfig, ART_SEP } from "./reasonsService";
import { AI_AUTHOR } from "./constants";

// scripts/seed.js ist Plain-CJS (kann nicht aus src importieren) und spiegelt Teile von
// reasonsService.ts. Dieser Test sichert den Mirror gegen stille Drift ab: er lädt die echten
// seed.js-Exports und vergleicht sie mit dem TS-Original.
const require = createRequire(import.meta.url);
const seed = require("../../scripts/seed.js") as {
  ART_SEP: string;
  ORGASM_MAIN_WITH_SUBS: Record<string, string[]>;
  backfillOrgasmusArtenConfig: (raw: unknown) => string | null;
  safeAdminUsername: (raw: string | undefined) => string;
  AI_AUTHOR: string;
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

/**
 * `ADMIN_USERNAME` war der einzige Weg, einen Benutzer namens `ai` anzulegen — die Benutzer-API
 * verlangt mindestens drei Zeichen. Ein Admin mit dieser Kennung stünde dem Träger in jeder Meldung
 * als KI im Posteingang und im Strafbuch mit KI-Hinweis am Urteil.
 */
describe("seed.js schützt die KI-Kennung als Admin-Namen", () => {
  afterEach(() => vi.restoreAllMocks());

  it("AI_AUTHOR matches", () => {
    expect(seed.AI_AUTHOR).toBe(AI_AUTHOR);
  });

  it.each([AI_AUTHOR, AI_AUTHOR.toUpperCase(), "Ai"])("'%s' weicht auf den Standardnamen aus — laut", (raw) => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(seed.safeAdminUsername(raw)).toBe("admin");
    // Nicht still: der Betreiber sässe sonst mit dem falschen Benutzernamen vor dem Login-Formular.
    expect(warn).toHaveBeenCalled();
  });

  it("lässt jeden anderen Namen unverändert und behält den Standard bei leerem Wert", () => {
    expect(seed.safeAdminUsername("herrin")).toBe("herrin");
    // Knapp daneben ist kein Treffer — die Sperre gilt dem Wert selbst, nicht seinen Nachbarn.
    expect(seed.safeAdminUsername("aiden")).toBe("aiden");
    expect(seed.safeAdminUsername(undefined)).toBe("admin");
    expect(seed.safeAdminUsername("")).toBe("admin");
  });
});
