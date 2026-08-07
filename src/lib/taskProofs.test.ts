import { describe, it, expect } from "vitest";
import { evaluateProofs, evaluateTask, firstOutOfOrderProof, isTaskOffense, isTaskOpen, needsKeyholderReview, type ProofLike } from "./tasks";

/**
 * Die Nachweis-Achse (Issue #39): geforderte Fotos mit vorgegebener Reihenfolge.
 *
 * Bewusst getrennt von den Bedingungen geprüft — ein Nachweis ist ein EREIGNIS mit einem Zeitpunkt,
 * keine Bedingung mit einem Intervall. Die untere Hälfte prüft dann das Zusammenspiel beider Achsen,
 * weil dort die eigentliche Entscheidung liegt: welches Urteil schlägt welches.
 */

const d = (s: string) => new Date(s);
const HOLD_UNTIL = d("2026-07-25T18:00:00Z");
const task = { holdUntil: HOLD_UNTIL };

/** Ein eingereichter, per Code geprüfter Nachweis — der maschinell entscheidbare Normalfall. */
function proof(over: Partial<ProofLike> = {}): ProofLike {
  return {
    id: "p1",
    sortOrder: 0,
    requireCode: true,
    submittedAt: d("2026-07-25T13:00:00Z"),
    imageExifTime: d("2026-07-25T12:00:00Z"),
    verifikationStatus: "ai",
    verifikationReason: null,
    reviewAccepted: null,
    ...over,
  };
}

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
  const at = (iso: string, sortOrder: number, id: string) =>
    proof({ id, sortOrder, imageExifTime: d(iso) });

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
  const at = (iso: string, sortOrder: number, id: string) => proof({ id, sortOrder, imageExifTime: d(iso) });

  /**
   * Die Anzeige braucht ihn: sonst zeigt jede Nachweis-Zeile für sich „erbracht" (jeder Code stimmte
   * ja), während die Aufgabe darunter „versäumt" meldet — zwei grüne Häkchen über einem Versäumnis,
   * ohne dass irgendwo stünde, was schiefging.
   */
  it("nennt den Nachweis, der die Reihenfolge bricht", () => {
    const p = [at("2026-07-25T13:00:00Z", 0, "erster"), at("2026-07-25T12:00:00Z", 1, "zweiter")];
    expect(firstOutOfOrderProof(p)?.id).toBe("zweiter");
  });

  it("in richtiger Reihenfolge gibt es keinen", () => {
    const p = [at("2026-07-25T12:00:00Z", 0, "a"), at("2026-07-25T13:00:00Z", 1, "b")];
    expect(firstOutOfOrderProof(p)).toBeNull();
  });

  it("bei drei Nachweisen den ERSTEN Bruch, nicht den letzten", () => {
    const p = [
      at("2026-07-25T12:00:00Z", 0, "a"),
      at("2026-07-25T11:00:00Z", 1, "b"),
      at("2026-07-25T10:00:00Z", 2, "c"),
    ];
    expect(firstOutOfOrderProof(p)?.id).toBe("b");
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
