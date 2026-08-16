import { describe, it, expect } from "vitest";
import {
  evaluateProofs, evaluateTask, firstOutOfOrderProof, isTaskOffense, isTaskOpen, isTaskResultFinal,
  needsKeyholderReview, proofDeadline, type ProofLike, type TaskLike,
} from "./tasks";

/**
 * Die Nachweis-Achse (Issue #39): geforderte Fotos mit vorgegebener Reihenfolge.
 *
 * Bewusst getrennt von den Bedingungen geprüft — ein Nachweis ist ein EREIGNIS mit einem Zeitpunkt,
 * keine Bedingung mit einem Intervall. Die untere Hälfte prüft dann das Zusammenspiel beider Achsen,
 * weil dort die eigentliche Entscheidung liegt: welches Urteil schlägt welches.
 */

const d = (s: string) => new Date(s);
const HOLD_UNTIL = d("2026-07-25T18:00:00Z");
/** Der Nullpunkt der Fixture-Aufgabe: gestellt um 12:00, Frist 18:00 — sechs Stunden Spanne, in die
 *  eine eigene Nachweis-Fälligkeit hineinpasst. */
const CREATED_AT = d("2026-07-25T12:00:00Z");
/** Eine Aufgabe, wie die Nachweis-Achse sie sieht — OHNE `proofOrderMatters` und OHNE `wirksamAb`,
 *  also mit beiden Vorgaben „die Reihenfolge zählt" und „sofort wirksam". Genau die Form jeder
 *  Bestandszeile vor B8/B1. `withdrawnAt` steht ausdrücklich auf `null` — diese Fixture ist die
 *  LAUFENDE Aufgabe; die Rückzug-Fälle setzen das Feld je Test. */
const task: Pick<TaskLike, "holdUntil" | "proofOrderMatters" | "createdAt" | "wirksamAb" | "withdrawnAt"> = {
  holdUntil: HOLD_UNTIL,
  createdAt: CREATED_AT,
  withdrawnAt: null,
};

/** Ein eingereichter, per Code geprüfter Nachweis — der maschinell entscheidbare Normalfall. */
function proof(over: Partial<ProofLike> = {}): ProofLike {
  return {
    id: "p1",
    sortOrder: 0,
    requireCode: true,
    dueOffsetMin: null,
    submittedAt: d("2026-07-25T13:00:00Z"),
    imageExifTime: d("2026-07-25T12:00:00Z"),
    verifikationStatus: "ai",
    verifikationReason: null,
    reviewAccepted: null,
    ...over,
  };
}

/** Ein Nachweis mit fester Aufnahmezeit und Position — die Reihenfolge-Fälle brauchen nichts sonst. */
const at = (iso: string, sortOrder: number, id: string) => proof({ id, sortOrder, imageExifTime: d(iso) });

/** Ein Nachweis mit EIGENER Fälligkeit „nach 60 Minuten": Nullpunkt 12:00, also fällig um 13:00 —
 *  gut vier Stunden vor dem Ende der Fixture-Aufgabe. Auf Modul-Ebene, weil zwei Blöcke ihn brauchen
 *  (B12 und die späte Annahme); je Block neu gebaut stünde die 60-Minuten-Konvention zweimal da und
 *  eine Änderung an ihr liesse die andere Fassung still gegen eine veraltete Frist prüfen. */
const inAnHour = (over: Partial<ProofLike> = {}) => proof({ dueOffsetMin: 60, ...over });

/** Eine ganze Aufgabe, wie `evaluateTask` sie sieht — sofort wirksam, um 12:00 gestellt. Jeder Test
 *  überschreibt nur, was er variiert; ohne Fixture stünde derselbe Fünfzeiler in jedem zweiten Fall
 *  und der Unterschied ginge zwischen den gleichen Feldern unter. */
const taskWith = (over: Partial<TaskLike> = {}): TaskLike => ({
  createdAt: CREATED_AT,
  holdUntil: HOLD_UNTIL,
  startGraceMin: 30,
  completedAt: null,
  withdrawnAt: null,
  ...over,
});

/**
 * DER GANZTAGS-FALL, den „drei Fotos über den Tag" braucht: eine bis 22:00 laufende Aufgabe, eine
 * Trage-Bedingung, die durchgehend gilt, und der Nachweis mit Mittags-Frist (300 min ab 12:00 = 17:00).
 *
 * Auf Modul-Ebene aus demselben Grund wie {@link inAnHour} (siehe dort): die drei standen bis zum
 * 16.08.2026 in vier Testfällen wortgleich nebeneinander, und die 17:00-Konvention damit viermal.
 * Wer sie an einer Stelle verschiebt, prüft an den anderen drei still gegen eine veraltete Frist.
 */
const ENDE_22 = d("2026-07-25T22:00:00Z");
const SLIP_REQ = [{ id: "r1", label: "Slip" }];
/** Durchgehend getragen, von vor der Aufgabe bis nach ihrem Ende — die Bedingung fällt nie weg. */
const GETRAGEN = [[{ start: d("2026-07-25T11:00:00Z"), end: d("2026-07-25T23:00:00Z") }]];
/** Das Mittagsfoto, fällig um 17:00 — nie eingereicht. */
const ohneNachweis = (over: Partial<ProofLike> = {}) =>
  proof({ id: "mittag", dueOffsetMin: 300, submittedAt: null, imageExifTime: null, ...over });
/** Dasselbe Foto, aber erst um 18:00 nachgereicht: für das Urteil zählt es nicht (ungesichtet). */
const spaetNachgereicht = () => ohneNachweis({ submittedAt: d("2026-07-25T18:00:00Z") });
/** RECHTZEITIG da, aber nicht maschinell entscheidbar (kein Code, keine Aufnahmezeit) — der Fall,
 *  in dem die Keyholderin am Zug ist. */
const zurSichtung = () =>
  ohneNachweis({ requireCode: false, verifikationStatus: null, submittedAt: d("2026-07-25T16:00:00Z") });

describe("evaluateProofs — ohne Nachweise", () => {
  it("keine Nachweise gefordert: die Achse spielt keine Rolle", () => {
    expect(evaluateProofs([], task, d("2026-07-25T19:00:00Z"))).toBe("none");
  });
});

describe("evaluateProofs — Vollständigkeit und Frist", () => {
  it("noch nicht eingereicht, Frist läuft → offen", () => {
    const p = [proof({ submittedAt: null, imageExifTime: null })];
    expect(evaluateProofs(p, task, d("2026-07-25T14:00:00Z"))).toBe("pending");
  });

  it("nach Fristablauf nicht eingereicht → Fehlschlag", () => {
    const p = [proof({ submittedAt: null, imageExifTime: null })];
    expect(evaluateProofs(p, task, d("2026-07-25T19:00:00Z"))).toBe("failed");
  });

  /** Sonst wäre die Frist bedeutungslos: man könnte beliebig lange nachliefern. */
  it("NACH der Frist eingereicht zählt nicht mehr", () => {
    const p = [proof({ submittedAt: d("2026-07-25T18:30:00Z") })];
    expect(evaluateProofs(p, task, d("2026-07-25T19:00:00Z"))).toBe("failed");
  });

  it("genau auf der Frist eingereicht zählt noch", () => {
    const p = [proof({ submittedAt: HOLD_UNTIL })];
    expect(evaluateProofs(p, task, d("2026-07-25T19:00:00Z"))).toBe("complete");
  });

  it("einer von zweien fehlt nach Fristablauf → Fehlschlag", () => {
    const p = [proof({ id: "a", sortOrder: 0 }), proof({ id: "b", sortOrder: 1, submittedAt: null, imageExifTime: null })];
    expect(evaluateProofs(p, task, d("2026-07-25T19:00:00Z"))).toBe("failed");
  });
});

describe("evaluateProofs — Reihenfolge", () => {
  it("Aufnahmezeiten in der geforderten Reihenfolge → erfüllt", () => {
    const p = [
      at("2026-07-25T12:00:00Z", 0, "verschluss"),
      at("2026-07-25T13:00:00Z", 1, "plug"),
      at("2026-07-25T15:00:00Z", 2, "rechnungen"),
    ];
    expect(evaluateProofs(p, task, d("2026-07-25T19:00:00Z"))).toBe("complete");
  });

  it("vertauschte Aufnahmezeiten → Fehlschlag", () => {
    const p = [
      at("2026-07-25T13:00:00Z", 0, "verschluss"),
      at("2026-07-25T12:00:00Z", 1, "plug"), // früher als der Vorgänger
    ];
    expect(evaluateProofs(p, task, d("2026-07-25T19:00:00Z"))).toBe("failed");
  });

  it("gleiche Aufnahmezeit reicht nicht — die Reihenfolge muss belegbar sein", () => {
    const p = [at("2026-07-25T12:00:00Z", 0, "a"), at("2026-07-25T12:00:00Z", 1, "b")];
    expect(evaluateProofs(p, task, d("2026-07-25T19:00:00Z"))).toBe("failed");
  });

  it("die Eingabe darf unsortiert kommen — `sortOrder` entscheidet, nicht die Array-Position", () => {
    const p = [at("2026-07-25T13:00:00Z", 1, "zweiter"), at("2026-07-25T12:00:00Z", 0, "erster")];
    expect(evaluateProofs(p, task, d("2026-07-25T19:00:00Z"))).toBe("complete");
  });

  /** Ohne Aufnahmezeit ist die Reihenfolge nicht belegbar — dann urteilt der Mensch, statt dass wir raten. */
  it("fehlende Aufnahmezeit → Sichtung statt Fehlschlag", () => {
    const p = [proof({ imageExifTime: null })];
    expect(evaluateProofs(p, task, d("2026-07-25T19:00:00Z"))).toBe("needsReview");
  });

  /**
   * REGRESSION: die fehlende Aufnahmezeit ist NUR deshalb ein Fall für die Sichtung, weil sich ohne
   * sie die Reihenfolge nicht belegen lässt. Hat die Keyholderin gesichtet und angenommen, ist der
   * Grund verbraucht — sonst käme die Aufgabe nach jeder Annahme WIEDER zur Sichtung, würde nie
   * `done`, meldete kein Ergebnis und liesse eine Strafaufgabe für immer im Strafbuch stehen. Der
   * einzige Ausweg wäre „ablehnen": ein Versäumnis für ein Foto, das der Mensch in Ordnung fand.
   */
  it("fehlende Aufnahmezeit, aber angenommen → die Sichtung ist verbraucht, erledigt", () => {
    const p = [proof({ imageExifTime: null, reviewAccepted: true })];
    expect(evaluateProofs(p, task, d("2026-07-25T19:00:00Z"))).toBe("complete");
  });

  it("fehlende Aufnahmezeit, angenommen — die übrigen in Reihenfolge → erledigt", () => {
    const p = [
      at("2026-07-25T12:00:00Z", 0, "verschluss"),
      proof({ id: "plug", sortOrder: 1, imageExifTime: null, reviewAccepted: true }),
      at("2026-07-25T14:00:00Z", 2, "rechnungen"),
    ];
    expect(evaluateProofs(p, task, d("2026-07-25T19:00:00Z"))).toBe("complete");
  });

  /** Der angenommene Nachweis ohne Zeit darf die Prüfung der ÜBRIGEN nicht aushebeln: die Rechnungen
   *  vor dem Verschluss sind ein Bruch, egal was dazwischen steht. */
  it("fehlende Aufnahmezeit, angenommen — die übrigen vertauscht → Fehlschlag", () => {
    const p = [
      at("2026-07-25T12:00:00Z", 0, "verschluss"),
      proof({ id: "plug", sortOrder: 1, imageExifTime: null, reviewAccepted: true }),
      at("2026-07-25T11:00:00Z", 2, "rechnungen"),
    ];
    expect(evaluateProofs(p, task, d("2026-07-25T19:00:00Z"))).toBe("failed");
  });

  /** Die Sichtung darf keine Frage sein, deren Antwort nicht zählt: steht der Bruch unter den belegten
   *  Zeiten schon fest, ist die Aufgabe versäumt — egal, wie das zeitlose Foto beurteilt würde. */
  it("fehlende Aufnahmezeit, UNGESICHTET — die übrigen vertauscht → Fehlschlag, nicht Sichtung", () => {
    const p = [
      at("2026-07-25T12:00:00Z", 0, "verschluss"),
      proof({ id: "plug", sortOrder: 1, imageExifTime: null }),
      at("2026-07-25T11:00:00Z", 2, "rechnungen"),
    ];
    expect(evaluateProofs(p, task, d("2026-07-25T19:00:00Z"))).toBe("failed");
  });

  it("fehlende Aufnahmezeit, angenommen — ein anderer noch ungesichtet → weiter Sichtung", () => {
    const p = [
      proof({ id: "a", sortOrder: 0, imageExifTime: null, reviewAccepted: true }),
      proof({ id: "b", sortOrder: 1, imageExifTime: null }),
    ];
    expect(evaluateProofs(p, task, d("2026-07-25T19:00:00Z"))).toBe("needsReview");
  });
});

/**
 * B8 — die Reihenfolge ist abschaltbar (`Task.proofOrderMatters`).
 *
 * Leitfall ist Anweisung 3 aus `docs/aufgaben-abdeckung.md`: „Einkaufen in pinken Leggings, ein
 * Selfie in der Gemüseabteilung, eines in der Blumenabteilung, um 19:00 zuhause." Zwei Nachweise,
 * keine Bedingungen — und die Reihenfolge der beiden Abteilungen ist gleichgültig. Erzwungen erzeugte
 * sie ein Versäumnis für etwas, das nie verlangt war.
 */
describe("Nachweis-Reihenfolge abschaltbar (Fall 3: Gemüse- und Blumenabteilung)", () => {
  /** Blumen zuerst, Gemüse danach — gegen die Liste, aber genau so gemeint gewesen. */
  const swapped = [at("2026-07-25T13:00:00Z", 0, "gemuese"), at("2026-07-25T12:00:00Z", 1, "blumen")];
  const orderOff = { ...task, proofOrderMatters: false };
  const after = d("2026-07-25T19:00:00Z");

  it("abgeschaltet: vertauschte Aufnahmezeiten sind kein Fehlschlag", () => {
    expect(evaluateProofs(swapped, orderOff, after)).toBe("complete");
  });

  /** RÜCKWÄRTSKOMPATIBILITÄT: eine Bestandsaufgabe kennt das Feld nicht — sie muss weiter genau so
   *  urteilen wie vorher. `null`/fehlend heisst „wie bisher", nur das ausdrückliche `false` löst. */
  it("ohne das Feld urteilt die Aufgabe unverändert wie bisher", () => {
    expect(evaluateProofs(swapped, task, after)).toBe("failed");
  });

  it("ausdrücklich eingeschaltet ist die Vorgabe — der Fehlschlag bleibt", () => {
    expect(evaluateProofs(swapped, { ...task, proofOrderMatters: true }, after)).toBe("failed");
  });

  /** Die fehlende Aufnahmezeit hing AN der Reihenfolge: ohne Reihenfolge gibt es nichts zu belegen,
   *  also auch keinen Grund, die Keyholderin zu holen. */
  it("abgeschaltet: ein Foto ohne Aufnahmezeit verlangt keine Sichtung mehr", () => {
    expect(evaluateProofs([proof({ imageExifTime: null })], orderOff, after)).toBe("complete");
  });

  it("abgeschaltet ändert NICHTS an der Frist — nachgeliefert zählt weiterhin nicht", () => {
    const late = [proof({ submittedAt: d("2026-07-25T18:30:00Z") })];
    expect(evaluateProofs(late, orderOff, after)).toBe("failed");
  });

  it("abgeschaltet ändert NICHTS an der Sichtungspflicht ohne Code", () => {
    const p = [proof({ requireCode: false, verifikationStatus: null, verifikationReason: null })];
    expect(evaluateProofs(p, orderOff, after)).toBe("needsReview");
  });

  it("abgeschaltet ändert NICHTS an einem abgelehnten Nachweis", () => {
    expect(evaluateProofs([proof({ reviewAccepted: false })], orderOff, after)).toBe("failed");
  });

  /** Die Anzeige liest dieselbe Regel: ohne Reihenfolge darf keine Zeile „ausserhalb der
   *  Reihenfolge" zeigen, sonst stünde ein Vorwurf über einer erfüllten Aufgabe. */
  it("abgeschaltet: die Karte findet keinen Reihenfolge-Bruch mehr", () => {
    expect(firstOutOfOrderProof(swapped, orderOff)).toBeNull();
    expect(firstOutOfOrderProof(swapped, task)?.id).toBe("blumen");
  });

  /** Fall 3 als Ganzes: eine Aufgabe OHNE Bedingungen, zwei Selfies in beliebiger Folge, um 19:00
   *  gemeldet. Vorher ein Versäumnis, jetzt erfüllt. */
  it("die ganze Aufgabe: zwei Selfies in beliebiger Folge, gemeldet → erfüllt", () => {
    const t = {
      createdAt: d("2026-07-25T12:00:00Z"), holdUntil: HOLD_UNTIL, startGraceMin: 30,
      completedAt: d("2026-07-25T17:00:00Z"), withdrawnAt: null, proofOrderMatters: false,
    };
    expect(evaluateTask(t, [], [], after, swapped).state).toBe("done");
    // Gegenprobe mit der Vorgabe: dieselbe Aufgabe wäre versäumt.
    expect(evaluateTask({ ...t, proofOrderMatters: true }, [], [], after, swapped).state).toBe("missed");
  });

  /**
   * DERSELBE Nachweis-Satz, aber an einer Aufgabe MIT Bedingung — der zweite, getrennte Weg durch
   * `evaluateTask`: dort wird die Nachweis-Achse erst NACH der Bedingungs-Achse und gegen das
   * WIRKSAME Ende gefragt, mit einem eigens gebauten Argument. Ohne diesen Fall bliebe genau die
   * Stelle ungeprüft, an der der Schalter auf dem Weg zur Auswertung verlorengehen kann — der
   * Compiler fängt es nicht, weil das Feld optional ist.
   */
  it("auch mit Bedingung erreicht der Schalter die Nachweis-Achse", () => {
    const t = {
      createdAt: d("2026-07-25T12:00:00Z"), holdUntil: HOLD_UNTIL, startGraceMin: 30,
      completedAt: d("2026-07-25T17:00:00Z"), withdrawnAt: null, proofOrderMatters: false,
    };
    const REQ = [{ id: "r1", label: "Knebel" }];
    // Durchgehend getragen, von vor der Aufgabe bis nach der Frist.
    const held = [[{ start: d("2026-07-25T11:00:00Z"), end: d("2026-07-25T20:00:00Z") }]];
    expect(evaluateTask(t, REQ, held, after, swapped).state).toBe("done");
    expect(evaluateTask({ ...t, proofOrderMatters: true }, REQ, held, after, swapped).state).toBe("missed");
  });
});

/**
 * B12 — jeder Nachweis kann eine EIGENE Fälligkeit haben (`TaskProof.dueOffsetMin`, Minuten ab dem
 * Nullpunkt der Aufgabe).
 *
 * Leitfall ist Anweisung 5 aus `docs/aufgaben-abdeckung.md`: „Morgen bei der Arbeit trägst du den
 * pinken Slip, und du schickst mir dreimal am Tag ein Foto." Bisher brauchte das drei terminierte
 * Kontrollen neben der Aufgabe; mit eigener Fälligkeit trägt die Aufgabe die drei Zeitpunkte selbst.
 *
 * Die zweite Zeitachse: vorher war das Ende der Aufgabe der EINE Schnitt für alle Nachweise, jetzt
 * ist es nur noch die obere Schranke.
 */
describe("Nachweis mit eigener Fälligkeit (Fall 5: dreimal am Tag ein Foto)", () => {
  it("vor der eigenen Frist eingereicht zählt", () => {
    const p = [inAnHour({ submittedAt: d("2026-07-25T12:45:00Z") })];
    expect(evaluateProofs(p, task, d("2026-07-25T13:30:00Z"))).toBe("complete");
  });

  it("genau auf der eigenen Frist eingereicht zählt noch — wie an der Frist der Aufgabe", () => {
    const p = [inAnHour({ submittedAt: d("2026-07-25T13:00:00Z") })];
    expect(evaluateProofs(p, task, d("2026-07-25T13:30:00Z"))).toBe("complete");
  });

  /** DER Punkt des Bausteins: der Nachweis ist einzeln bewertbar, statt bis zum Ende der Aufgabe
   *  offen zu bleiben. Um 13:30 steht das Urteil, obwohl die Aufgabe noch bis 18:00 läuft. */
  it("nach der eigenen Frist nicht eingereicht → Fehlschlag, lange vor dem Ende der Aufgabe", () => {
    const p = [inAnHour({ submittedAt: null, imageExifTime: null })];
    expect(evaluateProofs(p, task, d("2026-07-25T13:30:00Z"))).toBe("failed");
    // Zur Gegenprobe: derselbe Nachweis OHNE eigene Frist ist um 13:30 schlicht noch offen.
    expect(evaluateProofs([proof({ submittedAt: null, imageExifTime: null })], task, d("2026-07-25T13:30:00Z"))).toBe("pending");
  });

  it("nach der eigenen Frist NACHGELIEFERT zählt nicht mehr, obwohl die Aufgabe noch läuft", () => {
    const p = [inAnHour({ submittedAt: d("2026-07-25T14:00:00Z") })];
    expect(evaluateProofs(p, task, d("2026-07-25T14:30:00Z"))).toBe("failed");
  });

  it("solange JEDE offene Frist noch läuft, ist die Achse offen", () => {
    const p = [
      inAnHour({ id: "a", sortOrder: 0, submittedAt: d("2026-07-25T12:30:00Z"), imageExifTime: d("2026-07-25T12:20:00Z") }),
      proof({ id: "b", sortOrder: 1, dueOffsetMin: 300, submittedAt: null, imageExifTime: null }),
    ];
    expect(evaluateProofs(p, task, d("2026-07-25T13:30:00Z"))).toBe("pending");
  });

  /** Fall 5 als Ganzes: eine Aufgabe ohne Bedingungen, drei Fotos über den Tag. Verstreicht das
   *  erste, ist die Aufgabe versäumt — und zwar sofort, nicht erst am Abend. */
  it("die ganze Aufgabe: drei Fotos über den Tag", () => {
    const ganztags = { ...task, holdUntil: ENDE_22 };
    const foto = (id: string, sortOrder: number, dueOffsetMin: number, over: Partial<ProofLike> = {}) =>
      proof({ id, sortOrder, dueOffsetMin, submittedAt: null, imageExifTime: null, ...over });
    const drei = [
      foto("vormittag", 0, 120, { submittedAt: d("2026-07-25T13:30:00Z"), imageExifTime: d("2026-07-25T13:20:00Z") }),
      foto("mittag", 1, 300),
      foto("abend", 2, 540),
    ];
    // 14:30: das erste ist da, das zweite (17:00) hat noch Zeit.
    expect(evaluateProofs(drei, ganztags, d("2026-07-25T14:30:00Z"))).toBe("pending");
    // 17:30: das zweite ist durchgerutscht — versäumt, ohne auf 22:00 zu warten.
    expect(evaluateProofs(drei, ganztags, d("2026-07-25T17:30:00Z"))).toBe("failed");

    const t = taskWith({ holdUntil: ENDE_22 });
    const r = evaluateTask(t, [], [], d("2026-07-25T17:30:00Z"), drei);
    expect(r.state).toBe("missed");
    // Und der BELEG dazu: WELCHES Foto fehlt. Ohne ihn zeigte die Zeile weiter „offen" samt
    // Aufnahme-Link, während die Aufgabe darüber „versäumt" meldet.
    expect(r.overdueProofIds).toEqual(["mittag"]);
  });

  /**
   * DER FALL, DEN DAS PAPIER MEINT — und der andere Weg durch `evaluateTask`: eine Aufgabe MIT
   * Bedingung („trag den Slip, und schick mir dreimal am Tag ein Foto").
   *
   * Die Bedingungs-Achse steigt bei laufender Haltefrist mit `running` aus, VOR der Nachweis-Achse.
   * Ohne eigenen Zweig bliebe das verpasste Mittagsfoto deshalb bis zum Abend folgenlos, während die
   * Karte die Zeile schon als überfällig zeigt — zwei Auskünfte über dieselbe Aufgabe.
   */
  it("auch mit Bedingung entscheidet die verstrichene Nachweis-Frist sofort", () => {
    const t = taskWith({ holdUntil: ENDE_22 });
    const mittags = [ohneNachweis()];

    // 16:00: die Frist des Fotos (17:00) läuft noch — die Aufgabe läuft mit.
    const laufend = evaluateTask(t, SLIP_REQ, GETRAGEN, d("2026-07-25T16:00:00Z"), mittags);
    expect(laufend.state).toBe("running");
    expect(laufend.overdueProofIds).toEqual([]);

    // 17:30: das Foto ist durch, die Aufgabe ist entschieden — obwohl bis 22:00 gehalten wird.
    const spaet = evaluateTask(t, SLIP_REQ, GETRAGEN, d("2026-07-25T17:30:00Z"), mittags);
    expect(spaet.state).toBe("missed");
    expect(spaet.overdueProofIds).toEqual(["mittag"]);
    // Der Beleg der Bedingungs-Achse bleibt: er HAT begonnen und getragen.
    expect(spaet.startedAt).not.toBeNull();
    expect(isTaskOffense(spaet.state)).toBe(true);

    // Gegenprobe: derselbe Nachweis OHNE eigene Frist lässt die Aufgabe unverändert laufen.
    const ohneFrist = [ohneNachweis({ dueOffsetMin: null })];
    expect(evaluateTask(t, SLIP_REQ, GETRAGEN, d("2026-07-25T17:30:00Z"), ohneFrist).state).toBe("running");
  });

  /** Ein Abbruch der Bedingung ist der ältere Beleg und behält den Vorrang — sonst verlöre die
   *  Meldung, WELCHE Bedingung wann wegfiel. */
  it("ein Abbruch der Bedingung schlägt die verstrichene Nachweis-Frist", () => {
    const t = taskWith({ holdUntil: ENDE_22 });
    const abgelegt = [[{ start: d("2026-07-25T11:00:00Z"), end: d("2026-07-25T14:00:00Z") }]];
    const r = evaluateTask(t, SLIP_REQ, abgelegt, d("2026-07-25T17:30:00Z"), [ohneNachweis()]);
    expect(r.state).toBe("aborted");
    expect(r.failedRequirement?.label).toBe("Slip");
    // Der Nachweis-Beleg geht dabei nicht verloren — beides ist wahr.
    expect(r.overdueProofIds).toEqual(["mittag"]);
  });

  /** RÜCKWÄRTSKOMPATIBILITÄT: ohne eigene Fälligkeit ist die Frist unverändert das Ende der
   *  Aufgabe — Wort für Wort das alte `now < holdUntil ? "pending" : "failed"`. */
  it("ohne eigene Fälligkeit urteilt die Aufgabe unverändert wie bisher", () => {
    const offen = [proof({ submittedAt: null, imageExifTime: null })];
    expect(evaluateProofs(offen, task, d("2026-07-25T17:59:00Z"))).toBe("pending");
    expect(evaluateProofs(offen, task, d("2026-07-25T18:01:00Z"))).toBe("failed");
    // `null` und `undefined` (= Feld gar nicht gesetzt) müssen dasselbe ergeben — `proofDeadline`
    // prüft mit `== null` und darf zwischen den beiden Schreibweisen nicht unterscheiden.
    const ohneFeld = [proof({ dueOffsetMin: undefined, submittedAt: null, imageExifTime: null })];
    expect(evaluateProofs(ohneFeld, task, d("2026-07-25T17:59:00Z"))).toBe("pending");
    expect(evaluateProofs(ohneFeld, task, d("2026-07-25T18:01:00Z"))).toBe("failed");
    // Und kein überfälliger Nachweis, wo keine eigene Frist gestellt wurde.
    const t = taskWith();
    expect(evaluateTask(t, [], [], d("2026-07-25T19:00:00Z"), offen).overdueProofIds).toEqual([]);
  });

  /** Der NULLPUNKT ist `wirksamAb`, nicht das Stellen (B1). Sonst wäre die Frist einer am Vorabend
   *  für morgen früh gestellten Aufgabe längst verstrichen, bevor der Träger überhaupt davon weiss. */
  it("bei einer terminierten Aufgabe zählt die Frist ab dem Wirksamwerden", () => {
    // Am 24.07. um 20:00 gestellt, wirksam am 25.07. um 08:00, Ende 18:00. „Nach 60 Minuten" ist
    // damit 09:00 — nicht 21:00 des Vortages.
    const terminiert = {
      ...task,
      createdAt: d("2026-07-24T20:00:00Z"),
      wirksamAb: d("2026-07-25T08:00:00Z"),
    };
    const p = [inAnHour({ submittedAt: d("2026-07-25T08:45:00Z") })];
    expect(evaluateProofs(p, terminiert, d("2026-07-25T10:00:00Z"))).toBe("complete");
    // Ab dem Stellen gerechnet wäre derselbe Nachweis um 09:00 zwölf Stunden zu spät gewesen.
    expect(evaluateProofs(p, { ...terminiert, wirksamAb: null }, d("2026-07-25T10:00:00Z"))).toBe("failed");
    // Und offen bleibt er, solange seine Frist läuft.
    const offen = [inAnHour({ submittedAt: null, imageExifTime: null })];
    expect(evaluateProofs(offen, terminiert, d("2026-07-25T08:30:00Z"))).toBe("pending");
  });

  /**
   * DIE OBERE SCHRANKE. `Task.holdUntil` bleibt sie auch für diese Frist-Art: die SQL-Vorauswahl des
   * Pollers sucht über die Spalte, und ein Nachweis, dessen Frist dahinter läge, bekäme nie ein
   * Urteil. `proofDeadline` deckelt deshalb — der Dienst weist so etwas beim Anlegen ohnehin ab, aber
   * eine nachträglich VERKÜRZTE Aufgabenfrist (`edit_task`) erzeugt genau diesen Fall.
   */
  it("die Frist der Aufgabe gewinnt — eine Nachweis-Fälligkeit dahinter wird auf sie gedeckelt", () => {
    // Nullpunkt 12:00, Ende 18:00, Nachweis-Fälligkeit „nach 10 Stunden" = 22:00.
    const p = proof({ dueOffsetMin: 600, submittedAt: null, imageExifTime: null });
    expect(proofDeadline(p, task, HOLD_UNTIL)).toEqual(HOLD_UNTIL);
    // Also urteilt sie genau wie eine Aufgabe ohne eigene Fälligkeit: bis 18:00 offen, danach nicht.
    expect(evaluateProofs([p], task, d("2026-07-25T17:59:00Z"))).toBe("pending");
    expect(evaluateProofs([p], task, d("2026-07-25T18:01:00Z"))).toBe("failed");
  });

  /** Im DAUER-MODUS ist das wirksame Ende früher als die Spalte — die Anzeige-Frist eines Nachweises
   *  muss ihm folgen, sonst verspräche sie Zeit, die die Auswertung nicht mehr zählt. */
  it("im Dauer-Modus deckelt das WIRKSAME Ende", () => {
    const wirksam = d("2026-07-25T14:00:00Z");
    expect(proofDeadline(proof({ dueOffsetMin: 600 }), task, wirksam)).toEqual(wirksam);
    expect(proofDeadline(proof({ dueOffsetMin: 60 }), task, wirksam)).toEqual(d("2026-07-25T13:00:00Z"));
  });

  it("die Reihenfolge bleibt unberührt — eine eigene Frist ersetzt sie nicht", () => {
    const p = [
      proof({ id: "a", sortOrder: 0, dueOffsetMin: 60, submittedAt: d("2026-07-25T12:30:00Z"), imageExifTime: d("2026-07-25T12:30:00Z") }),
      proof({ id: "b", sortOrder: 1, dueOffsetMin: 300, submittedAt: d("2026-07-25T13:00:00Z"), imageExifTime: d("2026-07-25T12:10:00Z") }),
    ];
    expect(evaluateProofs(p, task, d("2026-07-25T14:00:00Z"))).toBe("failed");
    expect(evaluateProofs(p, { ...task, proofOrderMatters: false }, d("2026-07-25T14:00:00Z"))).toBe("complete");
  });

  /** Überfällig ist nur, wo eine EIGENE Frist verstrichen ist — und nur, solange nichts da ist. Wo
   *  die Frist der Aufgabe die kürzere ist, urteilt die Aufgabe selbst; ein zweiter Vorwurf an der
   *  Zeile wiederholte bloss ihren Zustand. */
  it("der Beleg nennt nur die Nachweise mit eigener, verstrichener Frist", () => {
    const t = taskWith();
    const p = [
      proof({ id: "eingereicht", sortOrder: 0, dueOffsetMin: 60, submittedAt: d("2026-07-25T12:30:00Z") }),
      proof({ id: "verpasst", sortOrder: 1, dueOffsetMin: 60, submittedAt: null, imageExifTime: null }),
      proof({ id: "ohneFrist", sortOrder: 2, submittedAt: null, imageExifTime: null }),
    ];
    expect(evaluateTask(t, [], [], d("2026-07-25T19:00:00Z"), p).overdueProofIds).toEqual(["verpasst"]);
  });

  /**
   * DIE TATZEIT. Das Strafbuch datiert `unfulfilled_task` als `failedAt ?? holdUntil` — ohne
   * `failedAt` trüge ein um 17:00 entstandenes Versäumnis den Zeitstempel des Aufgaben-Endes und
   * stünde damit Stunden in der Zukunft, falsch einsortiert in jeder Perioden-Ansicht.
   */
  it("das Versäumnis wird auf die verstrichene Nachweis-Frist datiert, nicht auf das Aufgaben-Ende", () => {
    const t = taskWith({ holdUntil: ENDE_22 });
    const p = [ohneNachweis()];
    const r = evaluateTask(t, [], [], d("2026-07-25T19:00:00Z"), p);
    expect(r.state).toBe("missed");
    // Nullpunkt 12:00 + 300 min = 17:00.
    expect(r.failedAt).toEqual(d("2026-07-25T17:00:00Z"));

    // Bei mehreren verstrichenen Fristen zählt die FRÜHESTE — dort entstand das Vergehen.
    const zwei = [
      proof({ id: "spaet", sortOrder: 1, dueOffsetMin: 360, submittedAt: null, imageExifTime: null }),
      proof({ id: "frueh", sortOrder: 0, dueOffsetMin: 300, submittedAt: null, imageExifTime: null }),
    ];
    expect(evaluateTask(t, [], [], d("2026-07-25T19:00:00Z"), zwei).failedAt).toEqual(d("2026-07-25T17:00:00Z"));
  });

  /**
   * Ein NACH seiner Frist nachgereichtes Foto zählt für das Urteil nicht — und muss deshalb auch an
   * der Zeile als überfällig stehen. Sonst zeigte die Karte ein grünes „erbracht" über einer
   * versäumten Aufgabe, ohne dass irgendwo stünde, woran es lag.
   */
  it("ein nach seiner Frist nachgereichter Nachweis gilt ebenfalls als überfällig", () => {
    const t = taskWith({ holdUntil: ENDE_22 });
    // Frist 13:00, eingereicht 14:00.
    const spaet = [proof({ id: "mittag", dueOffsetMin: 60, submittedAt: d("2026-07-25T14:00:00Z") })];
    const r = evaluateTask(t, [], [], d("2026-07-25T15:00:00Z"), spaet);
    expect(r.state).toBe("missed");
    expect(r.overdueProofIds).toEqual(["mittag"]);
    expect(r.failedAt).toEqual(d("2026-07-25T13:00:00Z"));
  });

  /**
   * Auch ein RÜCKZUG steht über allem — und nimmt den BELEG gleich mit.
   *
   * `overdueProofIds` begründet ein Versäumnis; ein Rückzug ist keines. Blieb die Liste stehen,
   * zeigte die Karte des Trägers an einer zurückgenommenen Aufgabe „Nachweis überfällig — Frist
   * verstrichen": ein Vorwurf an einer Zeile, die ihn nicht mehr bindet.
   */
  it("ein Rückzug schlägt auch eine verstrichene Nachweis-Frist — samt ihrem Beleg", () => {
    const t = taskWith({ withdrawnAt: d("2026-07-25T13:30:00Z") });
    const p = [proof({ dueOffsetMin: 60, submittedAt: null, imageExifTime: null })];
    const r = evaluateTask(t, [], [], d("2026-07-25T14:00:00Z"), p);
    expect(r.state).toBe("withdrawn");
    expect(r.overdueProofIds).toEqual([]);
    // Gegenprobe: ohne den Rückzug wäre genau dieser Nachweis der Beleg gewesen.
    expect(evaluateTask(taskWith(), [], [], d("2026-07-25T14:00:00Z"), p).overdueProofIds).toEqual(["p1"]);
  });

  /**
   * DIE INVARIANTE, an der die MCP-Doku hängt: ein überfälliger Nachweis und ein OFFENER
   * Aufgaben-Zustand schliessen einander aus.
   *
   * Eine verstrichene eigene Frist entscheidet die Aufgabe sofort (`missed`), und `missed` ist weder
   * offen noch zu sichten — `keyholder_dashboard.openTasks` trägt die Zeile zu diesem Zeitpunkt
   * längst nicht mehr. Genau deshalb kann `openTasks[].proofs[].state` den Wert `overdue` nicht
   * zeigen, und genau das sagen Guide und `explain_model` seit dem 16.08.2026. Fällt diese
   * Invariante, wird die Doku zur Lüge gegenüber dem Keyholder-Agenten — dieser Test ist ihr Halt.
   *
   * Als TABELLE mit erwartetem Zustand UND erwartetem Beleg, nicht als Schleife mit einer Bedingung
   * um das `expect`: eine Zusicherung, die nur in manchen Durchläufen feuert, ist grün, sobald sie in
   * KEINEM mehr feuert — und dieser Test hätte dann genau das verschwiegen, wogegen er gebaut ist.
   * Jede Zeile prüft deshalb beides und keine wird übersprungen; die Invariante darüber ist die
   * Ableitung aus derselben Zeile, nicht ein zweiter, weicherer Massstab.
   */
  describe.each([
    // Vor der Frist des Nachweises (17:00) — offen, also kein Beleg.
    ["ohne Bedingung, Frist läuft", false, ohneNachweis, "13:00", "pending", []],
    ["mit Bedingung, Frist läuft", true, ohneNachweis, "13:00", "running", []],
    // GENAU auf der Frist und danach — versäumt, und der Beleg steht.
    ["ohne Bedingung, Frist erreicht", false, ohneNachweis, "17:00", "missed", ["mittag"]],
    ["mit Bedingung, Frist erreicht", true, ohneNachweis, "17:00", "missed", ["mittag"]],
    ["ohne Bedingung, Frist vorbei", false, ohneNachweis, "19:00", "missed", ["mittag"]],
    ["mit Bedingung, Frist vorbei", true, ohneNachweis, "19:00", "missed", ["mittag"]],
    // Zu SPÄT nachgereicht und ungesichtet zählt nicht — dasselbe Urteil, derselbe Beleg.
    ["ohne Bedingung, zu spät nachgereicht", false, spaetNachgereicht, "19:00", "missed", ["mittag"]],
    ["mit Bedingung, zu spät nachgereicht", true, spaetNachgereicht, "19:00", "missed", ["mittag"]],
    // Und der Zustand, in dem die KEYHOLDERIN am Zug ist: rechtzeitig da, aber nicht entscheidbar.
    ["ohne Bedingung, wartet auf Sichtung", false, zurSichtung, "19:00", "awaitingReview", []],
    // MIT Bedingung erst nach dem Ende (22:00): solange gehalten wird, ist „halten" der Zustand —
    // die Nachweis-Achse wird dort noch gar nicht gefragt.
    ["mit Bedingung, Sichtung fällig aber Haltefrist läuft", true, zurSichtung, "19:00", "running", []],
    ["mit Bedingung, wartet auf Sichtung", true, zurSichtung, "23:00", "awaitingReview", []],
  ] as const)("%s", (_name, mitBedingung, mkProof, uhr, erwarteterZustand, erwarteterBeleg) => {
    const r = () => evaluateTask(
      taskWith({ holdUntil: ENDE_22 }),
      mitBedingung ? SLIP_REQ : [],
      mitBedingung ? GETRAGEN : [],
      d(`2026-07-25T${uhr}:00Z`),
      [mkProof()],
    );

    it(`ist ${erwarteterZustand} mit ${erwarteterBeleg.length} Beleg(en)`, () => {
      expect(r().state).toBe(erwarteterZustand);
      expect(r().overdueProofIds).toEqual([...erwarteterBeleg]);
    });

    /** Die Invariante selbst, aus derselben Zeile abgeleitet: ist der Zustand offen (oder wartet er
     *  auf die Sichtung), darf kein Beleg dranhängen — sonst zeigte `openTasks` ein `overdue`. */
    it("offen oder zu sichten ⇒ kein Beleg", () => {
      const e = r();
      const offen = isTaskOpen(e.state) || needsKeyholderReview(e.state);
      expect(offen && e.overdueProofIds.length > 0).toBe(false);
    });
  });
});

/**
 * DIE SPÄTE ANNAHME RETTET (Produkt-Entscheidung 15.08.2026): nimmt die Keyholderin einen nach
 * seiner Frist eingereichten Nachweis an, ist die Aufgabe erfüllt statt versäumt. Begründung und
 * Grenzen stehen bei `proofCounted` in `tasks.ts` und werden hier nicht wiederholt.
 *
 * ZWEIMAL DASSELBE, absichtlich als Tabelle: seit B12 hat ein Nachweis entweder eine EIGENE
 * Fälligkeit oder die des Aufgaben-Endes. Beide laufen über `proofDeadline` in denselben Ausdruck —
 * die Tabelle hält fest, dass keine der beiden einen Sonderzweig hat, der beim nächsten Umbau wegfällt.
 *
 * WOHER ein verspäteter Nachweis kommt, ist eine andere Frage und hier nicht mitgeprüft: seit dem
 * 16.08.2026 darf der Träger nach der Frist selbst noch hochladen (bis zum Ende der Aufgabe, siehe
 * `proofSubmitBlockedReason`), dazu kommen wie bisher die Fälle, in denen die Frist NACH der
 * Einreichung nach vorn rückt (verkürzt per `edit_task`, oder das wirksame Ende im Dauer-Modus).
 * Die Auswertung hier gilt für jeden dieser Wege gleich.
 */
describe("späte Annahme rettet die Aufgabe", () => {
  const AFTER = d("2026-07-25T19:00:00Z");
  /** Nachweis OHNE eigene Fälligkeit: seine Frist IST das Ende der Aufgabe (18:00), eingereicht 18:20. */
  const lateAtEnd = (over: Partial<ProofLike> = {}) => proof({ submittedAt: d("2026-07-25T18:20:00Z"), ...over });
  /** Nachweis MIT eigener Fälligkeit (13:00, siehe `inAnHour`), eingereicht 14:00. */
  const lateOwnDue = (over: Partial<ProofLike> = {}) => inAnHour({ submittedAt: d("2026-07-25T14:00:00Z"), ...over });

  describe.each([
    ["Frist = Ende der Aufgabe", lateAtEnd],
    ["eigene Fälligkeit des Nachweises (B12)", lateOwnDue],
  ] as const)("%s", (_name, late) => {
    it("angenommen → die Achse ist erfüllt", () => {
      expect(evaluateProofs([late({ reviewAccepted: true })], task, AFTER)).toBe("complete");
    });

    /** Der Träger kann sich nicht selbst freisprechen — und die MASCHINE kann es auch nicht: der
     *  Fixture-Nachweis trägt einen bestätigten Code (`verifikationStatus: "ai"`) und zählt trotzdem
     *  nicht. Nur das Urteil eines Menschen hebt die Frist auf. */
    it("ungesichtet → Fehlschlag, auch mit bestätigtem Code", () => {
      expect(evaluateProofs([late()], task, AFTER)).toBe("failed");
    });
  });

  /**
   * Die ganze Aufgabe, über BEIDE Wege durch `evaluateTask`: ohne Bedingungen entscheidet die
   * Nachweis-Achse allein, mit Bedingung wird sie erst NACH der Bedingungs-Achse und gegen das
   * WIRKSAME Ende gefragt (dort greift zusätzlich der `overdue`-Zweig, der eine verstrichene
   * Nachweis-Frist sofort zum Versäumnis macht). Beide Wege müssen dieselbe Wendung machen.
   */
  it("aus versäumt wird erfüllt — Ablehnen lässt es beim Versäumnis", () => {
    const ohneBedingung = taskWith({ completedAt: d("2026-07-25T17:00:00Z") });
    expect(evaluateTask(ohneBedingung, [], [], AFTER, [lateOwnDue()]).state).toBe("missed");
    expect(evaluateTask(ohneBedingung, [], [], AFTER, [lateOwnDue({ reviewAccepted: true })]).state).toBe("done");
    expect(evaluateTask(ohneBedingung, [], [], AFTER, [lateOwnDue({ reviewAccepted: false })]).state).toBe("missed");

    const mitBedingung = taskWith({ completedAt: d("2026-07-25T18:30:00Z") });
    const REQ = [{ id: "r1", label: "Slip" }];
    const held = [[{ start: d("2026-07-25T11:00:00Z"), end: d("2026-07-25T20:00:00Z") }]];
    expect(evaluateTask(mitBedingung, REQ, held, AFTER, [lateOwnDue()]).state).toBe("missed");
    expect(evaluateTask(mitBedingung, REQ, held, AFTER, [lateOwnDue({ reviewAccepted: true })]).state).toBe("done");
  });

  /**
   * DER ANZEIGE-WIDERSPRUCH, den diese Entscheidung auflöst: die Zeile zeigte den angenommenen
   * Nachweis schon immer als „erbracht" (`taskProofState` wertet `reviewAccepted` vor `overdue`),
   * während das Urteil darüber „versäumt" meldete — und `overdueProofIds`, der Beleg zu diesem
   * Urteil, nannte ausgerechnet diese Zeile. Beide Auskünfte müssen dieselbe sein.
   */
  it("der angenommene Nachweis steht nicht mehr im Beleg der überfälligen", () => {
    const t = taskWith({ completedAt: d("2026-07-25T17:00:00Z") });
    const ungesichtet = evaluateTask(t, [], [], AFTER, [lateOwnDue()]);
    expect(ungesichtet.overdueProofIds).toEqual(["p1"]);
    expect(ungesichtet.failedAt).toEqual(d("2026-07-25T13:00:00Z"));

    const angenommen = evaluateTask(t, [], [], AFTER, [lateOwnDue({ reviewAccepted: true })]);
    expect(angenommen.overdueProofIds).toEqual([]);
    expect(angenommen.failedAt).toBeNull();
  });

  /**
   * Die Rettung führt in einen ENDZUSTAND — und genau daran hängt, ob der Träger von der Korrektur
   * erfährt: `reviewTaskProof` schickt die Ergebnis-Meldung an beide Seiten nur, wenn
   * `isTaskResultFinal` gilt (und bewusst ohne `once`, damit sie die frühere „versäumt"-Zeile
   * ablöst). Bliebe die Aufgabe hier in einem Zwischenzustand, verschwände das bereits gemeldete
   * Versäumnis STILL — der Fall, gegen den `docs/aufgaben-uebergabe.md` §1 warnt.
   */
  it("die Rettung endet in einem Endzustand — sonst erführe niemand von der Korrektur", () => {
    const t = taskWith({ completedAt: d("2026-07-25T17:00:00Z") });
    const state = evaluateTask(t, [], [], AFTER, [lateAtEnd({ reviewAccepted: true })]).state;
    expect(isTaskResultFinal(state)).toBe(true);
    expect(isTaskOffense(state)).toBe(false);
  });
});

describe("evaluateProofs — Code-Prüfung und Sichtung", () => {
  it("Code gefordert und erkannt → maschinell erledigt", () => {
    expect(evaluateProofs([proof()], task, d("2026-07-25T19:00:00Z"))).toBe("complete");
  });

  /** Die Bilderkennung liest schräge Fotos falsch — `verifyCode.ts` führt eigens eine Fuzzy-Toleranz
   *  für 1↔7 und 0↔6. Ein durchgefallener Auto-Check darf deshalb kein Vergehen sein, sondern geht
   *  zur Sichtung: genauso wie eine Kontrolle mit gescheitertem Auto-Check. */
  it("Code gefordert und NICHT erkannt → Sichtung, NICHT Fehlschlag", () => {
    const p = [proof({ verifikationStatus: null, verifikationReason: "codeWrong" })];
    expect(evaluateProofs(p, task, d("2026-07-25T19:00:00Z"))).toBe("needsReview");
  });

  it("erst das ausdrückliche Nein eines Menschen ist ein Fehlschlag", () => {
    const p = [proof({ verifikationStatus: null, verifikationReason: "codeWrong", reviewAccepted: false })];
    expect(evaluateProofs(p, task, d("2026-07-25T19:00:00Z"))).toBe("failed");
  });

  /** „Foto mit zwei Rechnungen" ist eine Aussage über den Bildinhalt — keine Maschine entscheidet die. */
  it("ohne Code-Pflicht → immer zur Sichtung", () => {
    const p = [proof({ requireCode: false, verifikationStatus: null, verifikationReason: null })];
    expect(evaluateProofs(p, task, d("2026-07-25T19:00:00Z"))).toBe("needsReview");
  });

  it("von der Keyholderin angenommen → erledigt", () => {
    const p = [proof({ requireCode: false, verifikationStatus: null, verifikationReason: null, reviewAccepted: true })];
    expect(evaluateProofs(p, task, d("2026-07-25T21:00:00Z"))).toBe("complete");
  });

  it("von der Keyholderin abgelehnt → Fehlschlag, auch wenn der Code stimmte", () => {
    const p = [proof({ reviewAccepted: false })];
    expect(evaluateProofs(p, task, d("2026-07-25T21:00:00Z"))).toBe("failed");
  });

  it("einer erledigt, einer offen → die ganze Achse wartet", () => {
    const p = [proof({ id: "a", sortOrder: 0 }), proof({ id: "b", sortOrder: 1, requireCode: false, verifikationStatus: null, verifikationReason: null, imageExifTime: d("2026-07-25T14:00:00Z") })];
    expect(evaluateProofs(p, task, d("2026-07-25T19:00:00Z"))).toBe("needsReview");
  });
});

describe("evaluateTask — beide Achsen zusammen", () => {
  const REQ = [{ id: "r1", label: "Knebel" }];
  const base = { createdAt: d("2026-07-25T12:00:00Z"), holdUntil: HOLD_UNTIL, startGraceMin: 30, completedAt: null, withdrawnAt: null };
  /** Bedingung durchgehend erfüllt von vor der Aufgabe bis nach der Frist. */
  const held = [[{ start: d("2026-07-25T11:00:00Z"), end: d("2026-07-25T20:00:00Z") }]];
  const after = d("2026-07-25T19:00:00Z");

  it("Bedingungen gehalten, Nachweise offen → wartet auf Sichtung, NICHT auf Selbstmeldung", () => {
    const r = evaluateTask(base, REQ, held, after, [proof({ requireCode: false, verifikationStatus: null, verifikationReason: null })]);
    expect(r.state).toBe("awaitingReview");
    // Den Sub hier zur Meldung zu drängen, während die Keyholderin am Zug ist, wäre die falsche
    // Aufforderung an die falsche Person.
    expect(r.awaitingConfirmation).toBe(false);
  });

  it("Bedingungen gehalten, Nachweise erledigt, Selbstmeldung fehlt → wie bisher", () => {
    const r = evaluateTask(base, REQ, held, after, [proof()]);
    expect(r.state).toBe("running");
    expect(r.awaitingConfirmation).toBe(true);
  });

  it("Bedingungen gehalten, Nachweise erledigt, gemeldet → erfüllt", () => {
    const t = { ...base, completedAt: d("2026-07-25T17:00:00Z") };
    expect(evaluateTask(t, REQ, held, after, [proof()]).state).toBe("done");
  });

  /** Ein Verhalten des Subs schlägt ein ausstehendes Urteil — sonst verdeckte eine offene Sichtung
   *  ein echtes Versäumnis. */
  it("Nachweise fehlgeschlagen schlägt durch, auch wenn die Bedingungen hielten", () => {
    const r = evaluateTask(base, REQ, held, after, [proof({ reviewAccepted: false })]);
    expect(r.state).toBe("missed");
    expect(isTaskOffense(r.state)).toBe(true);
  });

  /** FUND aus dem Review: der Beleg darf nicht verlorengehen. Wer die Bedingungen gehalten hat und
   *  nur den Nachweis schuldig blieb, ist nicht „nie begonnen" — und wer vorzeitig ablegte, hat
   *  Anspruch darauf, dass Zeitpunkt und Bedingung in der Meldung stehen. */
  it("fehlgeschlagener Nachweis behält den Beleg der Bedingungs-Achse", () => {
    const r = evaluateTask(base, REQ, held, after, [proof({ reviewAccepted: false })]);
    expect(r.state).toBe("missed");
    expect(r.startedAt).not.toBeNull(); // er HAT begonnen
  });

  it("vorzeitig abgelegt UND Nachweis abgelehnt → der Abbruch-Beleg bleibt erhalten", () => {
    const dropped = [[{ start: d("2026-07-25T11:00:00Z"), end: d("2026-07-25T14:00:00Z") }]];
    const r = evaluateTask(base, REQ, dropped, after, [proof({ reviewAccepted: false })]);
    expect(r.state).toBe("aborted");
    expect(r.failedRequirement?.label).toBe("Knebel");
    expect(r.failedAt).not.toBeNull();
  });

  it("abgebrochene Bedingung schlägt eine ausstehende Sichtung", () => {
    // Gerät um 14:00 abgelegt, Frist war 18:00.
    const dropped = [[{ start: d("2026-07-25T11:00:00Z"), end: d("2026-07-25T14:00:00Z") }]];
    const r = evaluateTask(base, REQ, dropped, after, [proof({ requireCode: false, verifikationStatus: null, verifikationReason: null })]);
    expect(r.state).toBe("aborted");
  });

  it("Rückzug schlägt alles, auch einen fehlgeschlagenen Nachweis", () => {
    const t = { ...base, withdrawnAt: d("2026-07-25T16:00:00Z") };
    expect(evaluateTask(t, REQ, held, after, [proof({ verifikationStatus: null, verifikationReason: "codeWrong" })]).state).toBe("withdrawn");
  });

  it("Aufgabe OHNE Bedingungen, nur mit Nachweisen: die Selbstmeldung macht sie nicht fertig", () => {
    const t = { ...base, completedAt: d("2026-07-25T17:00:00Z") };
    const r = evaluateTask(t, [], [], after, [proof({ requireCode: false, verifikationStatus: null, verifikationReason: null })]);
    expect(r.state).toBe("awaitingReview");
  });

  it("Aufgabe OHNE Bedingungen, Nachweise noch offen und Frist läuft → offen", () => {
    const r = evaluateTask(base, [], [], d("2026-07-25T14:00:00Z"), [proof({ submittedAt: null, imageExifTime: null })]);
    expect(r.state).toBe("pending");
  });
});

describe("REGRESSION: laufende Code-Prüfung ist kein Urteil", () => {
  /**
   * Die Prüfung startet erst NACH dem Speichern (Etappe 3, `runTaskProofVerification`). Reicht der
   * Sub kurz vor der Frist ein, ist sie beim nächsten Poller-Tick vielleicht noch unterwegs.
   *
   * Ohne eigenen Zwischenstand hätte der Poller „bitte sichten" an die Keyholderin gemeldet UND
   * gestempelt — und das Ergebnis, das Sekunden später „erfüllt" lautet, hätte niemand mehr erfahren.
   */
  it("eingereicht, Code gefordert, noch nicht geprüft → `checking`, nicht `needsReview`", () => {
    const p = [proof({ verifikationStatus: null, verifikationReason: null })];
    expect(evaluateProofs(p, task, d("2026-07-25T19:00:00Z"))).toBe("checking");
  });

  it("die Auswertung meldet die laufende Prüfung an den Poller", () => {
    const REQ = [{ id: "r1", label: "Knebel" }];
    const base = { createdAt: d("2026-07-25T12:00:00Z"), holdUntil: HOLD_UNTIL, startGraceMin: 30, completedAt: null, withdrawnAt: null };
    const held = [[{ start: d("2026-07-25T11:00:00Z"), end: d("2026-07-25T20:00:00Z") }]];
    const r = evaluateTask(base, REQ, held, d("2026-07-25T19:00:00Z"), [
      proof({ verifikationStatus: null, verifikationReason: null }),
    ]);
    // Für den Sub sieht es aus wie „wartet" — er kann nichts tun. Der Poller darf es nicht melden.
    expect(r.state).toBe("awaitingReview");
    expect(r.proofCheckPending).toBe(true);
  });

  it("ist die Prüfung durch, ist nichts mehr offen", () => {
    const r = evaluateTask(
      { createdAt: d("2026-07-25T12:00:00Z"), holdUntil: HOLD_UNTIL, startGraceMin: 30, completedAt: null, withdrawnAt: null },
      [{ id: "r1", label: "Knebel" }],
      [[{ start: d("2026-07-25T11:00:00Z"), end: d("2026-07-25T20:00:00Z") }]],
      d("2026-07-25T19:00:00Z"),
      [proof()],
    );
    expect(r.proofCheckPending).toBe(false);
  });

  /** Ohne Code-Pflicht gibt es keine Automatik, auf die man warten könnte. */
  it("ohne Code-Pflicht wartet nichts — das ist eine echte Sichtung", () => {
    const p = [proof({ requireCode: false, verifikationStatus: null, verifikationReason: null })];
    expect(evaluateProofs(p, task, d("2026-07-25T19:00:00Z"))).toBe("needsReview");
  });
});

describe("firstOutOfOrderProof — der Beleg für den Fehlschlag", () => {

  /**
   * Die Anzeige braucht ihn: sonst zeigt jede Nachweis-Zeile für sich „erbracht" (jeder Code stimmte
   * ja), während die Aufgabe darunter „versäumt" meldet — zwei grüne Häkchen über einem Versäumnis,
   * ohne dass irgendwo stünde, was schiefging.
   */
  it("nennt den Nachweis, der die Reihenfolge bricht", () => {
    const p = [at("2026-07-25T13:00:00Z", 0, "erster"), at("2026-07-25T12:00:00Z", 1, "zweiter")];
    expect(firstOutOfOrderProof(p, task)?.id).toBe("zweiter");
  });

  /**
   * Dieselben zwei Fotos, aber die Aufgabe ist zurückgezogen — der Test darüber ist die Gegenprobe.
   *
   * Die Reihenfolge war die letzte Achse, auf der eine zurückgenommene Aufgabe den Träger noch
   * anklagte: die überfälligen Nachweise räumt `evaluateTask` (Test in „Nachweis mit eigener
   * Fälligkeit"), diese Achse rechnet sich die Anzeige selbst aus und erreichte der Rückzug nicht.
   */
  it("ein Rückzug nimmt der gebrochenen Reihenfolge den Vorwurf", () => {
    const p = [at("2026-07-25T13:00:00Z", 0, "erster"), at("2026-07-25T12:00:00Z", 1, "zweiter")];
    expect(firstOutOfOrderProof(p, { ...task, withdrawnAt: d("2026-07-25T17:00:00Z") })).toBeNull();
  });

  it("in richtiger Reihenfolge gibt es keinen", () => {
    const p = [at("2026-07-25T12:00:00Z", 0, "a"), at("2026-07-25T13:00:00Z", 1, "b")];
    expect(firstOutOfOrderProof(p, task)).toBeNull();
  });

  it("bei drei Nachweisen den ERSTEN Bruch, nicht den letzten", () => {
    const p = [
      at("2026-07-25T12:00:00Z", 0, "a"),
      at("2026-07-25T11:00:00Z", 1, "b"),
      at("2026-07-25T10:00:00Z", 2, "c"),
    ];
    expect(firstOutOfOrderProof(p, task)?.id).toBe("b");
  });

  it("ein Nachweis ohne Aufnahmezeit wird übersprungen, nicht als Bruch gezählt", () => {
    const p = [
      at("2026-07-25T12:00:00Z", 0, "a"),
      proof({ id: "b", sortOrder: 1, imageExifTime: null }),
      at("2026-07-25T13:00:00Z", 2, "c"),
    ];
    expect(firstOutOfOrderProof(p, task)).toBeNull();
  });

  it("ein Nachweis ohne Aufnahmezeit verdeckt keinen Bruch dahinter", () => {
    const p = [
      at("2026-07-25T12:00:00Z", 0, "a"),
      proof({ id: "b", sortOrder: 1, imageExifTime: null }),
      at("2026-07-25T11:00:00Z", 2, "c"),
    ];
    expect(firstOutOfOrderProof(p, task)?.id).toBe("c");
  });

  /**
   * PRODUKT-ENTSCHEIDUNG 16.08.2026: dieselbe Regel wie auf den beiden anderen Nachweis-Achsen —
   * wo die Keyholderin urteilt, urteilt sie an Stelle der Maschine. Vorher war die Reihenfolge als
   * einzige unheilbar: eine Aufgabe scheiterte, obwohl jedes Foto angenommen war.
   */
  it("ein angenommener Nachweis bricht die Reihenfolge nicht mehr", () => {
    const p = [
      at("2026-07-25T13:00:00Z", 0, "erster"),
      proof({ id: "zweiter", sortOrder: 1, imageExifTime: new Date("2026-07-25T12:00:00Z"), reviewAccepted: true }),
    ];
    expect(firstOutOfOrderProof(p, task)).toBeNull();
  });

  /** Geheilt ist SEIN Bruch, nicht die Reihenfolge der Übrigen: der ungesehene Nachweis dahinter
   *  wird weiter gegen die letzte belegte Zeit gemessen. */
  it("die Annahme heilt nur den eigenen Bruch, nicht den danach", () => {
    const p = [
      at("2026-07-25T13:00:00Z", 0, "a"),
      proof({ id: "b", sortOrder: 1, imageExifTime: new Date("2026-07-25T12:00:00Z"), reviewAccepted: true }),
      at("2026-07-25T11:00:00Z", 2, "c"),
    ];
    expect(firstOutOfOrderProof(p, task)?.id).toBe("c");
  });

  /** Abgelehnt ist nicht angenommen — die Ablehnung ist das Urteil gegen den Nachweis. */
  it("ein abgelehnter Nachweis bleibt ein Bruch", () => {
    const p = [
      at("2026-07-25T13:00:00Z", 0, "a"),
      proof({ id: "b", sortOrder: 1, imageExifTime: new Date("2026-07-25T12:00:00Z"), reviewAccepted: false }),
    ];
    expect(firstOutOfOrderProof(p, task)?.id).toBe("b");
  });
});

describe("Zustands-Prädikate für die Sichtung", () => {
  it("wartende Sichtung ist kein Vergehen — niemand hat geurteilt", () => {
    expect(isTaskOffense("awaitingReview")).toBe(false);
  });

  it("für den Sub ist sie geschlossen, für die Keyholderin offen", () => {
    expect(isTaskOpen("awaitingReview")).toBe(false);
    expect(needsKeyholderReview("awaitingReview")).toBe(true);
  });

  it("kein anderer Zustand verlangt eine Sichtung", () => {
    for (const s of ["pending", "partial", "running", "done", "missed", "aborted", "withdrawn"] as const) {
      expect(needsKeyholderReview(s), s).toBe(false);
    }
  });
});
