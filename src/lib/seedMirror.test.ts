import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { NOTIFICATION_EVENT_TYPES } from "./constants";

/**
 * `scripts/seed.js` führt eine KOPIE von `NOTIFICATION_EVENT_TYPES` — es ist reines CJS und kann
 * nicht aus `src/` importieren. Der Kommentar dort sagt „keep both lists in sync"; bis hierher hat
 * das niemand geprüft.
 *
 * Was eine Abweichung anrichtet: `seed.js` legt die Benachrichtigungs-Zeilen jedes Kontos an, beim
 * Anlegen UND bei jedem Containerstart. Ein Typ, der dort fehlt, bekommt nie eine Zeile — und eine
 * fehlende Zeile heisst „an" (`notificationPrefs.ts`). Der Schalter steht dann im Raster der
 * Keyholderin, lässt sich umlegen, und beim nächsten Start ist er wieder da. Nichts stürzt ab,
 * nichts meldet sich; es gilt nur dauerhaft etwas anderes, als die Oberfläche zeigt.
 *
 * Vorbild: `appName.test.ts` hält die drei nicht-importierbaren Träger des App-Namens gegen die
 * Konstante.
 */
describe("scripts/seed.js spiegelt NOTIFICATION_EVENT_TYPES", () => {
  it("führt dieselben Ereignistypen wie constants.ts", () => {
    const seed = readFileSync("scripts/seed.js", "utf8");
    const block = seed.match(/const NOTIFICATION_EVENT_TYPES = \[([\s\S]*?)\];/);
    expect(block, "Die Liste in seed.js ist nicht mehr auffindbar — Name oder Form geändert?").toBeTruthy();
    const inSeed = [...block![1].matchAll(/"([A-Z_]+)"/g)].map((m) => m[1]);

    expect(
      inSeed,
      "seed.js und constants.ts führen verschiedene Ereignistypen. Ein Typ, der dort fehlt, bekommt " +
        "nie eine Preference-Zeile — und eine fehlende Zeile heisst \"an\".",
    ).toEqual([...NOTIFICATION_EVENT_TYPES]);
  });
});
