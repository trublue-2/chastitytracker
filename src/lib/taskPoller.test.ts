import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * `processDueTasks` — der Minuten-Tick, der das Ergebnis fälliger Aufgaben meldet.
 *
 * Dieser Pfad hatte bis hierher KEINE Tests; `c77dec2` hielt das ausdrücklich fest („die Lücke ist
 * testbar und sollte einen bekommen, sobald der Poller-Pfad Tests hat"). Beide Fehler, die der
 * Code-Review hier fand, sind unten als Regression festgeschrieben:
 *  - eine noch offene Aufgabe wurde als „versäumt" gemeldet UND dauerhaft gestempelt,
 *  - der Stempel kam gesammelt erst nach der Schleife, sodass ein Abbruch in der Mitte alle bereits
 *    verschickten Meldungen im nächsten Tick wiederholte.
 */

vi.mock("@/lib/prisma", () => ({
  prisma: {
    task: { findMany: vi.fn(), update: vi.fn() },
    user: { findUnique: vi.fn() },
  },
}));
vi.mock("@/lib/notify", () => ({ notifyUser: vi.fn(), notifyControllers: vi.fn() }));
vi.mock("@/lib/keyholder", () => ({ getControllersOfUser: vi.fn() }));
vi.mock("@/lib/taskIntervals", () => ({ evaluateTasks: vi.fn(), TASK_INCLUDE: {} }));

import { processDueTasks } from "./taskService";
import { prisma } from "@/lib/prisma";
import { notifyUser, notifyControllers } from "@/lib/notify";
import { getControllersOfUser } from "@/lib/keyholder";
import { evaluateTasks } from "@/lib/taskIntervals";
import type { TaskState } from "./tasks";

const findMany = prisma.task.findMany as unknown as ReturnType<typeof vi.fn>;
const update = prisma.task.update as unknown as ReturnType<typeof vi.fn>;
const userFind = prisma.user.findUnique as unknown as ReturnType<typeof vi.fn>;
const notify = notifyUser as unknown as ReturnType<typeof vi.fn>;
const notifyKh = notifyControllers as unknown as ReturnType<typeof vi.fn>;
const controllers = getControllersOfUser as unknown as ReturnType<typeof vi.fn>;
const evaluate = evaluateTasks as unknown as ReturnType<typeof vi.fn>;

const NOW = new Date("2026-07-25T15:00:00Z");

const row = (id: string) => ({ id, userId: "u1", title: `Aufgabe ${id}`, holdUntil: NOW });

/** Eine ausgewertete Aufgabe in der Form, die `processDueTasks` liest. */
const evaluated = (id: string, state: TaskState, awaitingConfirmation = false) => ({
  task: row(id),
  evaluation: { state, startedAt: null, missing: [], failedRequirement: null, failedAt: null, awaitingConfirmation },
  requirements: [],
});

/** Die ids, die tatsächlich gestempelt wurden. */
const stamped = () => update.mock.calls.map((c) => c[0].where.id);
/** Die Betreff-Schlüssel, die an den Sub gingen. */
const subjects = () => notify.mock.calls.map((c) => c[1].subjectKey);

beforeEach(() => {
  vi.clearAllMocks();
  controllers.mockResolvedValue([{ id: "kh1" }]);
  userFind.mockResolvedValue({ username: "sub" });
  update.mockResolvedValue({});
  notify.mockResolvedValue(undefined);
  notifyKh.mockResolvedValue(undefined);
});

describe("processDueTasks — Endzustände", () => {
  it("erfüllte Aufgabe: Sub und Keyholder werden gemeldet, Zeile gestempelt", async () => {
    findMany.mockResolvedValue([row("t1")]);
    evaluate.mockResolvedValue([evaluated("t1", "done")]);

    await processDueTasks(NOW);

    expect(subjects()).toEqual(["taskDoneSubject"]);
    expect(notifyKh).toHaveBeenCalledOnce();
    expect(stamped()).toEqual(["t1"]);
  });

  it("versäumte und abgebrochene Aufgaben melden den Fehlschlag", async () => {
    findMany.mockResolvedValue([row("t1"), row("t2")]);
    evaluate.mockResolvedValue([evaluated("t1", "missed"), evaluated("t2", "aborted")]);

    await processDueTasks(NOW);

    expect(subjects()).toEqual(["taskFailedSubject", "taskFailedSubject"]);
    expect(stamped()).toEqual(["t1", "t2"]);
  });

  it("wartet nur noch auf die Selbstmeldung: der Sub wird erinnert, der Keyholder nicht", async () => {
    findMany.mockResolvedValue([row("t1")]);
    evaluate.mockResolvedValue([evaluated("t1", "running", true)]);

    await processDueTasks(NOW);

    expect(subjects()).toEqual(["taskAwaitingSubject"]);
    // Es gibt noch kein Ergebnis — den Keyholder geht das nichts an.
    expect(notifyKh).not.toHaveBeenCalled();
    // Gestempelt wird trotzdem, sonst besetzt die Zeile den `take`-Deckel dauerhaft (Fund #5, c77dec2).
    expect(stamped()).toEqual(["t1"]);
  });
});

describe("processDueTasks — Regressionen aus dem Code-Review", () => {
  /**
   * Eine fällige, aber noch OFFENE Aufgabe (`pending`/`partial`) hat kein Ergebnis. Sie als
   * „versäumt" zu melden fällt ein Urteil, das die Auswertung selbst nicht gefällt hat — und der
   * Stempel versiegelt es gegen jede spätere Korrektur, während das Strafbuch (live abgeleitet)
   * weiter widerspricht.
   */
  it("REGRESSION: offener Zustand wird nicht als versäumt gemeldet und nicht gestempelt", async () => {
    for (const state of ["pending", "partial"] as const) {
      vi.clearAllMocks();
      update.mockResolvedValue({});
      controllers.mockResolvedValue([{ id: "kh1" }]);
      userFind.mockResolvedValue({ username: "sub" });
      findMany.mockResolvedValue([row("t1")]);
      evaluate.mockResolvedValue([evaluated("t1", state)]);

      await processDueTasks(NOW);

      expect(notify, state).not.toHaveBeenCalled();
      expect(notifyKh, state).not.toHaveBeenCalled();
      // KEIN Stempel: der nächste Tick greift sie wieder auf, sobald sie entschieden ist.
      expect(stamped(), state).toEqual([]);
    }
  });

  /**
   * REGRESSION (Issue #39): `awaitingReview` ist weder offen noch entschieden. Gegen `isTaskOpen`
   * geprüft fiel der Zustand durch beide Wächter, landete im Endzustands-Zweig und wurde als
   * „versäumt" gemeldet UND gestempelt — während die Keyholderin noch gar nicht geurteilt hatte.
   *
   * Richtig ist: SIE ist am Zug, also bekommt SIE die Meldung. Der Sub hört nichts (für ihn ist die
   * Aufgabe erledigt), und gestempelt wird trotzdem — sonst besetzt die Zeile den `take`-Deckel für
   * immer, derselbe Stau, den `c77dec2` schon einmal behoben hat.
   */
  it("REGRESSION: wartende Sichtung geht an die Keyholderin, nicht als Versäumnis an den Sub", async () => {
    findMany.mockResolvedValue([row("t1")]);
    evaluate.mockResolvedValue([evaluated("t1", "awaitingReview")]);

    await processDueTasks(NOW);

    expect(notify).not.toHaveBeenCalled();
    expect(notifyKh).toHaveBeenCalledOnce();
    expect(notifyKh.mock.calls[0][1].subjectKey).toBe("taskReviewSubjectKeyholder");
    expect(stamped()).toEqual(["t1"]);
  });

  /**
   * Der Stempel ist die einzige Einmal-Zusage (eine Dedup im Posteingang gibt es nicht). Gesammelt
   * am Ende der Schleife lag zwischen der ersten Mail und dem Schreiben ein Fenster über ALLE
   * Aufgaben des Nutzers — ein Prozess-Neustart darin wiederholte jede davon.
   */
  it("REGRESSION: jede Aufgabe wird einzeln gestempelt, direkt nach ihrer Zustellung", async () => {
    findMany.mockResolvedValue([row("t1"), row("t2"), row("t3")]);
    evaluate.mockResolvedValue([evaluated("t1", "done"), evaluated("t2", "done"), evaluated("t3", "done")]);

    await processDueTasks(NOW);

    // Drei einzelne Schreibvorgänge statt eines gesammelten am Schluss.
    expect(update).toHaveBeenCalledTimes(3);
    expect(stamped()).toEqual(["t1", "t2", "t3"]);
  });

  it("REGRESSION: bricht die Zustellung mittendrin ab, bleiben die bereits gemeldeten gestempelt", async () => {
    findMany.mockResolvedValue([row("t1"), row("t2"), row("t3")]);
    evaluate.mockResolvedValue([evaluated("t1", "done"), evaluated("t2", "done"), evaluated("t3", "done")]);
    // Die zweite Zustellung scheitert (Sub-Meldung von t2).
    notify.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("SMTP weg"));

    await processDueTasks(NOW);

    // t1 ist durch UND gestempelt — der nächste Tick meldet sie nicht erneut.
    expect(stamped()).toEqual(["t1"]);
  });

  it("ein Fehler bei einem Nutzer bricht den Tick für die anderen nicht ab", async () => {
    findMany.mockResolvedValue([row("t1"), { ...row("t2"), userId: "u2" }]);
    evaluate
      .mockRejectedValueOnce(new Error("Auswertung kaputt"))
      .mockResolvedValueOnce([{ ...evaluated("t2", "done"), task: { ...row("t2"), userId: "u2" } }]);

    await processDueTasks(NOW);

    expect(stamped()).toEqual(["t2"]);
  });

  it("ohne fällige Aufgaben passiert gar nichts", async () => {
    findMany.mockResolvedValue([]);
    await processDueTasks(NOW);
    expect(evaluate).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });
});
