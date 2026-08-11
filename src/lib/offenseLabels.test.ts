import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { STORED_TYPE } from "@/lib/offenseTypes";
import { OFFENSE_TYPE_I18N_KEYS, OFFENSE_TYPE_ORDER, offenseNameKey } from "@/lib/offenseLabels";
import { OFFENSE_MODE_I18N_KEYS } from "@/lib/offenseLabels";

/**
 * Die Zusage von `OFFENSE_TYPE_I18N_KEYS` endet an der TypeScript-Grenze: der Compiler erzwingt,
 * dass jede Art einen SCHLÜSSEL hat — nicht, dass dahinter in beiden Sprachen ein TEXT steht. Ohne
 * diesen Test zeigt eine neue Art dem Träger auf `/dashboard/strafen` und dem Keyholder im
 * Einstellungs-Abschnitt den rohen Schlüsselpfad, mit einer Konsolenwarnung als einzigem Signal.
 *
 * Vorbild: `serviceErrorCodes.test.ts` und `entryErrors.test.ts` tun dasselbe für ihre Namensräume.
 */
const LOCALES = ["de", "en"] as const;
const messages = Object.fromEntries(
  LOCALES.map((loc) => [loc, JSON.parse(readFileSync(`messages/${loc}.json`, "utf8"))]),
);

describe("Vergehens-Bezeichnungen sind in beiden Sprachen vollständig", () => {
  it("jede Art hat name UND desc in de und en", () => {
    for (const type of Object.keys(STORED_TYPE) as (keyof typeof STORED_TYPE)[]) {
      const key = OFFENSE_TYPE_I18N_KEYS[type];
      for (const loc of LOCALES) {
        const entry = messages[loc].offenses?.[key];
        expect(entry?.name, `${loc}: offenses.${key}.name`).toBeTruthy();
        expect(entry?.desc, `${loc}: offenses.${key}.desc`).toBeTruthy();
      }
    }
  });

  it("jeder Regel-Modus hat eine Beschriftung in beiden Sprachen", () => {
    for (const key of Object.values(OFFENSE_MODE_I18N_KEYS)) {
      for (const loc of LOCALES) {
        expect(messages[loc].admin?.[key], `${loc}: admin.${key}`).toBeTruthy();
      }
    }
  });

  it("der Namensraum trägt keine Leichen — jeder Eintrag gehört zu einer Art", () => {
    const erlaubt = new Set(Object.values(OFFENSE_TYPE_I18N_KEYS));
    for (const loc of LOCALES) {
      for (const key of Object.keys(messages[loc].offenses ?? {})) {
        expect(erlaubt.has(key), `${loc}: offenses.${key} gehört zu keiner Vergehensart`).toBe(true);
      }
    }
  });

  it("OFFENSE_TYPE_ORDER listet jede Art genau einmal", () => {
    expect([...OFFENSE_TYPE_ORDER].sort()).toEqual(Object.keys(STORED_TYPE).sort());
  });

  it("offenseNameKey hängt .name an den Schlüssel der Art", () => {
    expect(offenseNameKey("manual_offense")).toBe("manualOffense.name");
  });
});
