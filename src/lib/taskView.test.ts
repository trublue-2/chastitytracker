import { describe, it, expect } from "vitest";
import { toTaskCard } from "./taskView";
import { safeInternalPath } from "./utils";
import type { EvaluatedTask } from "./taskIntervals";
import type { TaskEvaluation } from "./tasks";

const EVAL: TaskEvaluation = {
  state: "partial",
  startedAt: null,
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
      title: "Staubsaugen",
      description: null,
      holdUntil: new Date("2026-07-25T15:00:00Z"),
      startGraceMin: 30,
      isPunishment: false,
      penaltyReason: null,
      createdAt: new Date("2026-07-25T12:00:00Z"),
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

const kg = (satisfied = false) =>
  ({ id: "r0", label: "KG verschlossen", type: "KG_LOCKED", categoryId: null, deviceId: null, satisfied });
const wear = (id: string, label: string, categoryId: string, satisfied = false, deviceId: string | null = null) =>
  ({ id, label, type: "WEAR", categoryId, deviceId, satisfied });

describe("toTaskCard — Deep-Links", () => {
  it("verlinkt beim Keyholder nichts (es sind nicht seine Formulare)", () => {
    const card = toTaskCard(evaluated([kg(), wear("r1", "Knebel", "c1")]), false);
    expect(card.requirements.map((r) => r.href)).toEqual([null, null]);
  });

  it("führt die KG-Bedingung in die Verschluss-Maske, eine Trage-Bedingung in ihre Kategorie", () => {
    const card = toTaskCard(evaluated([wear("r1", "Knebel", "c1")]), true);
    expect(card.requirements[0].href).toBe("/dashboard/new/wear-begin?category=c1");
  });

  it("nimmt ein konkret gefordertes Gerät in den Link mit", () => {
    const card = toTaskCard(evaluated([wear("r1", "Leder", "c1", false, "d9")]), true);
    expect(card.requirements[0].href).toContain("device=d9");
  });

  it("verkettet offene Bedingungen: aus drei Navigationen wird eine", () => {
    const card = toTaskCard(evaluated([kg(), wear("r1", "Halsband", "c1"), wear("r2", "Knebel", "c2")]), true);

    // Der letzte Schritt endet ohne Kette (danach: Dashboard).
    expect(card.requirements[2].href).toBe("/dashboard/new/wear-begin?category=c2");
    // Der mittlere zeigt auf den letzten …
    expect(card.requirements[1].href).toBe(
      `/dashboard/new/wear-begin?category=c1&redirectTo=${encodeURIComponent("/dashboard/new/wear-begin?category=c2")}`,
    );
    // … und der erste auf den bereits verketteten mittleren.
    expect(card.requirements[0].href).toContain("/dashboard/new/verschluss?redirectTo=");
    expect(decodeURIComponent(card.requirements[0].href!)).toContain("category=c1");
  });

  it("überspringt erfüllte Bedingungen in der Kette — sonst führt sie in ein Formular für ein bereits getragenes Gerät", () => {
    const card = toTaskCard(evaluated([kg(), wear("r1", "Halsband", "c1", true), wear("r2", "Knebel", "c2")]), true);

    expect(card.requirements[1].href).toBe("/dashboard/new/wear-begin?category=c1"); // erfüllt → kein Kettenglied
    expect(decodeURIComponent(card.requirements[0].href!)).toContain("category=c2");
    expect(decodeURIComponent(card.requirements[0].href!)).not.toContain("category=c1");
  });

  it("lässt eine Bedingung ohne Kategorie (gelöscht) linklos statt ins Leere zu zeigen", () => {
    const card = toTaskCard(evaluated([{ ...wear("r1", "Weg", "c1"), categoryId: null }]), true);
    expect(card.requirements[0].href).toBeNull();
  });
});

describe("safeInternalPath — die Kette darf kein offenes Weiterleitungsloch sein", () => {
  it("lässt interne Pfade durch", () => {
    expect(safeInternalPath("/dashboard/new/verschluss?x=1")).toBe("/dashboard/new/verschluss?x=1");
  });

  it("weist protokoll-relative, absolute und Backslash-Ziele ab", () => {
    expect(safeInternalPath("//example.com")).toBeNull();
    expect(safeInternalPath("https://example.com")).toBeNull();
    expect(safeInternalPath("/\\example.com")).toBeNull();
    expect(safeInternalPath("")).toBeNull();
    expect(safeInternalPath(undefined)).toBeNull();
  });
});
