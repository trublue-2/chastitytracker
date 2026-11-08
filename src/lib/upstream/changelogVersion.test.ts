import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// Der Kopf von `changelog.json` MUSS die Version aus `package.json` nennen.
//
// Geprüft hat das bisher nur `promote.yml`, also beim Release — Tage nach dem Commit, der die
// Regel bricht, und nur wenn überhaupt jemand promotet. Genau so entstand v4.60.2: der Bump kam
// ohne Eintrag, weil die Änderung „nur" ein Workflow war; aufgefallen ist es erst, als das Image
// bereits auf :latest stand.
//
// Hier fällt es beim Schreiben auf — und seit v4.58.7 hält ein roter `npm test` zusätzlich das
// Deploy an. NICHT den Image-Push: `build-and-push` hängt in `docker.yml` bewusst nicht an
// `typecheck`, nur `deploy` tut das. Ein Image mit gebrochener Zusicherung kann also in GHCR
// landen, und der Guard in `promote.yml` bleibt die letzte Instanz vor dem Release — er prüft
// den Commit des IMAGES statt des Arbeitsstands und deckt damit auch alte oder von Hand als
// `source` gesetzte Quellen ab.
describe("Changelog-Kopf und package.json-Version", () => {
  it("nennen dieselbe Version", () => {
    const version = JSON.parse(readFileSync("package.json", "utf8")).version;
    const head = JSON.parse(readFileSync("src/data/changelog.json", "utf8"))[0];

    expect(
      head.version,
      `package.json steht auf ${version}, der Changelog-Kopf auf ${head.version} — ` +
        "Bump und Eintrag gehören in denselben Commit (CLAUDE.md). Ohne Eintrag kündigt der " +
        "Update-Hinweis der Flotte die falsche Version an, und promote.yml verweigert den Release.",
    ).toBe(version);
  });
});
