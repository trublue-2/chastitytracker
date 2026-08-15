import { describe, it, expect } from "vitest";
import { nextTaskStep, taskDeadlineLine, toTaskCard, visibleStartDeadline } from "./taskView";
import { safeInternalPath } from "./utils";
import type { EvaluatedTask, TaskProofView } from "./taskIntervals";
import type { TaskEvaluation } from "./tasks";

const EVAL: TaskEvaluation = {
  state: "partial",
  holdUntil: new Date("2026-07-25T15:00:00Z"),
  startedAt: null,
  missing: [],
  failedRequirement: null,
  failedAt: null,
  awaitingConfirmation: false,
  holdRunning: false,
  proofCheckPending: false,
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
      holdDurationMin: null,
      proofOrderMatters: true,
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

describe("taskDeadlineLine — „Halten bis“ nur, wo es etwas zu halten gibt", () => {
  const keyOf = (card: Parameters<typeof taskDeadlineLine>[0]) =>
    taskDeadlineLine(card, { date: (iso) => iso, duration: (ms) => String(ms) }).key;

  it("nennt die Haltefrist, sobald die Aufgabe Bedingungen trägt", () => {
    expect(keyOf(toTaskCard(evaluated([wear("r1", "Knebel", "c1")]), false))).toBe("holdUntilShort");
  });

  it("nennt bei einer reinen Textaufgabe einen Termin", () => {
    expect(keyOf(toTaskCard(evaluated([]), false))).toBe("deadlineShort");
  });

  it("bleibt bei der Haltefrist, wenn die Aufgabe längst vorbei ist — die Überschrift steht in JEDEM Zustand", () => {
    // Der Grund, aus dem hier NICHT `holdRunning` gefragt wird: das ist nach Ablauf false, die Karte
    // trüge dann über einer erfüllten Trage-Aufgabe rückwirkend „Erledigen bis".
    const card = toTaskCard(evaluated([wear("r1", "Knebel", "c1", true)], { state: "done", holdRunning: false }), false);
    expect(keyOf(card)).toBe("holdUntilShort");
  });
});

describe("startDeadline auf der Karte — die Frist, die ein Vergehen auslöst, muss sichtbar sein", () => {
  it("rechnet die Kulanzfrist auf die Erstellung", () => {
    // createdAt 12:00 + 30 min Kulanz.
    const card = toTaskCard(evaluated([wear("r1", "Knebel", "c1")]), false);
    expect(card.startDeadline).toBe("2026-07-25T12:30:00.000Z");
  });

  it("lässt sie bei einer reinen Textaufgabe weg — es gibt nichts anzulegen", () => {
    expect(toTaskCard(evaluated([]), false).startDeadline).toBeNull();
  });

  it("zeigt sie, solange nie begonnen wurde", () => {
    for (const state of ["pending", "partial"] as const) {
      const card = toTaskCard(evaluated([wear("r1", "Knebel", "c1")], { state }), true);
      expect(visibleStartDeadline(card)).toBe("2026-07-25T12:30:00.000Z");
    }
  });

  it("zeigt sie bei „versäumt“ weiter — dort ist sie der Beleg des Urteils, nicht mehr eine Warnung", () => {
    const card = toTaskCard(evaluated([wear("r1", "Knebel", "c1")], { state: "missed" }), true);
    expect(visibleStartDeadline(card)).toBe("2026-07-25T12:30:00.000Z");
  });

  it("verstummt, sobald begonnen wurde — die Frage ist dann beantwortet", () => {
    const card = toTaskCard(
      evaluated([wear("r1", "Knebel", "c1", true)], { state: "running", startedAt: new Date("2026-07-25T12:10:00Z") }),
      true,
    );
    expect(visibleStartDeadline(card)).toBeNull();
  });

  it("verstummt bei einer zurückgezogenen Aufgabe — sie bindet niemanden mehr", () => {
    const card = toTaskCard(evaluated([wear("r1", "Knebel", "c1")], { state: "withdrawn" }), true);
    expect(visibleStartDeadline(card)).toBeNull();
  });
});

describe("nextTaskStep — eine Regel für Karte UND Melde-Knopf", () => {
  const proof = (over: Partial<TaskProofView> = {}): TaskProofView => ({
    id: "p1", taskId: "t1", sortOrder: 0, description: "Sauberes Wohnzimmer", requireCode: false,
    code: null, submittedAt: null, imageExifTime: null, imageUrl: null,
    verifikationStatus: null, verifikationReason: null,
    reviewAccepted: null, reviewedAt: null, reviewNote: null,
    ...over,
  });

  it("zeigt dem Keyholder nichts — es ist nicht seine Aufgabe", () => {
    expect(nextTaskStep(toTaskCard(evaluated([wear("r1", "Knebel", "c1")]), false))).toBeNull();
  });

  it("nennt zuerst die offene Bedingung, mit dem Weg dorthin", () => {
    const step = nextTaskStep(toTaskCard(evaluated([wear("r1", "Knebel", "c1")], { state: "pending" }), true));
    expect(step).toEqual({ kind: "requirement", label: "Knebel", href: "/dashboard/new/wear-begin?category=c1" });
  });

  it("nennt danach den nächsten Nachweis", () => {
    const card = toTaskCard(evaluated([wear("r1", "Knebel", "c1", true)], { state: "running" }), true, [proof()]);
    expect(nextTaskStep(card)).toEqual({ kind: "proof", label: "Sauberes Wohnzimmer", href: "/dashboard/new/task-proof/p1" });
  });

  it("bleibt bei der Selbstmeldung, wenn die Frist durchgehalten ist — auch wenn das Gerät inzwischen ab ist", () => {
    // Nach `holdUntil` darf der Sub ablegen (siehe `isHeldByTask`). Läge hier die Bedingung vorn,
    // schickte ihn die Karte zurück ins Trage-Formular für etwas, das er nur noch melden muss.
    const card = toTaskCard(evaluated([wear("r1", "Knebel", "c1", false)], { state: "running", awaitingConfirmation: true }), true);
    expect(nextTaskStep(card)).toEqual({ kind: "confirm" });
  });

  it("verlangt während der laufenden Haltefrist nur Halten — nicht die Meldung", () => {
    // Der Kern der Sache: „halte den njoy bis 18:36" ist um 17:41 noch nicht wahr. Ein Melde-Knopf
    // in diesem Moment liesse den Sub eine Stunde bestätigen, die noch nicht stattgefunden hat.
    const card = toTaskCard(evaluated([wear("r1", "Knebel", "c1", true)], { state: "running", holdRunning: true }), true);
    expect(nextTaskStep(card)).toEqual({ kind: "hold", until: "2026-07-25T15:00:00.000Z" });
  });

  it("lässt eine Aufgabe OHNE Bedingungen sofort melden — dort ist die Frist ein Termin", () => {
    // „Staubsaugen bis 18:36" ist wahr, sobald gesaugt ist. Hier wäre Warten die falsche Antwort —
    // `evaluateTask` setzt `holdRunning` für sie nie.
    const card = toTaskCard(evaluated([], { state: "pending" }), true);
    expect(nextTaskStep(card)).toEqual({ kind: "confirm" });
  });

  it("schweigt, sobald der Sub nichts mehr tun kann", () => {
    for (const state of ["done", "missed", "aborted", "withdrawn", "awaitingReview"] as const) {
      expect(nextTaskStep(toTaskCard(evaluated([], { state }), true))).toBeNull();
    }
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

/**
 * Welche Frist-Zeile über einer Aufgabe steht, ist im Dauer-Modus eine ehrliche Frage: vor dem
 * Beginn gibt es keinen Zeitpunkt, den man nennen könnte, ohne etwas zu behaupten.
 */
describe("taskDeadlineLine — Zeitpunkt oder Dauer", () => {
  const fmt = { date: (iso: string) => `AM ${iso}`, duration: (ms: number) => `${ms / 60_000} MIN` };
  const card = (over: Partial<Parameters<typeof taskDeadlineLine>[0]>) => ({
    requirements: [{ id: "r1", label: "Halsband", satisfied: false, href: null }],
    holdDurationMin: null,
    startedAt: null,
    holdUntil: "2026-07-25T15:00:00.000Z",
    ...over,
  });

  it("mit festem Ende steht dort der Zeitpunkt", () => {
    expect(taskDeadlineLine(card({}), fmt)).toEqual({ key: "holdUntilShort", value: "AM 2026-07-25T15:00:00.000Z" });
  });

  it("Dauer-Modus vor dem Beginn: die DAUER — ein Zeitpunkt wäre eine Behauptung", () => {
    expect(taskDeadlineLine(card({ holdDurationMin: 30 }), fmt)).toEqual({ key: "holdDurationShort", value: "30 MIN" });
  });

  it("Dauer-Modus nach dem Beginn: jetzt steht der Zeitpunkt fest und ist die nützlichere Angabe", () => {
    const line = taskDeadlineLine(card({ holdDurationMin: 30, startedAt: "2026-07-25T12:10:00.000Z" }), fmt);
    expect(line.key).toBe("holdUntilShort");
  });

  it("eine reine Textaufgabe bleibt ein Termin, auch ohne Bedingungen", () => {
    expect(taskDeadlineLine(card({ requirements: [] }), fmt).key).toBe("deadlineShort");
  });
});
