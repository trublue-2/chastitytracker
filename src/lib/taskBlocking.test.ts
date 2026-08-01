import { describe, it, expect } from "vitest";
import { isHeldByTask, requirementMatchesTarget, type EvaluatedTask } from "./taskIntervals";
import type { TaskEvaluation } from "./tasks";

/**
 * Die Frage „hält eine laufende Aufgabe dieses Gerät gerade fest?" — Grundlage der Warnung vor dem
 * Ablegen UND der Markierung der laufenden Trage-Karte. Beide Sichten teilen sich das Prädikat, weil
 * eine Karte mit Warnzeichen, deren Formular schweigt (oder umgekehrt), schlimmer ist als keine.
 */

const HOLD_UNTIL = new Date("2026-07-25T15:00:00Z");

const EVAL: TaskEvaluation = {
  state: "running",
  startedAt: new Date("2026-07-25T12:00:00Z"),
  missing: [],
  failedRequirement: null,
  failedAt: null,
  awaitingConfirmation: false,
};

function evaluated(
  requirements: EvaluatedTask["requirements"],
  evaluation: Partial<TaskEvaluation> = {},
): EvaluatedTask {
  return {
    task: {
      id: "t1",
      title: "Knebel tragen",
      description: null,
      holdUntil: HOLD_UNTIL,
      startGraceMin: 30,
      isPunishment: false,
      penaltyReason: null,
      createdAt: new Date("2026-07-25T11:00:00Z"),
      completedAt: null,
      completionNote: null,
      withdrawnAt: null,
      requirements: [],
      proofs: [],
    },
    evaluation: { ...EVAL, ...evaluation },
    requirements,
  };
}

const wearReq = (over: Partial<EvaluatedTask["requirements"][number]> = {}) => ({
  id: "r1",
  label: "Knebel",
  type: "WEAR",
  categoryId: "cat1",
  deviceId: null,
  satisfied: true,
  ...over,
});

describe("requirementMatchesTarget — Gerät schlägt Kategorie", () => {
  it("Kategorie-Bedingung trifft jedes Gerät der Kategorie", () => {
    expect(requirementMatchesTarget(wearReq(), { categoryId: "cat1", deviceId: "dX" })).toBe(true);
  });

  it("Geräte-Bedingung trifft NUR dieses Gerät — nicht die ganze Kategorie", () => {
    const r = wearReq({ deviceId: "dA" });
    expect(requirementMatchesTarget(r, { categoryId: "cat1", deviceId: "dA" })).toBe(true);
    // Sonst hinge eine Aufgabe „trage Plug A" auch an Plug B.
    expect(requirementMatchesTarget(r, { categoryId: "cat1", deviceId: "dB" })).toBe(false);
  });

  it("KG-Bedingung und Trage-Bedingung verwechseln sich nicht", () => {
    expect(requirementMatchesTarget(wearReq(), { kg: true })).toBe(false);
    expect(requirementMatchesTarget({ ...wearReq(), type: "KG_LOCKED" }, { kg: true })).toBe(true);
  });
});

describe("isHeldByTask", () => {
  const target = { categoryId: "cat1", deviceId: "dA" };
  const beforeDeadline = new Date("2026-07-25T14:00:00Z");

  it("laufende Aufgabe mit erfüllter Bedingung hält fest", () => {
    expect(isHeldByTask([evaluated([wearReq()])], target, beforeDeadline)).toBe(true);
  });

  it("unerfüllte Bedingung hält nichts fest — sie kann nicht kaputtgehen", () => {
    expect(isHeldByTask([evaluated([wearReq({ satisfied: false })])], target, beforeDeadline)).toBe(false);
  });

  it("abgeschlossene oder zurückgezogene Aufgabe stellt keine Forderung mehr", () => {
    for (const state of ["done", "missed", "aborted", "withdrawn"] as const) {
      expect(isHeldByTask([evaluated([wearReq()], { state })], target, beforeDeadline)).toBe(false);
    }
  });

  /**
   * REGRESSION: Eine Aufgabe, die bis `holdUntil` durchgehalten hat und nur noch auf die
   * Selbstmeldung wartet, bleibt `running` — die Meldung ist bewusst unbefristet. Ihre Bedingung
   * gilt weiter, solange der Sub das Gerät trägt.
   *
   * Ohne die Frist-Prüfung warnte das Ablege-Formular in genau diesem Fenster, mit einer bereits
   * VERGANGENEN Frist im Text („verlangt dieses Gerät noch bis 15:00", gezeigt um 15:05) und der
   * falschen Behauptung, das Ablegen gelte als nicht erfüllt.
   *
   * Falsch ist sie, weil `evaluateTask` die Deckung nur bis `min(now, holdUntil)` prüft: ist die
   * Frist verstrichen, liegt die geprüfte Spanne fest und kein späteres Ablegen ändert sie noch.
   */
  it("REGRESSION: nach Fristablauf keine Warnung mehr — die Aufgabe kann nicht mehr kaputtgehen", () => {
    const awaiting = evaluated([wearReq()], { awaitingConfirmation: true });
    const afterDeadline = new Date("2026-07-25T15:05:00Z");

    // Vor der Frist: warnen ist richtig, Ablegen macht daraus ein Vergehen.
    expect(isHeldByTask([awaiting], target, beforeDeadline)).toBe(true);
    // Nach der Frist: die Aufgabe ist offen (wartet auf die Meldung), aber nicht mehr gefährdet.
    expect(isHeldByTask([awaiting], target, afterDeadline)).toBe(false);
  });

  it("genau auf der Frist wird nicht mehr gewarnt — die Deckung bis dahin ist erbracht", () => {
    expect(isHeldByTask([evaluated([wearReq()])], target, HOLD_UNTIL)).toBe(false);
  });
});
