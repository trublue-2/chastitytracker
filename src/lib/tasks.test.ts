import { describe, it, expect } from "vitest";
import {
  evaluateTask, intersectAll, coversContinuously, startDeadline, isTaskOpen, isTaskOffense,
  type Interval, type TaskLike, type TaskRequirementLike,
} from "./tasks";

/**
 * Der Zustand einer Aufgabe wird abgeleitet, nicht gespeichert — diese Datei ist damit der eigentliche
 * Korrektheits-Beweis des Features. Leitbeispiel des Owners: „Staubsauge die Wohnung. Mit KG, Halsband
 * und Knebel. Um 15 Uhr ist das Haus sauber und du kniest verschlossen."
 */

const d = (iso: string) => new Date(iso);
const iv = (start: string, end: string): Interval => ({ start: d(start), end: d(end) });

/** Die drei Bedingungen des Leitbeispiels. */
const KG: TaskRequirementLike = { id: "r-kg", label: "KG verschlossen" };
const HALSBAND: TaskRequirementLike = { id: "r-hals", label: "Halsband" };
const KNEBEL: TaskRequirementLike = { id: "r-kneb", label: "Knebel" };

/** Aufgabe: erstellt 12:00, halten bis 15:00, 30 Min Kulanz zum Anlegen. */
const task = (over: Partial<TaskLike> = {}): TaskLike => ({
  createdAt: d("2026-07-25T12:00:00Z"),
  holdUntil: d("2026-07-25T15:00:00Z"),
  startGraceMin: 30,
  completedAt: null,
  withdrawnAt: null,
  ...over,
});

describe("intersectAll — alle Bedingungen gleichzeitig", () => {
  it("schneidet überlappende Intervalle", () => {
    const r = intersectAll([
      [iv("2026-07-25T12:00:00Z", "2026-07-25T15:00:00Z")],
      [iv("2026-07-25T12:30:00Z", "2026-07-25T16:00:00Z")],
    ]);
    expect(r).toEqual([iv("2026-07-25T12:30:00Z", "2026-07-25T15:00:00Z")]);
  });

  it("ohne Überlappung bleibt nichts übrig", () => {
    const r = intersectAll([
      [iv("2026-07-25T12:00:00Z", "2026-07-25T13:00:00Z")],
      [iv("2026-07-25T14:00:00Z", "2026-07-25T15:00:00Z")],
    ]);
    expect(r).toEqual([]);
  });

  it("eine leere Bedingung macht den ganzen Schnitt leer", () => {
    expect(intersectAll([[iv("2026-07-25T12:00:00Z", "2026-07-25T15:00:00Z")], []])).toEqual([]);
  });

  it("drei Bedingungen — der Schnitt beginnt mit der letzten und endet mit der ersten", () => {
    const r = intersectAll([
      [iv("2026-07-25T12:00:00Z", "2026-07-25T15:00:00Z")], // KG
      [iv("2026-07-25T12:10:00Z", "2026-07-25T15:30:00Z")], // Halsband
      [iv("2026-07-25T12:20:00Z", "2026-07-25T16:00:00Z")], // Knebel
    ]);
    expect(r).toEqual([iv("2026-07-25T12:20:00Z", "2026-07-25T15:00:00Z")]);
  });
});

describe("coversContinuously", () => {
  it("lückenlos abgedeckt", () => {
    expect(coversContinuously([iv("2026-07-25T12:00:00Z", "2026-07-25T15:00:00Z")], d("2026-07-25T12:30:00Z"), d("2026-07-25T15:00:00Z"))).toBe(true);
  });

  it("Lücke in der Mitte zählt nicht als durchgehend", () => {
    const parts = [iv("2026-07-25T12:00:00Z", "2026-07-25T13:00:00Z"), iv("2026-07-25T13:05:00Z", "2026-07-25T15:00:00Z")];
    expect(coversContinuously(parts, d("2026-07-25T12:00:00Z"), d("2026-07-25T15:00:00Z"))).toBe(false);
  });

  it("nahtlos aneinander grenzende Abschnitte sind durchgehend", () => {
    const parts = [iv("2026-07-25T12:00:00Z", "2026-07-25T13:00:00Z"), iv("2026-07-25T13:00:00Z", "2026-07-25T15:00:00Z")];
    expect(coversContinuously(parts, d("2026-07-25T12:00:00Z"), d("2026-07-25T15:00:00Z"))).toBe(true);
  });
});

describe("startDeadline — Kulanzfrist", () => {
  it("Erstellung + Kulanzminuten", () => {
    expect(startDeadline(task())).toEqual(d("2026-07-25T12:30:00Z"));
  });
});

describe("evaluateTask — Leitbeispiel (KG + Halsband + Knebel bis 15:00)", () => {
  const reqs = [KG, HALSBAND, KNEBEL];
  /** Alle drei ab 12:10 angelegt, laufen bis `end`. */
  const allFrom = (start: string, end: string): Interval[][] => [
    [iv(start, end)], [iv(start, end)], [iv(start, end)],
  ];

  it("noch nichts angelegt → pending, alle drei fehlen", () => {
    const r = evaluateTask(task(), reqs, [[], [], []], d("2026-07-25T12:05:00Z"));
    expect(r.state).toBe("pending");
    expect(r.missing.map((m) => m.label)).toEqual(["KG verschlossen", "Halsband", "Knebel"]);
  });

  it("zwei von drei angelegt → partial, nennt genau die fehlende", () => {
    const now = d("2026-07-25T12:15:00Z");
    const r = evaluateTask(task(), reqs, [
      [iv("2026-07-25T12:05:00Z", "2026-07-25T12:15:00Z")], // KG läuft
      [iv("2026-07-25T12:10:00Z", "2026-07-25T12:15:00Z")], // Halsband läuft
      [],                                                    // Knebel fehlt
    ], now);
    expect(r.state).toBe("partial");
    expect(r.missing.map((m) => m.label)).toEqual(["Knebel"]);
  });

  it("alle drei angelegt → running, Beginn = als die LETZTE dazukam", () => {
    const now = d("2026-07-25T13:00:00Z");
    const r = evaluateTask(task(), reqs, [
      [iv("2026-07-25T12:00:00Z", "2026-07-25T13:00:00Z")],
      [iv("2026-07-25T12:10:00Z", "2026-07-25T13:00:00Z")],
      [iv("2026-07-25T12:20:00Z", "2026-07-25T13:00:00Z")], // letzte
    ], now);
    expect(r.state).toBe("running");
    expect(r.startedAt).toEqual(d("2026-07-25T12:20:00Z"));
    expect(r.missing).toEqual([]);
  });

  it("Knebel um 14:00 abgelegt → aborted, mit Beleg WELCHE Bedingung WANN wegfiel", () => {
    const now = d("2026-07-25T14:30:00Z");
    const r = evaluateTask(task(), reqs, [
      [iv("2026-07-25T12:10:00Z", "2026-07-25T14:30:00Z")],
      [iv("2026-07-25T12:10:00Z", "2026-07-25T14:30:00Z")],
      [iv("2026-07-25T12:10:00Z", "2026-07-25T14:00:00Z")], // Knebel früher weg
    ], now);
    expect(r.state).toBe("aborted");
    expect(r.failedRequirement?.label).toBe("Knebel");
    expect(r.failedAt).toEqual(d("2026-07-25T14:00:00Z"));
  });

  it("durchgehalten bis 15:00, aber noch nicht als erledigt gemeldet → running/awaitingConfirmation", () => {
    const now = d("2026-07-25T15:05:00Z");
    const r = evaluateTask(task(), reqs, allFrom("2026-07-25T12:10:00Z", "2026-07-25T15:05:00Z"), now);
    expect(r.state).toBe("running");
    expect(r.awaitingConfirmation).toBe(true);
  });

  it("durchgehalten UND erledigt gemeldet → done", () => {
    const now = d("2026-07-25T15:05:00Z");
    const r = evaluateTask(
      task({ completedAt: d("2026-07-25T15:01:00Z") }),
      reqs,
      allFrom("2026-07-25T12:10:00Z", "2026-07-25T15:05:00Z"),
      now,
    );
    expect(r.state).toBe("done");
  });

  it("erst um 14:59 alles angelegt → NICHT erfüllt (Kulanzfrist verpasst)", () => {
    // Genau die Falle, die das Modell verhindern soll: kurz vor Schluss anlegen ist keine Erfüllung.
    const now = d("2026-07-25T15:05:00Z");
    const r = evaluateTask(task(), reqs, allFrom("2026-07-25T14:59:00Z", "2026-07-25T15:05:00Z"), now);
    expect(r.state).toBe("missed");
  });

  it("Frist verstrichen, nie begonnen → missed", () => {
    const r = evaluateTask(task(), reqs, [[], [], []], d("2026-07-25T15:30:00Z"));
    expect(r.state).toBe("missed");
  });

  it("kurz unterbrochen und wieder angelegt → aborted (durchgehend heisst durchgehend)", () => {
    const now = d("2026-07-25T15:05:00Z");
    const r = evaluateTask(task(), reqs, [
      [iv("2026-07-25T12:10:00Z", "2026-07-25T15:05:00Z")],
      [iv("2026-07-25T12:10:00Z", "2026-07-25T15:05:00Z")],
      [iv("2026-07-25T12:10:00Z", "2026-07-25T13:00:00Z"), iv("2026-07-25T13:05:00Z", "2026-07-25T15:05:00Z")],
    ], now);
    expect(r.state).toBe("aborted");
    expect(r.failedRequirement?.label).toBe("Knebel");
  });

  it("Grenzfall: exakt bis holdUntil gehalten zählt als gehalten", () => {
    const r = evaluateTask(
      task({ completedAt: d("2026-07-25T15:00:00Z") }),
      reqs,
      allFrom("2026-07-25T12:10:00Z", "2026-07-25T15:00:00Z"),
      d("2026-07-25T15:00:00Z"),
    );
    expect(r.state).toBe("done");
  });

  it("Grenzfall: eine Minute zu früh abgelegt → aborted", () => {
    const r = evaluateTask(
      task(),
      reqs,
      allFrom("2026-07-25T12:10:00Z", "2026-07-25T14:59:00Z"),
      d("2026-07-25T15:05:00Z"),
    );
    expect(r.state).toBe("aborted");
  });
});

describe("REGRESSION: frühere Trage-Historie darf die Aufgabe nicht kapern", () => {
  // Gefunden im Code-Review von E1: die Beginn-Suche nahm das FRÜHESTE je aufgezeichnete Intervall,
  // auch eines, das lange vor der Aufgabe endete. Trug der Sub dieselben Geräte zufällig morgens
  // schon einmal, galt die Aufgabe ab Minute 1 als abgebrochen — ein Vergehen für tadelloses
  // Verhalten, und zwar bei JEDEM Nutzer mit Vorgeschichte.
  const reqs = [KNEBEL];
  /** Derselbe Knebel wurde bereits 08:00–09:00 getragen, lange vor der Aufgabe (erstellt 12:00). */
  const vorgeschichte = iv("2026-07-25T08:00:00Z", "2026-07-25T09:00:00Z");

  it("noch nichts angelegt → pending (nicht aborted)", () => {
    const r = evaluateTask(task(), reqs, [[vorgeschichte]], d("2026-07-25T12:05:00Z"));
    expect(r.state).toBe("pending");
  });

  it("korrekt ab 12:10 angelegt → running (nicht aborted)", () => {
    const r = evaluateTask(task(), reqs, [[vorgeschichte, iv("2026-07-25T12:10:00Z", "2026-07-25T13:00:00Z")]], d("2026-07-25T13:00:00Z"));
    expect(r.state).toBe("running");
    expect(r.startedAt).toEqual(d("2026-07-25T12:10:00Z"));
  });

  it("durchgehalten und gemeldet → done (nicht aborted)", () => {
    const r = evaluateTask(
      task({ completedAt: d("2026-07-25T15:01:00Z") }),
      reqs,
      [[vorgeschichte, iv("2026-07-25T12:10:00Z", "2026-07-25T15:05:00Z")]],
      d("2026-07-25T15:05:00Z"),
    );
    expect(r.state).toBe("done");
  });

  it("Auswertung exakt im Erstellungsmoment, nichts angelegt → pending (nicht running)", () => {
    const r = evaluateTask(task(), reqs, [[vorgeschichte]], d("2026-07-25T12:00:00Z"));
    expect(r.state).toBe("pending");
  });

  it("ein Intervall, das über die Erstellung hinausreicht, zählt weiterhin als Beginn", () => {
    // Gegenprobe: wer schon vorher trug UND durchgehend weiterträgt, hat rechtzeitig begonnen.
    const r = evaluateTask(task(), reqs, [[iv("2026-07-25T11:00:00Z", "2026-07-25T13:00:00Z")]], d("2026-07-25T13:00:00Z"));
    expect(r.state).toBe("running");
    expect(r.startedAt).toEqual(d("2026-07-25T12:00:00Z")); // ab Erstellung, nicht ab 11:00
  });
});

describe("Selbstmeldung braucht Zeitbezug", () => {
  it("zu spät gemeldet heilt eine verpasste Frist NICHT (ohne Bedingungen)", () => {
    const r = evaluateTask(
      task({ completedAt: d("2026-07-25T16:00:00Z") }), // Frist war 15:00
      [], [], d("2026-07-25T16:05:00Z"),
    );
    expect(r.state).toBe("missed");
  });

  it("Meldung VOR dem Beginn zählt nicht als Bestätigung", () => {
    const r = evaluateTask(
      task({ completedAt: d("2026-07-25T12:01:00Z") }), // gemeldet, bevor überhaupt etwas anlag
      [KNEBEL],
      [[iv("2026-07-25T12:10:00Z", "2026-07-25T15:05:00Z")]],
      d("2026-07-25T15:05:00Z"),
    );
    expect(r.state).toBe("running");
    expect(r.awaitingConfirmation).toBe(true);
  });
});

describe("evaluateTask — Aufgabe OHNE Bedingungen (reiner Freitext)", () => {
  it("offen, solange die Frist läuft", () => {
    expect(evaluateTask(task(), [], [], d("2026-07-25T13:00:00Z")).state).toBe("pending");
  });

  it("als erledigt gemeldet → done", () => {
    const r = evaluateTask(task({ completedAt: d("2026-07-25T13:00:00Z") }), [], [], d("2026-07-25T13:30:00Z"));
    expect(r.state).toBe("done");
  });

  it("Frist verstrichen ohne Meldung → missed", () => {
    expect(evaluateTask(task(), [], [], d("2026-07-25T15:30:00Z")).state).toBe("missed");
  });
});

describe("zurückgezogene Aufgabe", () => {
  it("ist weder offen noch ein Vergehen — egal was die Einträge sagen", () => {
    // Der Rückzug ist ein Entschluss der Keyholderin und darf dem Sub nie als Versäumnis angelastet
    // werden. Als eigener Zustand, damit kein Aufrufer das Filtern vergessen kann.
    const r = evaluateTask(
      task({ withdrawnAt: d("2026-07-25T13:00:00Z") }),
      [KG, HALSBAND, KNEBEL],
      [[], [], []],
      d("2026-07-25T16:00:00Z"), // Frist längst verstrichen, nie begonnen
    );
    expect(r.state).toBe("withdrawn");
    expect(isTaskOpen(r.state)).toBe(false);
    expect(isTaskOffense(r.state)).toBe(false);
  });
});

describe("Zustands-Prädikate", () => {
  it("offen sind pending/partial/running", () => {
    expect(["pending", "partial", "running"].every((s) => isTaskOpen(s as never))).toBe(true);
    expect(["done", "missed", "aborted"].some((s) => isTaskOpen(s as never))).toBe(false);
  });

  it("Vergehen sind genau missed und aborted", () => {
    expect(isTaskOffense("missed")).toBe(true);
    expect(isTaskOffense("aborted")).toBe(true);
    expect(isTaskOffense("running")).toBe(false);
    expect(isTaskOffense("done")).toBe(false);
  });
});

describe("REGRESSION: eine Unterbrechung INNERHALB der Kulanzfrist darf nicht härter zählen als Nichtstun", () => {
  const task = {
    createdAt: new Date("2026-07-25T12:00:00Z"),
    holdUntil: new Date("2026-07-25T15:00:00Z"),
    startGraceMin: 30,
    completedAt: null,
    withdrawnAt: null,
  };
  const req = [{ id: "r1", label: "Halsband" }];

  it("wer schon vorher trug, kurz ablegt und in der Frist wieder anlegt, läuft", () => {
    const r = evaluateTask(
      task,
      req,
      [[
        iv("2026-07-25T11:00:00Z", "2026-07-25T12:05:00Z"),
        iv("2026-07-25T12:20:00Z", "2026-07-25T14:00:00Z"),
      ]],
      new Date("2026-07-25T14:00:00Z"),
    );
    expect(r.state).toBe("running");
    expect(r.startedAt).toEqual(new Date("2026-07-25T12:20:00Z"));
  });

  it("… und steht damit nicht schlechter da als jemand, der bis 12:20 gar nichts trug", () => {
    const r = evaluateTask(
      task,
      req,
      [[iv("2026-07-25T12:20:00Z", "2026-07-25T14:00:00Z")]],
      new Date("2026-07-25T14:00:00Z"),
    );
    expect(r.state).toBe("running");
  });

  it("eine Lücke NACH der Kulanzfrist bleibt ein Abbruch — mit Beleg", () => {
    const r = evaluateTask(
      task,
      req,
      [[
        iv("2026-07-25T12:10:00Z", "2026-07-25T13:00:00Z"),
        iv("2026-07-25T13:30:00Z", "2026-07-25T14:00:00Z"),
      ]],
      new Date("2026-07-25T14:00:00Z"),
    );
    expect(r.state).toBe("aborted");
    expect(r.failedAt).toEqual(new Date("2026-07-25T13:00:00Z"));
  });
});
