import { describe, it, expect, vi } from "vitest";

/**
 * Das Strafbuch aus der Sicht des Trägers (Issue #36). Zwei Zusagen tragen das Feature:
 *
 *  1. Er sieht ALLES — erkannte, verworfene und bestrafte Vergehen, jedes mit seinem Zustand. Bis
 *     v5.0.12 waren es nur die verhängten Strafen; die Begründung („sie soll still abwinken
 *     können") ist bewusst aufgegeben, weil eine Zeile, die er gesehen hat und die dann wortlos
 *     verschwindet, schlechter ist als beides.
 *  2. Vergehensart und Tatzeitpunkt kommen aus der abgeleiteten Vergehens-Liste, nicht aus dem
 *     gespeicherten `offenseType`: der ist nicht kanonisch (eine „KONTROLLANFORDERUNG" ist entweder
 *     `late_control` oder `rejected_control`) und trägt keinen Tatzeitpunkt.
 */

// `selectSubOffenses` ist rein — die Mocks halten nur die Modulkette (strafbuch → prisma,
// strafurteilService → notify/taskService) vom Laden ab.
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/notify", () => ({ notifyUser: vi.fn() }));
vi.mock("@/lib/taskService", () => ({ checkTask: vi.fn(), writeTask: vi.fn() }));
vi.mock("@/lib/appMeta", () => ({ markLastAction: vi.fn() }));

import { selectSubOffenses, openPenaltiesOf } from "./subOffenses";
import { cleaningNotRelockedRef, type StrafbuchData } from "./strafbuch";
import { emptyOffenseLists } from "@/test/strafbuchFixture";

type Judgment = StrafbuchData["strafeRecords"][number];

function judgment(p: Partial<Judgment> & { refId: string }): Judgment {
  return {
    offenseType: "KONTROLLANFORDERUNG",
    status: "PUNISHED",
    bestraftDatum: new Date("2026-08-01T10:00:00Z"),
    notiz: null,
    reason: "20 Schläge",
    judgedBy: "admin",
    judgedByName: null,
    erledigtAt: null,
    taskId: null,
    ...p,
  };
}

/** Ein leeres Strafbuch, in das der Test genau die Listen füllt, die er braucht. Die Auflösung
 *  iteriert über ALLE Vergehens-Listen, deshalb müssen alle existieren. */
function strafbuch(over: Partial<StrafbuchData> = {}): StrafbuchData {
  return { ...emptyOffenseLists(), strafeRecords: [], ...over } as StrafbuchData;
}

const opening = (id: string, startTime: Date) => ({
  id, startTime, note: null, sperrzeitEndetAt: null, sperrzeitIndefinite: false,
});

describe("selectSubOffenses — Zustände", () => {
  it("ein erkanntes, unbeurteiltes Vergehen ist offen — und sichtbar", () => {
    const sb = strafbuch({ unauthorizedOpenings: [opening("e1", new Date("2026-07-30T08:00:00Z"))] });

    expect(selectSubOffenses(sb)).toMatchObject([{
      refId: "e1",
      offenseType: "unauthorized_opening",
      offenseAt: new Date("2026-07-30T08:00:00Z"),
      state: "open",
      judgmentText: null,
      judgedAt: null,
    }]);
  });

  it("ein verworfenes Urteil VERSCHWINDET NICHT, es wird als verworfen ausgewiesen", () => {
    // Der Kern der Entscheidung: hätte der Träger die Zeile erst gesehen und dann nicht mehr,
    // könnte er „abgewunken" nicht von „kaputt" unterscheiden.
    const sb = strafbuch({
      unauthorizedOpenings: [opening("e1", new Date("2026-07-30T08:00:00Z"))],
      strafeRecords: [judgment({ refId: "e1", status: "DISMISSED", reason: "war abgesprochen" })],
    });

    expect(selectSubOffenses(sb)).toMatchObject([{ state: "dismissed", judgmentText: "war abgesprochen" }]);
  });

  it("bestraft und erledigt sind zwei Zustände, nicht einer", () => {
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

    const byRef = new Map(selectSubOffenses(sb).map((o) => [o.refId, o.state]));
    expect(byRef.get("e1")).toBe("punished");
    expect(byRef.get("e2")).toBe("done");
  });

  it("openPenaltiesOf liefert genau die offenen Strafen — das, was den Träger fordert", () => {
    const sb = strafbuch({
      unauthorizedOpenings: [
        opening("a", new Date("2026-07-30T08:00:00Z")),
        opening("b", new Date("2026-07-29T08:00:00Z")),
        opening("c", new Date("2026-07-28T08:00:00Z")),
      ],
      strafeRecords: [
        judgment({ refId: "b" }),
        judgment({ refId: "c", status: "DISMISSED" }),
      ],
    });

    expect(openPenaltiesOf(selectSubOffenses(sb)).map((o) => o.refId)).toEqual(["b"]);
  });
});

describe("selectSubOffenses — Auflösung und Reihenfolge", () => {
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
    });

    const types = new Map(selectSubOffenses(sb).map((o) => [o.refId, o.offenseType]));
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

    expect(selectSubOffenses(sb)[0]).toMatchObject({
      offenseType: "cleaning_not_relocked",
      offenseAt: new Date("2026-07-25T06:15:00Z"),
    });
  });

  it("nimmt den Anlass-Text aus der Vergehens-Tabelle, für jede Art, die einen führt", () => {
    // Welche Arten einen eigenen Titel tragen, steht im `detail`-Zugriff von `OFFENSE_LISTS` — nicht
    // als Aufzählung in der Auflösung. Eine dritte solche Art bekommt ihn damit von selbst.
    const sb = strafbuch({
      manualOffenses: [{
        id: "n1", occurredAt: new Date("2026-08-05T09:00:00Z"),
        title: "Abmachung gebrochen", description: "ohne Rückfrage geöffnet", createdBy: "admin",
      }],
      unfulfilledTasks: [{
        id: "t1", title: "Wohnung staubsaugen",
        holdUntil: new Date("2026-08-04T09:00:00Z"), failedAt: null,
      }],
    } as Partial<StrafbuchData>);

    const byRef = new Map(selectSubOffenses(sb).map((o) => [o.refId, o]));
    expect(byRef.get("n1")).toMatchObject({ title: "Abmachung gebrochen", description: "ohne Rückfrage geöffnet" });
    // Eine Aufgabe trägt einen Titel, aber keine eigene Beschreibung.
    expect(byRef.get("t1")).toMatchObject({ title: "Wohnung staubsaugen", description: null });
  });

  it("behält ein Urteil, dessen Vergehen nicht mehr abgeleitet wird — ohne Art und Tatzeit", () => {
    const sb = strafbuch({ strafeRecords: [judgment({ refId: "weg" })] });

    expect(selectSubOffenses(sb)).toMatchObject([{
      refId: "weg", offenseType: null, offenseAt: null, state: "punished", judgmentText: "20 Schläge",
    }]);
  });

  it("reicht die Strafaufgabe durch, damit die Anzeige sie nicht doppelt zeigt", () => {
    const sb = strafbuch({
      unauthorizedOpenings: [opening("e1", new Date("2026-07-30T08:00:00Z"))],
      strafeRecords: [judgment({ refId: "e1", taskId: "t1", reason: "Wohnung staubsaugen" })],
    });

    expect(selectSubOffenses(sb)[0].taskId).toBe("t1");
  });

  it("sortiert nach dem JÜNGSTEN Ereignis der Zeile, nicht nach der Tatzeit", () => {
    // Sonst stünde ein heute beurteiltes Vergehen von letzter Woche unter einem gestern erkannten.
    const sb = strafbuch({
      unauthorizedOpenings: [
        opening("alt-beurteilt", new Date("2026-07-01T08:00:00Z")),
        opening("neu-erkannt", new Date("2026-08-03T08:00:00Z")),
        opening("erledigt", new Date("2026-07-02T08:00:00Z")),
      ],
      strafeRecords: [
        judgment({ refId: "alt-beurteilt", bestraftDatum: new Date("2026-08-04T00:00:00Z") }),
        judgment({ refId: "erledigt", bestraftDatum: new Date("2026-08-01T00:00:00Z"), erledigtAt: new Date("2026-08-06T00:00:00Z") }),
      ],
    });

    expect(selectSubOffenses(sb).map((o) => o.refId)).toEqual(["erledigt", "alt-beurteilt", "neu-erkannt"]);
  });
});
