import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Die Brücke von der Live-Ableitung in den Posteingang. Zwei Zusagen tragen sie:
 *
 *  1. KEINE DUBLETTEN. Der Lauf ist getaktet und läuft damit ständig über dieselbe Menge — meldet er
 *     ein Vergehen zweimal, steht es zweimal dauerhaft im Posteingang (Nachrichten werden nicht
 *     aufgeräumt). Das ist der Unterschied zu einer doppelten Mail, die vergeht.
 *  2. KEINE ALTLASTEN. Vor dem Stichtag wird nichts gemeldet — sonst kippte der erste Lauf nach dem
 *     Deploy die ganze Historie eines langjährigen Nutzers auf einmal in den Posteingang.
 */

const findMany = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    message: { findMany: (...a: unknown[]) => findMany(...a) },
    appMeta: { findUnique: vi.fn(async () => null) },
  },
}));

const recorded: { bodyKey: string; refId: string; params?: Record<string, unknown> }[] = [];
vi.mock("@/lib/messageService", () => ({
  recordSystemMessage: vi.fn(async (p: { bodyKey: string; ref?: { id: string }; params?: Record<string, unknown> }) => {
    recorded.push({ bodyKey: p.bodyKey, refId: p.ref!.id, params: p.params });
    return "m1";
  }),
}));

const offenses = vi.fn();
vi.mock("@/lib/subOffenses", () => ({ loadSubOffenses: async () => offenses() }));

import { announceNewOffenses, announceableOffenses, OFFENSE_REF_TYPE } from "./offenseAnnounce";
import type { SubOffense } from "./subOffenses";

const SINCE = new Date("2026-08-01T00:00:00Z");
const NOW = new Date("2026-08-11T12:00:00Z");

function offense(p: Partial<SubOffense> & { refId: string }): SubOffense {
  return {
    offenseType: "unauthorized_opening",
    offenseAt: new Date("2026-08-05T08:00:00Z"),
    state: "open",
    title: null,
    description: null,
    judgmentText: null,
    judgedAt: null,
    doneAt: null,
    taskId: null,
    ...p,
  };
}

beforeEach(() => {
  recorded.length = 0;
  findMany.mockReset();
  findMany.mockResolvedValue([]);
  process.env.OFFENSE_ANNOUNCE_FROM = SINCE.toISOString();
});

describe("announceableOffenses — was überhaupt meldbar ist", () => {
  it("lässt weg, was vor dem Stichtag liegt", () => {
    const alt = offense({ refId: "alt", offenseAt: new Date("2026-07-20T08:00:00Z") });
    const neu = offense({ refId: "neu" });

    expect(announceableOffenses([alt, neu], SINCE).map((o) => o.refId)).toEqual(["neu"]);
  });

  it("lässt weg, was keine Tatzeit oder keine Art hat", () => {
    // Das verwaiste Urteil: sein Eintrag ist gelöscht, es gibt weder Art noch Zeitpunkt. Ein Satz
    // darüber wäre inhaltsleer, und gegen den Stichtag liesse es sich nicht prüfen.
    const verwaist = offense({ refId: "weg", offenseType: null, offenseAt: null });

    expect(announceableOffenses([verwaist], SINCE)).toEqual([]);
  });

  it("lässt weg, was bereits beurteilt ist", () => {
    // Der Lauf hinkt der Ableitung um bis zu fünf Minuten hinterher. Wird in dieser Zeit geurteilt,
    // wäre „Ob und wie es beurteilt wird, entscheidet der Keyholder" schlicht falsch — und die Zeile
    // bekäme nie eine Auflösung, weil die Verwerfung nur meldet, was vorher angekündigt war.
    const verworfen = offense({ refId: "v", state: "dismissed" });
    const bestraft = offense({ refId: "b", state: "punished" });
    const offen = offense({ refId: "o" });

    expect(announceableOffenses([verworfen, bestraft, offen], SINCE).map((o) => o.refId)).toEqual(["o"]);
  });

  it("meldet ein von Hand notiertes Vergehen auch VOR dem Stichtag", () => {
    // Der Normalfall einer Notiz: die Keyholderin hält fest, was gestern war. Am Tatzeitpunkt gegen
    // den Stichtag gemessen fiele praktisch jede Notiz durch und erreichte den Träger nie. Eine Flut
    // droht hier nicht — notierte Vergehen entstehen einzeln und von Hand.
    const notiert = offense({
      refId: "n1", offenseType: "manual_offense", title: "Abmachung gebrochen",
      offenseAt: new Date("2026-07-01T20:00:00Z"),
    });

    expect(announceableOffenses([notiert], SINCE).map((o) => o.refId)).toEqual(["n1"]);
  });

  it("beurteilt Notiertes trotzdem nach dem Zustand", () => {
    const beurteilt = offense({ refId: "n2", offenseType: "manual_offense", state: "punished" });

    expect(announceableOffenses([beurteilt], SINCE)).toEqual([]);
  });

  it("nimmt ein Vergehen GENAU auf dem Stichtag mit", () => {
    // Die Grenze gehört zum gemeldeten Bereich: der Stichtag ist der Moment, ab dem gemeldet wird.
    expect(announceableOffenses([offense({ refId: "grenze", offenseAt: SINCE })], SINCE)).toHaveLength(1);
  });
});

describe("announceNewOffenses — melden ohne Dubletten", () => {
  it("meldet ein neues Vergehen mit Bezug auf die refId des VERGEHENS", async () => {
    offenses.mockReturnValue([offense({ refId: "e1" })]);

    expect(await announceNewOffenses("u1", NOW)).toBe(1);
    expect(recorded).toEqual([
      { bodyKey: "offenseDetectedMessage", refId: "e1", params: { offenseKey: "unauthorizedOpening.name", title: "" } },
    ]);
  });

  it("meldet NICHT erneut, was schon eine Nachricht hat", async () => {
    // Der Kern: der Lauf sieht dieselbe Menge alle paar Minuten wieder. Ohne diesen Abgleich stünde
    // dasselbe Vergehen nach einer Stunde ein Dutzend Mal im Posteingang.
    offenses.mockReturnValue([offense({ refId: "e1" }), offense({ refId: "e2" })]);
    findMany.mockResolvedValue([{ refEntityId: "e1" }]);

    expect(await announceNewOffenses("u1", NOW)).toBe(1);
    expect(recorded.map((r) => r.refId)).toEqual(["e2"]);
  });

  it("fragt nur nach den Referenzen, die gerade zur Debatte stehen", async () => {
    // Nicht „alle Vergehens-Nachrichten dieses Trägers": so bedient die Abfrage den Index über alle
    // drei Spalten, und die gefragte Menge wächst nicht mit den Jahren mit.
    offenses.mockReturnValue([offense({ refId: "e1" }), offense({ refId: "e2" })]);

    await announceNewOffenses("u1", NOW);

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        subjectUserId: "u1",
        // `audience` gehört zwingend dazu: seit dem Keyholder-Kanal trägt auch eine Meldung AN SEINE
        // KEYHOLDER die id des Trägers als Betreff. Ohne die Spalte hielte so eine Zeile mit
        // derselben Referenz das Vergehen für dem TRÄGER schon gemeldet und unterdrückte seine
        // Meldung dauerhaft.
        audience: "sub",
        refEntityType: OFFENSE_REF_TYPE,
        refEntityId: { in: ["e1", "e2"] },
      },
    }));
  });

  it("bezieht sich auf das VERGEHEN, nicht auf das Urteil", async () => {
    // Der Namensraum `offense` gehört der StrafeRecord-id. Eine Feststellungs-Meldung entsteht, bevor
    // es ein Urteil gibt — unter dem falschen Typ liefe jede Auflösung ins Leere und die Zeile stünde
    // dauerhaft als „nicht auflösbar" im Posteingang.
    expect(OFFENSE_REF_TYPE).toBe("detectedOffense");
  });

  it("nimmt den Anlass-Titel in die Meldung, wo die Art einen trägt", async () => {
    offenses.mockReturnValue([offense({ refId: "n1", offenseType: "manual_offense", title: "Abmachung gebrochen" })]);

    await announceNewOffenses("u1", NOW);

    expect(recorded[0].bodyKey).toBe("offenseDetectedMessageTitled");
    expect(recorded[0].params).toMatchObject({ title: "Abmachung gebrochen" });
  });

  it("meldet in der Reihenfolge der Tatzeit, älteste zuerst", async () => {
    // Alle Nachrichten eines Laufs bekommen fast denselben `createdAt`; der Posteingang sortiert
    // absteigend. Wer zuletzt geschrieben wird, steht oben — das soll das jüngste Vergehen sein.
    offenses.mockReturnValue([
      offense({ refId: "mittel", offenseAt: new Date("2026-08-06T08:00:00Z") }),
      offense({ refId: "jung", offenseAt: new Date("2026-08-09T08:00:00Z") }),
      offense({ refId: "alt", offenseAt: new Date("2026-08-02T08:00:00Z") }),
    ]);

    await announceNewOffenses("u1", NOW);

    expect(recorded.map((r) => r.refId)).toEqual(["alt", "mittel", "jung"]);
  });

  it("fragt die Nachrichten gar nicht erst ab, wenn es nichts zu melden gäbe", async () => {
    // Der Normalfall jedes getakteten Laufs. Eine Abfrage, die garantiert nichts ändert, ist bei
    // einem Takt von Minuten kein Rundungsfehler.
    offenses.mockReturnValue([offense({ refId: "alt", offenseAt: new Date("2026-07-01T08:00:00Z") })]);

    expect(await announceNewOffenses("u1", NOW)).toBe(0);
    expect(findMany).not.toHaveBeenCalled();
  });
});
