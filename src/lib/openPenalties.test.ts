import { describe, it, expect, vi } from "vitest";

/**
 * Die Träger-Sicht auf die Strafen (Issue #36). Zwei Zusagen tragen das ganze Feature:
 *
 *  1. Der Träger sieht NUR verhängte Urteile. Ein erkanntes, aber unbeurteiltes Vergehen und jedes
 *     verworfene Urteil bleiben unsichtbar — sonst läse er eine Anschuldigung, die die Keyholderin
 *     gerade abgewinkt hat.
 *  2. Vergehensart und Tatzeitpunkt kommen aus der abgeleiteten Vergehens-Liste, nicht aus dem
 *     gespeicherten `offenseType`: der ist nicht kanonisch (eine „KONTROLLANFORDERUNG" ist entweder
 *     `late_control` oder `rejected_control`) und trägt keinen Tatzeitpunkt.
 */

// `selectSubPenalties` ist rein — die Mocks halten nur die Modulkette (strafbuch → prisma,
// strafurteilService → notify/taskService) vom Laden ab.
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/notify", () => ({ notifyUser: vi.fn() }));
vi.mock("@/lib/taskService", () => ({ checkTask: vi.fn(), writeTask: vi.fn() }));
vi.mock("@/lib/appMeta", () => ({ markLastAction: vi.fn() }));

import { selectSubPenalties } from "./openPenalties";
import { cleaningNotRelockedRef, type StrafbuchData } from "./strafbuch";

type Judgment = StrafbuchData["strafeRecords"][number];

function judgment(p: Partial<Judgment> & { refId: string }): Judgment {
  return {
    offenseType: "KONTROLLANFORDERUNG",
    status: "PUNISHED",
    bestraftDatum: new Date("2026-08-01T10:00:00Z"),
    notiz: null,
    reason: "20 Schläge",
    judgedBy: "admin",
    erledigtAt: null,
    taskId: null,
    ...p,
  };
}

/** Ein leeres Strafbuch, in das der Test genau die Listen füllt, die er braucht. Die Auflösung
 *  iteriert über ALLE Vergehens-Listen, deshalb müssen alle existieren. */
function strafbuch(over: Partial<StrafbuchData> = {}): StrafbuchData {
  return {
    unauthorizedOpenings: [],
    lateControls: [],
    rejectedControls: [],
    autoRemovedControls: [],
    reinigungLimitViolations: [],
    wrongDeviceViolations: [],
    missedOrgasmInstructions: [],
    lateLocks: [],
    cleaningNotRelocked: [],
    unfulfilledTasks: [],
    adminPasswordChanges: [],
    unauthorizedOrgasms: [],
    manualOffenses: [],
    strafeRecords: [],
    ...over,
  } as StrafbuchData;
}

const opening = (id: string, startTime: Date) => ({
  id, startTime, note: null, sperrzeitEndetAt: null, sperrzeitIndefinite: false,
});

describe("selectSubPenalties — was der Träger sehen darf", () => {
  it("zeigt verhängte Strafen", () => {
    const sb = strafbuch({
      unauthorizedOpenings: [opening("e1", new Date("2026-07-30T08:00:00Z"))],
      strafeRecords: [judgment({ refId: "e1" })],
    });

    const { open, done } = selectSubPenalties(sb);
    expect(open).toHaveLength(1);
    expect(done).toHaveLength(0);
    expect(open[0]).toMatchObject({
      refId: "e1",
      offenseType: "unauthorized_opening",
      offenseAt: new Date("2026-07-30T08:00:00Z"),
      penaltyText: "20 Schläge",
      judgedAt: new Date("2026-08-01T10:00:00Z"),
      done: false,
      taskId: null,
    });
  });

  it("verschweigt verworfene Urteile", () => {
    const sb = strafbuch({
      unauthorizedOpenings: [opening("e1", new Date("2026-07-30T08:00:00Z"))],
      strafeRecords: [judgment({ refId: "e1", status: "DISMISSED", reason: "war abgesprochen" })],
    });

    expect(selectSubPenalties(sb)).toEqual({ open: [], done: [] });
  });

  it("verschweigt erkannte, aber unbeurteilte Vergehen", () => {
    const sb = strafbuch({
      unauthorizedOpenings: [opening("e1", new Date("2026-07-30T08:00:00Z"))],
    });

    expect(selectSubPenalties(sb)).toEqual({ open: [], done: [] });
  });

  it("trennt offen von erledigt", () => {
    const sb = strafbuch({
      unauthorizedOpenings: [
        opening("e1", new Date("2026-07-30T08:00:00Z")),
        opening("e2", new Date("2026-07-29T08:00:00Z")),
      ],
      strafeRecords: [
        judgment({ refId: "e1" }),
        judgment({ refId: "e2", erledigtAt: new Date("2026-08-02T12:00:00Z") }),
      ],
    });

    const { open, done } = selectSubPenalties(sb);
    expect(open.map((p) => p.refId)).toEqual(["e1"]);
    expect(done.map((p) => p.refId)).toEqual(["e2"]);
    expect(done[0]).toMatchObject({ done: true, doneAt: new Date("2026-08-02T12:00:00Z") });
  });
});

describe("selectSubPenalties — Auflösung und Reihenfolge", () => {
  it("löst denselben gespeicherten Typ je nach Vergehens-Liste kanonisch auf", () => {
    const control = (id: string) => ({
      id, code: "12345", deadline: new Date("2026-07-20T10:00:00Z"),
      fulfilledAt: null, entryStartTime: new Date("2026-07-20T11:00:00Z"),
      backdated: false, kommentar: null, entryNote: null,
    });
    const sb = strafbuch({
      lateControls: [control("k1")],
      rejectedControls: [control("k2")],
      strafeRecords: [judgment({ refId: "k1" }), judgment({ refId: "k2" })],
    } as Partial<StrafbuchData>);

    const types = new Map(selectSubPenalties(sb).open.map((p) => [p.refId, p.offenseType]));
    expect(types.get("k1")).toBe("late_control");
    expect(types.get("k2")).toBe("rejected_control");
  });

  it("kennt die präfigierte ref der Reinigungs-Vergehen", () => {
    const sb = strafbuch({
      cleaningNotRelocked: [{
        entryId: "e9",
        startTime: new Date("2026-07-25T06:00:00Z"),
        deadline: new Date("2026-07-25T06:15:00Z"),
        relockAt: null,
        note: null,
      }],
      strafeRecords: [judgment({ refId: cleaningNotRelockedRef("e9") })],
    });

    expect(selectSubPenalties(sb).open[0]).toMatchObject({
      offenseType: "cleaning_not_relocked",
      offenseAt: new Date("2026-07-25T06:15:00Z"),
    });
  });

  it("behält ein Urteil, dessen Vergehen nicht mehr abgeleitet wird — ohne Art und Tatzeit", () => {
    const sb = strafbuch({ strafeRecords: [judgment({ refId: "weg" })] });

    expect(selectSubPenalties(sb).open[0]).toMatchObject({
      refId: "weg", offenseType: null, offenseAt: null, penaltyText: "20 Schläge",
    });
  });

  it("reicht die Strafaufgabe durch, damit die Anzeige sie nicht doppelt zeigt", () => {
    const sb = strafbuch({
      unauthorizedOpenings: [opening("e1", new Date("2026-07-30T08:00:00Z"))],
      strafeRecords: [judgment({ refId: "e1", taskId: "t1", reason: "Wohnung staubsaugen" })],
    });

    expect(selectSubPenalties(sb).open[0].taskId).toBe("t1");
  });

  it("sortiert offene nach Urteil und erledigte nach Erledigung, je neueste zuerst", () => {
    const sb = strafbuch({
      unauthorizedOpenings: [
        opening("a", new Date("2026-07-01T08:00:00Z")),
        opening("b", new Date("2026-07-02T08:00:00Z")),
        opening("c", new Date("2026-07-03T08:00:00Z")),
        opening("d", new Date("2026-07-04T08:00:00Z")),
      ],
      strafeRecords: [
        judgment({ refId: "a", bestraftDatum: new Date("2026-08-01T00:00:00Z") }),
        judgment({ refId: "b", bestraftDatum: new Date("2026-08-03T00:00:00Z") }),
        // Später geurteilt, aber früher erledigt: die Historie folgt der Erledigung.
        judgment({ refId: "c", bestraftDatum: new Date("2026-08-02T00:00:00Z"), erledigtAt: new Date("2026-08-05T00:00:00Z") }),
        judgment({ refId: "d", bestraftDatum: new Date("2026-08-04T00:00:00Z"), erledigtAt: new Date("2026-08-04T12:00:00Z") }),
      ],
    });

    const { open, done } = selectSubPenalties(sb);
    expect(open.map((p) => p.refId)).toEqual(["b", "a"]);
    expect(done.map((p) => p.refId)).toEqual(["c", "d"]);
  });
});
