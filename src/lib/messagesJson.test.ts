import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

/**
 * Doppelte Schlüssel in den Message-Dateien fallen sonst niemandem auf: `JSON.parse` behält still den
 * letzten, und jede Schlüssel-Prüfung (`notificationEventLabels.test.ts`, `notice.test.ts`) arbeitet
 * auf dem bereits geparsten Objekt. Entstanden ist einer beim Merge, als beide Seiten denselben
 * Schlüssel anlegten (11.09.2026) — mit verschiedenem Text, von dem einer lautlos verschwand.
 *
 * Der Rundlauf parse → stringify ergibt die Datei nur dann wieder, wenn jeder Schlüssel genau einmal
 * vorkommt. Nebenwirkung: er hält auch das Format (2 Leerzeichen, Zeilenende am Schluss) fest.
 */
describe("messages/*.json", () => {
  for (const lang of ["de", "en"]) {
    it(`${lang}.json enthält jeden Schlüssel nur einmal`, () => {
      const raw = readFileSync(join(process.cwd(), "messages", `${lang}.json`), "utf8");
      const roundTrip = JSON.stringify(JSON.parse(raw), null, 2) + "\n";
      expect(roundTrip === raw, `messages/${lang}.json: doppelter Schlüssel oder abweichendes Format`).toBe(true);
    });
  }
});
