import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * `edit_task` und `holdHours`: die Spanne muss ab dem Moment zählen, ab dem der Sub HANDELN kann —
 * nicht ab dem Bearbeiten.
 *
 * Der Anlege-Pfad ankert seit B1 auf dem geplanten Auslöse-Zeitpunkt (`resolveTaskHold`); der
 * Änderungs-Pfad zog nicht nach und rechnete stur ab „jetzt". Folge: eine terminierte, noch nicht
 * zugestellte Aufgabe verlor beim Bearbeiten genau ihre Verzögerung — bei einer Spanne kürzer als
 * diese hätte `updateTask` sie sogar mit `TASK_HOLD_UNTIL_TOO_SOON` abgewiesen.
 *
 * Geprüft wird an BEIDEN Zweigen derselben Funktion: der Commit übergibt den Wert an `updateTask`,
 * die dryRun-Vorschau zeigt ihn — sie dürfen über dieselbe Aufgabe nicht Verschiedenes sagen.
 */
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    task: { findUnique: vi.fn() },
  },
}));
vi.mock("@/lib/taskService", async (importOriginal) => {
  // `mergeTaskPatch` bleibt ECHT: die Vorschau soll durch dieselbe reine Zusammenführung laufen wie
  // der Commit — genau das ist ihre Zusage.
  const actual = await importOriginal<typeof import("@/lib/taskService")>();
  return { ...actual, createTask: vi.fn(), updateTask: vi.fn(), withdrawTask: vi.fn() };
});

import { mcpEditTask } from "./mcpWrite";
import { prisma } from "@/lib/prisma";
import { updateTask } from "@/lib/taskService";
import { taskRow } from "@/test/taskRow";

const userFind = prisma.user.findUnique as unknown as ReturnType<typeof vi.fn>;
const taskFind = prisma.task.findUnique as unknown as ReturnType<typeof vi.fn>;
const updateMock = updateTask as unknown as ReturnType<typeof vi.fn>;

const JETZT = new Date("2026-08-15T12:00:00Z");
/** Vier Stunden nach `JETZT` — die Verzögerung, die beim Bearbeiten nicht verloren gehen darf. */
const AUSLOESUNG = new Date("2026-08-15T16:00:00Z");
const H = 3600_000;

/** Eine Aufgabe im klassischen Modus (festes Ende), so wie `prisma.task.findUnique` sie liefert:
 *  eben gestellt, Ende acht Stunden später. Die Fälle unten verschieben einzelne Felder. */
const task = (over: Partial<Record<string, unknown>> = {}) => taskRow(JETZT, over);

/** Terminiert und noch nicht zugestellt — die Konstellation aus `isHiddenFromSub`. */
const terminiert = () => task({ wirksamAb: AUSLOESUNG, benachrichtigtAt: null });

beforeEach(() => {
  vi.useFakeTimers().setSystemTime(JETZT);
  userFind.mockReset().mockResolvedValue({ id: "u1" });
  taskFind.mockReset();
  updateMock.mockReset().mockResolvedValue({ ok: true, data: { id: "t1", userId: "u1" } });
});

afterEach(() => vi.useRealTimers());

describe("mcpEditTask — Nullpunkt von holdHours", () => {
  it("terminierte Aufgabe: die Spanne zählt ab dem Auslösen, nicht ab dem Bearbeiten", async () => {
    taskFind.mockResolvedValue(terminiert());

    await mcpEditTask("sub", { id: "t1", holdHours: 6 });

    expect(updateMock).toHaveBeenCalledWith("t1", "u1", expect.objectContaining({
      holdUntil: new Date(AUSLOESUNG.getTime() + 6 * H),
    }), expect.anything());
  });

  it("terminierte Aufgabe: eine Spanne KÜRZER als die Verzögerung bleibt in der Zukunft", async () => {
    // Ab „jetzt" gerechnet läge das Ende zwei Stunden vor dem Auslösen — `updateTask` wiese das mit
    // TASK_HOLD_UNTIL_TOO_SOON ab, und der Agent bekäme einen Fehler für eine sinnvolle Anweisung.
    taskFind.mockResolvedValue(terminiert());

    await mcpEditTask("sub", { id: "t1", holdHours: 2 });

    expect(updateMock).toHaveBeenCalledWith("t1", "u1", expect.objectContaining({
      holdUntil: new Date(AUSLOESUNG.getTime() + 2 * H),
    }), expect.anything());
  });

  it("laufende Aufgabe: die Frist zählt ab jetzt, nicht rückwirkend ab dem Stellen", async () => {
    // Der rohe Nullpunkt liegt hier drei Stunden zurück; ab ihm gerechnet läge das neue Ende in der
    // Vergangenheit und der Sub bekäme ein Versäumnis, ohne je handeln zu können.
    taskFind.mockResolvedValue(task({ createdAt: new Date(JETZT.getTime() - 3 * H) }));

    await mcpEditTask("sub", { id: "t1", holdHours: 2 });

    expect(updateMock).toHaveBeenCalledWith("t1", "u1", expect.objectContaining({
      holdUntil: new Date(JETZT.getTime() + 2 * H),
    }), expect.anything());
  });

  it("ein absolutes holdUntilAt bleibt absolut — der Nullpunkt rührt es nicht an", async () => {
    taskFind.mockResolvedValue(terminiert());
    const fest = new Date("2026-08-16T09:00:00Z");

    await mcpEditTask("sub", { id: "t1", holdUntilAt: fest.toISOString(), holdHours: 6 });

    expect(updateMock).toHaveBeenCalledWith("t1", "u1", expect.objectContaining({ holdUntil: fest }), expect.anything());
  });

  it("dryRun zeigt denselben Nullpunkt, den der Commit schreibt — und committet nichts", async () => {
    taskFind.mockResolvedValue(terminiert());

    const r = await mcpEditTask("sub", { id: "t1", holdHours: 6, dryRun: true }) as {
      preview: Record<string, unknown>;
    };

    expect(r.preview.holdUntil).toBe(new Date(AUSLOESUNG.getTime() + 6 * H).toISOString());
    expect(updateMock).not.toHaveBeenCalled();
  });
});
