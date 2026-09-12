import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Die Rückfrage beim Hochstufen (`admin.rolePromoteConfirm`) behauptet zwei Dinge über Code, der
 * woanders steht — und der Nutzer entscheidet im Vertrauen darauf:
 *
 *  1. Ein Admin ist Empfänger für JEDEN Träger (`getControllersOfUser` in `keyholder.ts`).
 *  2. Über einen Träger MIT Admin-Rolle wird keine Keyholder-Posteingangs-Zeile mehr geschrieben
 *     (`keyholderRowReadable` in `notify.ts`).
 *
 * Ändert jemand eine der beiden Stellen, fällt nichts um: `notify.test.ts` prüft das VERHALTEN und
 * wird mit der Änderung angepasst, der Dialogtext bleibt stehen und warnt weiter vor einer Folge,
 * die es nicht mehr gibt. Genau diese Fehlerart beschreibt die CLAUDE.md unter „Vorfall
 * 01.09.2026": vier Stellen behaupteten, ein MCP-Werkzeug gebe es nicht, das längst existierte —
 * gemeldet hat sich die einzige, die einen Wächter hatte.
 *
 * Und es ist keine Vorsichtsmassnahme ins Blaue: der offene Punkt, `keyholderRowReadable` von
 * „ist der Betreff Admin?" auf „hat diese Zeile überhaupt einen Leser?" umzustellen, ist notiert
 * (ein Träger mit Admin-Rolle UND zugewiesenem Keyholder hat einen Leser, und die Zeile entfällt
 * trotzdem). Wer das angeht, muss diesen Text mitnehmen — dieser Test sagt es ihm.
 *
 * Bauart nach `appName.test.ts`: die Prädikate werden als TEXT gelesen, nicht importiert. Beide
 * Module ziehen sonst den Prisma-Client nach sich, und ein Wächter über zwei Zeilen Quelltext
 * soll dafür keine Datenbank-Attrappe brauchen.
 */
const HINWEIS =
  "Wenn du das absichtlich änderst, gehört `admin.rolePromoteConfirm` in messages/de.json UND " +
  "messages/en.json mit — samt dem Eintrag zu `User.role` in funktionsmodellRegistry.ts " +
  "(danach `npm run funktionsmodell`).";

const src = (f: string) => readFileSync(f, "utf8");

describe("Die Rückfrage beim Hochstufen bleibt an ihren Mechanismen", () => {
  it("jeder Admin ist Empfänger für jeden Träger", () => {
    expect(
      src("src/lib/keyholder.ts"),
      `getControllersOfUser nimmt nicht mehr alle Admins auf. ${HINWEIS}`,
    ).toContain('where: { role: "admin" }');
  });

  it("über einen Träger mit Admin-Rolle entfällt die Posteingangs-Zeile", () => {
    expect(
      src("src/lib/notify.ts"),
      `keyholderRowReadable entscheidet nicht mehr an der Admin-Rolle des Betreffs. ${HINWEIS}`,
    ).toContain('subject?.role !== "admin"');
  });

  it("und der Text, der beides behauptet, steht in beiden Sprachen", () => {
    for (const f of ["messages/de.json", "messages/en.json"]) {
      const text = JSON.parse(src(f)).admin?.rolePromoteConfirm;
      expect(typeof text, `${f}: admin.rolePromoteConfirm fehlt`).toBe("string");
      expect(text.length, `${f}: admin.rolePromoteConfirm ist leer`).toBeGreaterThan(40);
    }
  });
});
