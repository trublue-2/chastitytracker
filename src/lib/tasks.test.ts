import { describe, it, expect } from "vitest";
import {
  evaluateTask, intersectAll, coversContinuously, startDeadline, taskAnchor, minHoldMs, isTaskOpen, isTaskOffense,
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

  it("drei Bedingungen — der Schnitt beginsAt mit der letzten und endet mit der ersten", () => {
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

/** Die Zahl, die beide Seiten meinen: der Keyholder stellt „drei Stunden", verlangt aber nur
 *  zweieinhalb — die Kulanzfrist geht davon ab. Sie steht in der Vorschau des Formulars UND auf der
 *  Karte des Subs; driften die auseinander, ist es eine Zusage, die niemand einhält. */
describe("minHoldMs — was am Ende wirklich zu halten ist", () => {
  it("zieht die Kulanzfrist von der Gesamtspanne ab", () => {
    // Erstellt 12:00, Kulanz 30 min, Ende 15:00 → spätester Start 12:30, also 2,5 h zu halten.
    expect(minHoldMs(task())).toBe(2.5 * 3600_000);
  });

  it("ist ohne Kulanz die volle Spanne", () => {
    expect(minHoldMs({ ...task(), startGraceMin: 0 })).toBe(3 * 3600_000);
  });

  it("wird negativ, wo die Frist vor dem spätesten Start liegt — der Widerspruch bleibt sichtbar", () => {
    // Genau der Zustand, den `checkTaskFields` mit TASK_HOLD_UNTIL_TOO_SOON abweist. Auf 0 geklemmt
    // sähe er aus wie „nichts zu halten" statt wie „unmöglich".
    expect(minHoldMs({ ...task(), holdUntil: d("2026-07-25T12:10:00Z") })).toBeLessThan(0);
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

describe("holdRunning — läuft die Haltefrist gerade?", () => {
  /**
   * Die Anzeige hängt daran, ob sie die Selbstmeldung anbietet: solange gehalten wird, ist „erledigt"
   * eine Aussage über eine Stunde, die noch nicht stattgefunden hat. Deshalb steht die Tatsache hier
   * und nicht in der Karte — und deshalb braucht sie einen Test, der die Grenze wirklich überschreitet
   * statt sie zu stempeln.
   */
  const reqs = [KG, HALSBAND, KNEBEL];
  const all = (end: string): Interval[][] =>
    [0, 1, 2].map(() => [iv("2026-07-25T12:10:00Z", end)]);

  it("ist wahr, solange alle Bedingungen anliegen und 15:00 noch nicht erreicht ist", () => {
    const r = evaluateTask(task(), reqs, all("2026-07-25T14:59:00Z"), d("2026-07-25T14:59:00Z"));
    expect(r.state).toBe("running");
    expect(r.holdRunning).toBe(true);
    expect(r.awaitingConfirmation).toBe(false);
  });

  it("kippt mit dem Ablauf der Frist auf die Selbstmeldung — beides nie gleichzeitig", () => {
    const r = evaluateTask(task(), reqs, all("2026-07-25T15:05:00Z"), d("2026-07-25T15:05:00Z"));
    expect(r.holdRunning).toBe(false);
    expect(r.awaitingConfirmation).toBe(true);
  });

  it("bleibt falsch, wo noch gar nicht gehalten wird — eine fehlende Bedingung hält nichts", () => {
    const r = evaluateTask(task(), reqs, [
      [iv("2026-07-25T12:10:00Z", "2026-07-25T13:00:00Z")],
      [iv("2026-07-25T12:10:00Z", "2026-07-25T13:00:00Z")],
      [], // Knebel fehlt
    ], d("2026-07-25T13:00:00Z"));
    expect(r.holdRunning).toBe(false);
  });

  it("bleibt falsch bei einer Aufgabe OHNE Bedingungen — dort ist die Frist ein Termin", () => {
    // Der Unterschied, um den es geht: „staubsauge bis 15:00" darf sofort gemeldet werden.
    const r = evaluateTask(task(), [], [], d("2026-07-25T13:00:00Z"));
    expect(r.state).toBe("pending");
    expect(r.holdRunning).toBe(false);
  });

  it("bleibt falsch, nachdem eine Bedingung wegfiel — abgebrochen wird nicht mehr gehalten", () => {
    const r = evaluateTask(task(), reqs, [
      [iv("2026-07-25T12:10:00Z", "2026-07-25T14:30:00Z")],
      [iv("2026-07-25T12:10:00Z", "2026-07-25T14:30:00Z")],
      [iv("2026-07-25T12:10:00Z", "2026-07-25T14:00:00Z")],
    ], d("2026-07-25T14:30:00Z"));
    expect(r.state).toBe("aborted");
    expect(r.holdRunning).toBe(false);
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

/**
 * DER DAUER-MODUS — die Haltezeit läuft ab dem tatsächlichen Anlegen, nicht ab dem Stellen.
 *
 * Anlass ist ein realer Fall: „Halsband mindestens 30 Minuten" gestellt, 15 Minuten herausgekommen.
 * Klassisch ist das kein Fehler, sondern die Rechnung — die Kulanzfrist liegt INNERHALB der Spanne
 * und geht der Tragezeit ab. Wer eine Tragezeit meint, braucht deshalb den anderen Anker.
 *
 * Die Aufgaben hier sind bewusst mit derselben Zahl gestellt wie im Vorfall: Kulanz 15 Minuten,
 * Dauer 30 Minuten, spätestmögliches Ende also 12:45.
 */
describe("evaluateTask — Dauer-Modus (Haltezeit ab dem Anlegen)", () => {
  /** Erstellt 12:00 · 15 min Kulanz · 30 min zu halten ab dem Anlegen · spätestens fertig 12:45. */
  const dauerTask = (over: Partial<TaskLike> = {}): TaskLike => task({
    startGraceMin: 15,
    holdDurationMin: 30,
    holdUntil: d("2026-07-25T12:45:00Z"),
    ...over,
  });

  it("minHoldMs ist die Dauer selbst — die Kulanz geht ihr NICHT mehr ab", () => {
    expect(minHoldMs(dauerTask())).toBe(30 * 60_000);
  });

  it("DIESELBE Eingabe „30 Minuten“ ergibt in den beiden Modi verschiedene Zusagen", () => {
    // Klassisch heisst „30 Minuten" = Ende um 12:30. Davon geht die Kulanz ab: garantiert sind 15.
    // Genau diese Rechnung stand hinter dem Vorfall — gestellt 30, getragen 15.
    const klassisch = task({ startGraceMin: 15, holdUntil: d("2026-07-25T12:30:00Z") });
    expect(minHoldMs(klassisch)).toBe(15 * 60_000);
    // Im Dauer-Modus sind 30 Minuten 30 Minuten.
    expect(minHoldMs(dauerTask())).toBe(30 * 60_000);
  });

  it("DER VORFALL: wer die Kulanz ausreizt, trägt trotzdem die vollen 30 Minuten", () => {
    // Angelegt um 12:15 (letzter erlaubter Moment). Klassisch wäre um 12:45 Schluss — also nach
    // 30 Minuten Kulanz-plus-Rest, aber nur 15 Minuten Tragezeit ab dem Anlegen.
    const worn = [iv("2026-07-25T12:15:00Z", "2026-07-25T12:45:00Z")];

    // Um 12:44 — eine Minute vor dem klassischen Ende — läuft es noch.
    const kurzVor = evaluateTask(dauerTask(), [HALSBAND], [worn], d("2026-07-25T12:44:00Z"));
    expect(kurzVor.state).toBe("running");
    expect(kurzVor.holdRunning).toBe(true);
    // Das wirksame Ende ist 12:15 + 30 min = 12:45, nicht das gestellte Ende.
    expect(kurzVor.holdUntil).toEqual(d("2026-07-25T12:45:00Z"));
    expect(kurzVor.startedAt).toEqual(d("2026-07-25T12:15:00Z"));
  });

  it("wer SOFORT anlegt, ist auch nach 30 Minuten fertig — nicht erst zum spätestmöglichen Ende", () => {
    const worn = [iv("2026-07-25T12:00:00Z", "2026-07-25T12:30:00Z")];
    const r = evaluateTask(
      { ...dauerTask(), completedAt: d("2026-07-25T12:30:00Z") },
      [HALSBAND], [worn], d("2026-07-25T12:31:00Z"),
    );
    expect(r.state).toBe("done");
    // 12:00 + 30 min — eine Viertelstunde vor dem gespeicherten `holdUntil` (12:45).
    expect(r.holdUntil).toEqual(d("2026-07-25T12:30:00Z"));
  });

  it("bei MEHREREN Geräten läuft die Uhr erst, wenn das letzte anliegt", () => {
    const halsband = [iv("2026-07-25T12:05:00Z", "2026-07-25T12:50:00Z")];
    const knebel = [iv("2026-07-25T12:10:00Z", "2026-07-25T12:50:00Z")];
    const r = evaluateTask(dauerTask(), [HALSBAND, KNEBEL], [halsband, knebel], d("2026-07-25T12:41:00Z"));

    // Beginn ist der Knebel (12:10), nicht das Halsband (12:05) — also Ende 12:40.
    expect(r.startedAt).toEqual(d("2026-07-25T12:10:00Z"));
    expect(r.holdUntil).toEqual(d("2026-07-25T12:40:00Z"));
    expect(r.state).toBe("running");
    expect(r.awaitingConfirmation).toBe(true); // gehalten, es fehlt nur die Selbstmeldung
  });

  it("zu früh abgelegt ist ein Abbruch — gemessen an der Dauer, nicht am gestellten Ende", () => {
    // Angelegt 12:05, abgelegt 12:30 → 25 von 30 Minuten. Klassisch (Ende 12:45) wäre das ebenfalls
    // ein Abbruch, aber aus einem anderen Grund; hier zählt allein die eigene Dauer.
    const worn = [iv("2026-07-25T12:05:00Z", "2026-07-25T12:30:00Z")];
    const r = evaluateTask(dauerTask(), [HALSBAND], [worn], d("2026-07-25T12:36:00Z"));
    expect(r.state).toBe("aborted");
    expect(r.failedAt).toEqual(d("2026-07-25T12:30:00Z"));
    expect(r.failedRequirement).toEqual(HALSBAND);
  });

  it("die Beginn-Suche nimmt den Kandidaten, der SEINE Dauer übersteht", () => {
    // Zwei Anläufe innerhalb der Kulanz: der erste (12:00–12:08) hält seine 30 Minuten nicht durch,
    // der zweite (12:12–12:42) schon. Ohne die kandidatenweise Rechnung wäre die Aufgabe an ihrem
    // ersten, längst korrigierten Anlauf gescheitert.
    const worn = [iv("2026-07-25T12:00:00Z", "2026-07-25T12:08:00Z"), iv("2026-07-25T12:12:00Z", "2026-07-25T12:42:00Z")];
    const r = evaluateTask(dauerTask(), [HALSBAND], [worn], d("2026-07-25T12:43:00Z"));
    expect(r.startedAt).toEqual(d("2026-07-25T12:12:00Z"));
    expect(r.holdUntil).toEqual(d("2026-07-25T12:42:00Z"));
    expect(r.state).not.toBe("aborted");
  });

  it("nach Ablauf der Startfrist gar nicht begonnen bleibt versäumt — die Dauer ändert daran nichts", () => {
    const worn = [iv("2026-07-25T12:20:00Z", "2026-07-25T13:00:00Z")]; // Kulanz endete 12:15
    const r = evaluateTask(dauerTask(), [HALSBAND], [worn], d("2026-07-25T12:50:00Z"));
    expect(r.state).toBe("missed");
    expect(r.startedAt).toBeNull();
    // Ohne Beginn bleibt das spätestmögliche Ende stehen — es ist die einzige wahre Aussage.
    expect(r.holdUntil).toEqual(d("2026-07-25T12:45:00Z"));
  });

  it("das wirksame Ende liegt NIE nach dem gespeicherten — darauf baut die Vorauswahl des Pollers", () => {
    // Spätester erlaubter Beginn ist die Kulanzfrist; von dort plus Dauer ist genau `holdUntil`.
    const worn = [iv("2026-07-25T12:15:00Z", "2026-07-25T13:30:00Z")];
    const r = evaluateTask(dauerTask(), [HALSBAND], [worn], d("2026-07-25T13:00:00Z"));
    expect(r.holdUntil.getTime()).toBeLessThanOrEqual(dauerTask().holdUntil.getTime());
  });

  /**
   * NIMMT DIE AUFGABE NOCH EIN FOTO AN? — die Anzeige-Seite der Einreiche-Schranke.
   *
   * Seit die eigene Frist eines Nachweises weich ist (verspätet nachreichen ist erlaubt, die
   * Keyholderin entscheidet), ist das Ende der Aufgabe die einzige harte Grenze. Sie muss hier
   * dieselbe sein wie im Dienst — sonst zeigt die Karte einen Aufnahme-Weg, den das Formular gleich
   * wieder verwehrt.
   */
  describe("proofSubmitOpen", () => {
    it("Dauer-Modus: die Grenze ist das WIRKSAME Ende, nicht die Spalte", () => {
      // Angelegt 12:00, 30 Minuten Dauer → wirksames Ende 12:30, während die Spalte 12:45 sagt.
      const worn = [iv("2026-07-25T12:00:00Z", "2026-07-25T12:30:00Z")];
      const offen = evaluateTask(dauerTask(), [HALSBAND], [worn], d("2026-07-25T12:29:00Z"));
      expect(offen.proofSubmitOpen).toBe(true);

      // 12:40 liegt VOR der Spalte und trotzdem nach der Aufgabe: gegen `holdUntil` gemessen nähme
      // die Karte hier noch Fotos für etwas an, das seit zehn Minuten durch ist.
      const zu = evaluateTask(dauerTask(), [HALSBAND], [worn], d("2026-07-25T12:40:00Z"));
      expect(zu.holdUntil).toEqual(d("2026-07-25T12:30:00Z"));
      expect(zu.proofSubmitOpen).toBe(false);
    });

    it("ohne Beginn gilt die Spalte — sie IST dann das wirksame Ende", () => {
      const r = evaluateTask(dauerTask(), [HALSBAND], [[]], d("2026-07-25T12:44:00Z"));
      expect(r.startedAt).toBeNull();
      expect(r.proofSubmitOpen).toBe(true);
      expect(evaluateTask(dauerTask(), [HALSBAND], [[]], d("2026-07-25T12:46:00Z")).proofSubmitOpen).toBe(false);
    });

    it("klassischer Modus: das feste Ende, einschliesslich", () => {
      const klassisch = task({ holdUntil: d("2026-07-25T12:30:00Z") });
      expect(evaluateTask(klassisch, [], [], d("2026-07-25T12:30:00Z")).proofSubmitOpen).toBe(true);
      expect(evaluateTask(klassisch, [], [], d("2026-07-25T12:30:01Z")).proofSubmitOpen).toBe(false);
    });

    /** Der Rückzug wiegt schwerer als jede Frist — dieselbe Rangfolge wie im Dienst
     *  (`TASK_NOT_EDITABLE` vor `TASK_PROOF_TOO_LATE`). */
    it("eine zurückgezogene Aufgabe nimmt nichts mehr an", () => {
      const r = evaluateTask(task({ withdrawnAt: d("2026-07-25T12:10:00Z") }), [], [], d("2026-07-25T12:15:00Z"));
      expect(r.state).toBe("withdrawn");
      expect(r.proofSubmitOpen).toBe(false);
    });
  });
});

/**
 * B1 — TERMINIERTE Aufgabe (`wirksamAb`).
 *
 * Fälle 2, 5, 6 und 7 der elf Anweisungen hängen daran: „um 17:00 …", „morgen bei der Arbeit …",
 * „wenn ich heimkomme …", „diese Woche jede Nacht …". Der Kern-Eingriff ist eine Verschiebung des
 * Nullpunkts — genau das prüfen die Fälle hier, an allen drei Stellen, an denen er gelesen wird.
 */
describe("evaluateTask — terminierte Aufgabe (wirksamAb)", () => {
  /** Gestellt am Vorabend (12:00), wirksam erst um 18:00, 30 min Kulanz, halten bis 20:00. */
  const terminiert = (over: Partial<TaskLike> = {}): TaskLike => task({
    wirksamAb: d("2026-07-25T18:00:00Z"),
    holdUntil: d("2026-07-25T20:00:00Z"),
    ...over,
  });

  it("taskAnchor und startDeadline ankern auf wirksamAb, nicht auf createdAt", () => {
    expect(taskAnchor(terminiert())).toEqual(d("2026-07-25T18:00:00Z"));
    expect(startDeadline(terminiert())).toEqual(d("2026-07-25T18:30:00Z"));
    // Und die Mindest-Haltezeit wächst entsprechend mit: 18:30 bis 20:00 statt 12:30 bis 20:00.
    expect(minHoldMs(terminiert())).toBe(90 * 60_000);
  });

  it("ein Trage-Intervall VOR dem Wirksamwerden zieht den Beginn nicht mehr vor", () => {
    // Der Sub trug das Halsband ohnehin schon ab 10:00 und legte es um 19:00 ab. Der Beginn ist
    // 18:00 (das Wirksamwerden), nicht 12:00 — der Abbruch datiert damit auf 19:00, und die Aufgabe
    // hat 60 von 120 Minuten gehalten statt scheinbar sieben Stunden.
    const worn = [iv("2026-07-25T10:00:00Z", "2026-07-25T19:00:00Z")];
    const r = evaluateTask(terminiert(), [HALSBAND], [worn], d("2026-07-25T19:30:00Z"));
    expect(r.startedAt).toEqual(d("2026-07-25T18:00:00Z"));
    expect(r.state).toBe("aborted");
    expect(r.failedAt).toEqual(d("2026-07-25T19:00:00Z"));
  });

  it("ein Intervall, das VOR dem Wirksamwerden endet, ist gar kein Kandidat", () => {
    const worn = [iv("2026-07-25T10:00:00Z", "2026-07-25T17:00:00Z")];
    const r = evaluateTask(terminiert(), [HALSBAND], [worn], d("2026-07-25T18:45:00Z"));
    // Kulanz lief bis 18:30, angelegt wurde nie — versäumt, ohne Beginn.
    expect(r.startedAt).toBeNull();
    expect(r.state).toBe("missed");
  });

  it("rechtzeitig nach dem Wirksamwerden angelegt und durchgehalten ist erfüllt", () => {
    const worn = [iv("2026-07-25T18:10:00Z", "2026-07-25T20:30:00Z")];
    const r = evaluateTask(
      { ...terminiert(), completedAt: d("2026-07-25T20:05:00Z") },
      [HALSBAND], [worn], d("2026-07-25T20:10:00Z"),
    );
    expect(r.startedAt).toEqual(d("2026-07-25T18:10:00Z"));
    expect(r.state).toBe("done");
  });

  it("BESTANDSAUFGABEN: ohne wirksamAb ändert sich kein einziges Urteil", () => {
    // Dieselbe Aufgabe dreimal — Feld fehlend, `null` und `undefined` müssen exakt dasselbe ergeben
    // wie vor der Terminierung: der Nullpunkt bleibt `createdAt`.
    const worn = [iv("2026-07-25T12:20:00Z", "2026-07-25T15:00:00Z")];
    const at = d("2026-07-25T15:01:00Z");
    const ohne = evaluateTask(task(), [HALSBAND], [worn], at);
    expect(evaluateTask(task({ wirksamAb: null }), [HALSBAND], [worn], at)).toEqual(ohne);
    expect(evaluateTask(task({ wirksamAb: undefined }), [HALSBAND], [worn], at)).toEqual(ohne);
    expect(ohne.startedAt).toEqual(d("2026-07-25T12:20:00Z"));
    expect(taskAnchor(task())).toEqual(d("2026-07-25T12:00:00Z"));
  });

  it("auch terminiert bleibt das gespeicherte holdUntil die obere Schranke — die Vorauswahl des Pollers hängt daran", () => {
    // Dauer-Modus UND terminiert: `holdUntil` wird als wirksamAb + Kulanz + Dauer geschrieben
    // (`checkTask`), hier also 18:00 + 30 min + 45 min = 19:15. Wer die Kulanz voll ausreizt, endet
    // exakt dort; wer früher anlegt, früher.
    const dauer = terminiert({ startGraceMin: 30, holdDurationMin: 45, holdUntil: d("2026-07-25T19:15:00Z") });
    const spaet = evaluateTask(dauer, [HALSBAND], [[iv("2026-07-25T18:30:00Z", "2026-07-25T20:00:00Z")]], d("2026-07-25T19:20:00Z"));
    expect(spaet.holdUntil).toEqual(d("2026-07-25T19:15:00Z"));
    expect(spaet.holdUntil.getTime()).toBeLessThanOrEqual(dauer.holdUntil.getTime());

    const frueh = evaluateTask(dauer, [HALSBAND], [[iv("2026-07-25T18:00:00Z", "2026-07-25T20:00:00Z")]], d("2026-07-25T19:20:00Z"));
    expect(frueh.holdUntil).toEqual(d("2026-07-25T18:45:00Z"));
    expect(frueh.holdUntil.getTime()).toBeLessThanOrEqual(dauer.holdUntil.getTime());
  });
});
