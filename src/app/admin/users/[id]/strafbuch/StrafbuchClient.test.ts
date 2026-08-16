import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { taskClaimLabels } from "./StrafbuchClient";

/**
 * Der Vorwurf, den das Strafbuch einer nicht erfüllten Aufgabe macht — Kopfzeile UND Tatzeit.
 *
 * Seit auch ein `missed` eine Tatzeit trägt (die verstrichene Frist eines Nachweises), sind die
 * Fälle nicht mehr an der Anwesenheit von `failedAt` zu unterscheiden. Als „Abgelegt am"
 * beschriftet wirft die Zeile dem Träger eine Handlung vor, die es nie gab.
 */
describe("taskClaimLabels", () => {
  /** Alle Kombinationen, die `buildStrafbuch` liefern kann — die Vorlage für die Fälle unten. */
  const ROWS = [
    { state: "aborted", started: true, hasRequirements: true },
    { state: "missed", started: true, hasRequirements: true },
    { state: "missed", started: false, hasRequirements: true },
    { state: "missed", started: false, hasRequirements: false },
  ] as const;

  it("vorzeitig abgelegt: Vorwurf und Tatzeit sprechen vom Ablegen", () => {
    expect(taskClaimLabels(ROWS[0])).toEqual({
      claim: "strafbuchAufgabeAbgebrochen",
      failedAt: "strafbuchAufgabeAbgelegtAm",
    });
  });

  /** Der Fall, der der Keyholderin bisher falsch angezeigt wurde: durchgehalten, nur den Nachweis
   *  nicht erbracht — „nicht begonnen" ist dafür nachweislich der falsche Vorwurf. */
  it("durchgehalten, aber ohne Nachweis: der Vorwurf ist der fehlende Nachweis", () => {
    expect(taskClaimLabels(ROWS[1])).toEqual({
      claim: "strafbuchAufgabeNachweisFehlt",
      failedAt: "strafbuchAufgabeNachweisFristAm",
    });
  });

  it("Bedingungen lagen nie an: der Vorwurf ist der fehlende Beginn", () => {
    expect(taskClaimLabels(ROWS[2])).toEqual({
      claim: "strafbuchAufgabeVersaeumt",
      failedAt: "strafbuchAufgabeNachweisFristAm",
    });
  });

  /** Eine Aufgabe OHNE Bedingungen bekommt nie ein `startedAt` — ihr „nicht begonnen" vorzuwerfen
   *  wäre derselbe Fehler noch einmal, nur an einer Aufgabe, bei der es nichts zu beginnen gab. */
  it("Aufgabe ohne Bedingungen: NICHT der Vorwurf des fehlenden Beginns", () => {
    expect(taskClaimLabels(ROWS[3]).claim).toBe("strafbuchAufgabeNichtErfuellt");
  });

  it("jeder gelieferte Schlüssel ist in beiden Sprachen übersetzt", () => {
    const namespaces = ["de", "en"].map(
      (loc) => JSON.parse(readFileSync(`messages/${loc}.json`, "utf8")).admin as Record<string, string>,
    );
    for (const row of ROWS) {
      for (const key of Object.values(taskClaimLabels(row))) {
        for (const ns of namespaces) expect(ns[key], key).toBeTruthy();
      }
    }
  });
});
