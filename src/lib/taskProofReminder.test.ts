import { describe, it, expect, vi } from "vitest";

// Beide Funktionen sind rein — die Mocks halten nur die Modulkette vom Laden ab.
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/taskIntervals", () => ({ evaluateTasks: vi.fn(), TASK_INCLUDE: {}, SUB_VISIBLE_WHERE: {} }));
vi.mock("@/lib/healthHold", () => ({ NOT_PAUSED_WHERE: {} }));
vi.mock("@/lib/notify", () => ({ notifyUser: vi.fn() }));

import { mayBeDueWithin, nextDueProof } from "./taskProofReminder";

/** Woran sich die Erinnerung vor der Nachweis-Frist hält — und welche Aufgaben sie gar nicht erst auswertet. */
const T0 = new Date("2026-09-10T18:37:00Z");
const END = new Date("2026-09-10T19:37:00Z");
const MIN = 60_000;
const task = (holdDurationMin: number | null = null) => ({ createdAt: T0, wirksamAb: null, holdDurationMin });
const proof = (id: string, over: { submittedAt?: Date | null; dueOffsetMin?: number | null } = {}) =>
  ({ id, submittedAt: null, dueOffsetMin: null, ...over });
const started = { holdUntil: END, startedAt: T0 };

describe("nextDueProof", () => {
  it("ohne eigene Fälligkeit gilt das wirksame Ende der Aufgabe", () => {
    const next = nextDueProof([proof("p1")], task(), started, T0);
    expect(next).toEqual({ proof: proof("p1"), due: END });
  });

  it("die früheste offene Frist gewinnt — eine eigene Fälligkeit vor dem Ende", () => {
    const next = nextDueProof([proof("spaet"), proof("frueh", { dueOffsetMin: 20 })], task(), started, T0);
    expect(next?.proof.id).toBe("frueh");
  });

  it("eine verstrichene Frist verstellt die Erinnerung an einen späteren Nachweis nicht", () => {
    const now = new Date(T0.getTime() + 30 * MIN);
    const next = nextDueProof([proof("vorbei", { dueOffsetMin: 20 }), proof("spaeter")], task(), started, now);
    expect(next?.proof.id).toBe("spaeter");
  });

  it("ein eingereichter Nachweis ist nicht mehr offen", () => {
    expect(nextDueProof([proof("p1", { submittedAt: T0 })], task(), started, T0)).toBeNull();
  });

  it("Dauer-Modus vor dem Beginn: ohne eigene Fälligkeit noch keine Frist, mit ihr schon", () => {
    const notStarted = { holdUntil: new Date(T0.getTime() + 90 * MIN), startedAt: null };
    expect(nextDueProof([proof("p1")], task(60), notStarted, T0)).toBeNull();
    expect(nextDueProof([proof("p1"), proof("p2", { dueOffsetMin: 10 })], task(60), notStarted, T0)?.proof.id).toBe("p2");
  });
});

describe("mayBeDueWithin — die Vorprüfung vor der Auswertung", () => {
  const row = (holdDurationMin: number | null, holdUntil: Date, proofs: ReturnType<typeof proof>[]) =>
    ({ ...task(holdDurationMin), holdUntil, proofs });

  it("klassisch: nur, wenn die Frist in den nächsten Minuten liegt", () => {
    const soon = new Date(T0.getTime() + 10 * MIN);
    const inThreeDays = new Date(T0.getTime() + 3 * 24 * 60 * MIN);
    const horizon = new Date(T0.getTime() + 15 * MIN);
    expect(mayBeDueWithin(row(null, soon, [proof("p")]), T0, horizon)).toBe(true);
    expect(mayBeDueWithin(row(null, inThreeDays, [proof("p")]), T0, horizon)).toBe(false);
  });

  it("eine eigene Fälligkeit zählt, auch wenn das Ende weit weg ist", () => {
    const inThreeDays = new Date(T0.getTime() + 3 * 24 * 60 * MIN);
    const horizon = new Date(T0.getTime() + 15 * MIN);
    expect(mayBeDueWithin(row(null, inThreeDays, [proof("p", { dueOffsetMin: 10 })]), T0, horizon)).toBe(true);
  });

  it("Dauer-Modus: ab dem frühestmöglichen Ende kommt die Aufgabe in Frage", () => {
    // 60 min Dauer, Spalte = Kulanz 30 + 60. Frühestmögliches Ende ist T0 + 60.
    const column = new Date(T0.getTime() + 90 * MIN);
    expect(mayBeDueWithin(row(60, column, [proof("p")]), T0, new Date(T0.getTime() + 15 * MIN))).toBe(false);
    expect(mayBeDueWithin(row(60, column, [proof("p")]), new Date(T0.getTime() + 50 * MIN), new Date(T0.getTime() + 65 * MIN))).toBe(true);
  });
});
