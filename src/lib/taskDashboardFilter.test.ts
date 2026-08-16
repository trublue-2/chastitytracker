import { describe, it, expect } from "vitest";
import { belongsOnDashboard, type EvaluatedTask } from "./taskIntervals";
import type { TaskEvaluation, TaskState } from "./tasks";

/**
 * Was steht auf dem Dashboard und was nur noch in der Aufgaben-Liste?
 *
 * Die Regel ist der Grund, aus dem es die Liste überhaupt gibt: erst weil dort ALLES nachlesbar ist,
 * darf eine erfüllte Aufgabe sofort von der Startseite verschwinden (Rückmeldung 02.08.2026).
 */

const HOLD_UNTIL = new Date("2026-08-02T12:00:00Z");
const JUST_AFTER = new Date("2026-08-02T12:30:00Z");
const NEXT_DAY = new Date("2026-08-03T18:00:00Z");

function evaluated(state: TaskState): EvaluatedTask {
  const evaluation: TaskEvaluation = {
    state,
    holdUntil: HOLD_UNTIL,
    startedAt: null,
    missing: [],
    failedRequirement: null,
    failedAt: null,
    awaitingConfirmation: false,
    holdRunning: false,
    proofCheckPending: false,
    proofSubmitOpen: true,
    overdueProofIds: [],
  };
  return {
    task: {
      id: "t1",
      title: "Wohnung staubsaugen",
      description: null,
      holdUntil: HOLD_UNTIL,
      startGraceMin: 30,
      wirksamAb: null,
      benachrichtigtAt: null,
      holdDurationMin: null,
      proofOrderMatters: true,
      isPunishment: false,
      penaltyReason: null,
      createdAt: new Date("2026-08-02T10:00:00Z"),
      completedAt: null,
      completionNote: null,
      withdrawnAt: null,
      requirements: [],
      proofs: [],
    },
    evaluation,
    requirements: [],
  };
}

describe("belongsOnDashboard", () => {
  it("Offene bleiben, egal wie alt die Frist ist", () => {
    for (const state of ["pending", "partial", "running"] as const) {
      expect(belongsOnDashboard(evaluated(state), NEXT_DAY)).toBe(true);
    }
  });

  it("Erfüllte verschwinden sofort — sie verlangen nichts mehr", () => {
    expect(belongsOnDashboard(evaluated("done"), JUST_AFTER)).toBe(false);
  });

  it("Zurückgezogene verschwinden sofort — es ist der Entschluss der Keyholderin", () => {
    expect(belongsOnDashboard(evaluated("withdrawn"), JUST_AFTER)).toBe(false);
  });

  it("Versäumnisse bleiben 24 h stehen und altern dann weg", () => {
    expect(belongsOnDashboard(evaluated("missed"), JUST_AFTER)).toBe(true);
    expect(belongsOnDashboard(evaluated("aborted"), JUST_AFTER)).toBe(true);
    expect(belongsOnDashboard(evaluated("missed"), NEXT_DAY)).toBe(false);
  });

  it("Ausstehende Sichtung altert NICHT weg — sie wartet auf eine Handlung ohne Frist", () => {
    expect(belongsOnDashboard(evaluated("awaitingReview"), NEXT_DAY)).toBe(true);
  });
});
