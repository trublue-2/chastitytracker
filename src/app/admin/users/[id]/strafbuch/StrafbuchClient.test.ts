import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { taskClaimLabels, priorPunishments, type StrafeRecordData } from "./StrafbuchClient";

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

/**
 * Die Vorgeschichte über dem Urteils-Feld (#86): wie oft diese Art schon bestraft wurde und was
 * zuletzt verhängt wurde. Eine Gedächtnisstütze — sie darf nicht strenger klingen, als der Bestand
 * hergibt.
 */
describe("priorPunishments", () => {
  const rec = (over: Partial<StrafeRecordData>): StrafeRecordData => ({
    refId: "r", offenseType: "OEFFNEN_ENTRY", status: "PUNISHED", reason: "20 Schläge",
    judgedBy: null, judgedByName: null, judgedAtStr: "01.09.2026", done: false, erledigtAtStr: null,
    ...over,
  });

  it("zählt nur die VERHÄNGTEN dieser Art", () => {
    const records = [
      rec({ refId: "a" }),
      rec({ refId: "b", status: "DISMISSED" }),           // verworfen ist keine Vorgeschichte
      rec({ refId: "c", offenseType: "KONTROLLANFORDERUNG" }), // andere Art
      rec({ refId: "d" }),
    ];
    expect(priorPunishments(records, "OEFFNEN_ENTRY").count).toBe(2);
  });

  it("nimmt als `last` den ersten Treffer — die Liste steht neueste zuerst", () => {
    const records = [
      rec({ refId: "neu", reason: "zwei Tage länger", judgedAtStr: "08.09.2026" }),
      rec({ refId: "alt", reason: "20 Schläge", judgedAtStr: "01.09.2026" }),
    ];
    expect(priorPunishments(records, "OEFFNEN_ENTRY").last?.reason).toBe("zwei Tage länger");
  });

  it("ohne Vorgeschichte: null statt einer leeren Zeile", () => {
    expect(priorPunishments([rec({ status: "DISMISSED" })], "OEFFNEN_ENTRY")).toEqual({ count: 0, last: null });
  });
});
