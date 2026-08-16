import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Der Einreiche-Pfad des Subs (Issue #39, Etappe 3).
 *
 * Die Schranken hier tragen die Anforderung: ohne sie liesse sich ein Nachweis nachliefern, ein
 * ungünstiges Foto austauschen oder ein fremder Nachweis bespielen — und die Reihenfolge-Prüfung,
 * um die es in #39 überhaupt geht, wäre in jedem dieser Fälle wertlos.
 */

vi.mock("@/lib/prisma", () => ({
  prisma: {
    taskProof: { findFirst: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
    task: { findMany: vi.fn(), update: vi.fn() },
    user: { findUnique: vi.fn() },
  },
}));
vi.mock("@/lib/verifyCode", () => ({ verifyKontrolleCodeDetailed: vi.fn() }));
vi.mock("@/lib/serverLog", () => ({ structuredLog: vi.fn() }));
vi.mock("@/lib/notify", () => ({ notifyUser: vi.fn(), notifyControllers: vi.fn() }));
vi.mock("@/lib/keyholder", () => ({ getControllersOfUser: vi.fn(async () => []) }));
vi.mock("@/lib/taskIntervals", () => ({ evaluateTaskById: vi.fn() }));
vi.mock("@/lib/taskService", () => ({ settleTaskResult: vi.fn() }));

import { submitTaskProof, proofVerificationOutcome, proofSubmitBlockedReason, reviewTaskProof } from "./taskProofService";
import { notifyUser } from "@/lib/notify";
import { evaluateTaskById } from "@/lib/taskIntervals";
import { settleTaskResult } from "@/lib/taskService";
import { prisma } from "@/lib/prisma";
import { verifyKontrolleCodeDetailed } from "@/lib/verifyCode";

const find = prisma.taskProof.findFirst as unknown as ReturnType<typeof vi.fn>;
const update = prisma.taskProof.updateMany as unknown as ReturnType<typeof vi.fn>;
const updateOne = prisma.taskProof.update as unknown as ReturnType<typeof vi.fn>;
const verify = verifyKontrolleCodeDetailed as unknown as ReturnType<typeof vi.fn>;
const notify = notifyUser as unknown as ReturnType<typeof vi.fn>;
const evaluate = evaluateTaskById as unknown as ReturnType<typeof vi.fn>;
const taskFindMany = prisma.task.findMany as unknown as ReturnType<typeof vi.fn>;
const taskUpdate = prisma.task.update as unknown as ReturnType<typeof vi.fn>;
const notifyResult = settleTaskResult as unknown as ReturnType<typeof vi.fn>;

const NOW = new Date("2026-07-25T14:00:00Z");
const HOLD_UNTIL = new Date("2026-07-25T18:00:00Z");
const PAYLOAD = { imageUrl: "/api/uploads/x.jpg", imageExifTime: new Date("2026-07-25T13:50:00Z") };

/** Ein offener Nachweis ohne Code-Pflicht — der einfachste Fall. */
const proofRow = (over: Record<string, unknown> = {}) => ({
  id: "p1",
  requireCode: false,
  code: null,
  submittedAt: null,
  task: { id: "t1", withdrawnAt: null, holdUntil: HOLD_UNTIL, holdDurationMin: null },
  ...over,
});

/** Die Daten, die tatsächlich geschrieben wurden. */
const written = () => update.mock.calls[0][0].data;

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  update.mockResolvedValue({ count: 1 });
  updateOne.mockResolvedValue({});
  taskFindMany.mockResolvedValue([{ id: "t1" }]);
  taskUpdate.mockResolvedValue({});
  (prisma.user.findUnique as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ username: "sub" });
});

describe("submitTaskProof — Schranken", () => {
  it("fremder oder unbekannter Nachweis wird nicht gefunden (IDOR-Schutz)", async () => {
    // findFirst ist bereits auf `task: { userId }` gefiltert — eine fremde id liefert nichts.
    find.mockResolvedValue(null);
    const res = await submitTaskProof("p1", "u1", PAYLOAD);
    if (res.ok) throw new Error("erwartet: Fehler");
    expect(res.error).toBe("TASK_PROOF_NOT_FOUND");
    expect(update).not.toHaveBeenCalled();
  });

  /** Sonst liesse sich ein ungünstiges Foto beliebig oft durch ein besseres ersetzen — und die
   *  Reihenfolge nachträglich zurechtlegen. */
  it("ein bereits eingereichter Nachweis lässt sich nicht überschreiben", async () => {
    find.mockResolvedValue(proofRow({ submittedAt: new Date("2026-07-25T13:00:00Z") }));
    const res = await submitTaskProof("p1", "u1", PAYLOAD);
    if (res.ok) throw new Error("erwartet: Fehler");
    expect(res.error).toBe("TASK_PROOF_ALREADY_SUBMITTED");
    expect(update).not.toHaveBeenCalled();
  });

  it("nach Ablauf der Frist wird gar nicht erst angenommen", async () => {
    vi.setSystemTime(new Date("2026-07-25T19:00:00Z"));
    find.mockResolvedValue(proofRow());
    const res = await submitTaskProof("p1", "u1", PAYLOAD);
    if (res.ok) throw new Error("erwartet: Fehler");
    expect(res.error).toBe("TASK_PROOF_TOO_LATE");
  });

  it("zurückgezogene Aufgabe nimmt nichts mehr an", async () => {
    find.mockResolvedValue(proofRow({ task: { id: "t1", withdrawnAt: NOW, holdUntil: HOLD_UNTIL, holdDurationMin: null } }));
    const res = await submitTaskProof("p1", "u1", PAYLOAD);
    if (res.ok) throw new Error("erwartet: Fehler");
    expect(res.error).toBe("TASK_NOT_EDITABLE");
  });

  /**
   * DIE EIGENE FRIST EINES NACHWEISES HÄLT NICHT MEHR AB (Produkt-Entscheidung 16.08.2026): sie ist
   * weich, das Ende der Aufgabe ist die harte Grenze. Vorher wies der Dienst hier ab — und nahm
   * damit der Keyholderin die Entscheidung ab, die ihr gehört, noch bevor sie das Foto sah.
   */
  it("nach der EIGENEN Frist, aber vor dem Ende der Aufgabe: wird angenommen", async () => {
    vi.setSystemTime(new Date("2026-07-25T16:00:00Z"));
    // Fälligkeit „60 Minuten nach dem Nullpunkt" = 15:00, Ende der Aufgabe 18:00.
    find.mockResolvedValue(proofRow({ dueOffsetMin: 60 }));
    const res = await submitTaskProof("p1", "u1", PAYLOAD);
    expect(res.ok).toBe(true);
    expect(written().submittedAt).toEqual(new Date("2026-07-25T16:00:00Z"));
  });

  /**
   * Im DAUER-Modus steht in `holdUntil` nur das spätestmögliche Ende (Kulanzfrist voll ausgereizt);
   * das wirkliche hängt am abgeleiteten Beginn und kommt aus der Auswertung. Gegen die Spalte
   * gemessen nähme der Dienst noch Fotos für eine Aufgabe an, die längst durch ist — und eine
   * Annahme machte daraus rückwirkend eine erfüllte.
   */
  it("Dauer-Modus: die harte Grenze ist das WIRKSAME Ende, nicht die Spalte", async () => {
    vi.setSystemTime(new Date("2026-07-25T17:00:00Z"));
    find.mockResolvedValue(proofRow({ task: { id: "t1", withdrawnAt: null, holdUntil: HOLD_UNTIL, holdDurationMin: 60 } }));
    // Begonnen um 15:00, eine Stunde Dauer → wirksames Ende 16:00, obwohl die Spalte 18:00 sagt.
    evaluate.mockResolvedValue({ evaluation: { proofSubmitOpen: false } });
    const res = await submitTaskProof("p1", "u1", PAYLOAD);
    if (res.ok) throw new Error("erwartet: Fehler");
    expect(res.error).toBe("TASK_PROOF_TOO_LATE");
  });

  /** Der klassische Modus zahlt dafür nichts: dort IST die Spalte das Ende, und es wird nichts
   *  nachgeladen. Sonst hinge an jedem Foto-Upload die ganze Intervall-Rechnung des Trägers. */
  it("klassischer Modus: keine Auswertung für die Schranke", async () => {
    find.mockResolvedValue(proofRow());
    await submitTaskProof("p1", "u1", PAYLOAD);
    expect(evaluate).not.toHaveBeenCalled();
  });

  /** Zwei gleichzeitige Aufrufe (Doppel-Tap): der zweite trifft null Zeilen, statt den ersten zu
   *  überschreiben — der Zustand steht in der Where-Klausel. */
  it("paralleles Einreichen überschreibt den ersten Treffer nicht", async () => {
    find.mockResolvedValue(proofRow());
    update.mockResolvedValue({ count: 0 });
    const res = await submitTaskProof("p1", "u1", PAYLOAD);
    if (res.ok) throw new Error("erwartet: Fehler");
    expect(res.error).toBe("TASK_PROOF_ALREADY_SUBMITTED");
  });
});

describe("proofVerificationOutcome — die Zuordnung des Prüf-Ergebnisses", () => {
  it("erkannter Code → maschinell bestätigt", () => {
    expect(proofVerificationOutcome({ match: true, detected: "12345", reason: null })).toEqual({
      verifikationStatus: "ai", verifikationReason: null, verifikationReasonDetected: null,
    });
  });

  /** Der Grund wird MITGESCHRIEBEN — er unterscheidet später „geprüft und durchgefallen" von „noch
   *  nicht geprüft", und beide haben `verifikationStatus: null`. */
  it("nicht erkannter Code hält den Grund fest, statt nur zu scheitern", () => {
    expect(proofVerificationOutcome({ match: false, detected: "12845", reason: "codeWrong" })).toEqual({
      verifikationStatus: null, verifikationReason: "codeWrong", verifikationReasonDetected: "12845",
    });
  });

  /**
   * Ohne Vision-Provider (oder bei einem Fehler der Prüfung) bleibt der GRUND leer. Sonst sähe ein
   * Ausfall unserer Infrastruktur aus wie ein Fehlverhalten des Subs — und `evaluateProofs`
   * unterscheidet die beiden Fälle genau an diesem Feld.
   */
  it.each([
    ["keine Prüfung möglich", null],
    ["Fehler der Prüfung", { match: false, detected: null, reason: null, error: "policy" as const }],
  ])("%s → weder Status noch Grund", (_name, result) => {
    expect(proofVerificationOutcome(result)).toEqual({
      verifikationStatus: null, verifikationReason: null, verifikationReasonDetected: null,
    });
  });
});

describe("submitTaskProof — die Prüfung blockiert das Einreichen NICHT", () => {
  /**
   * Dieselbe Ebene wie `runInspectionVerification` bei der Kontrolle: das Vision-Backend braucht
   * Sekunden, und der Sub soll nicht darauf warten. Das Foto ist gespeichert, bevor irgendetwas
   * geprüft wird — der Zustand ist abgeleitet und wechselt von selbst, sobald das Ergebnis da ist.
   */
  it("ohne Code-Pflicht wird gar nicht geprüft", async () => {
    find.mockResolvedValue(proofRow());
    const res = await submitTaskProof("p1", "u1", PAYLOAD);
    expect(res.ok).toBe(true);
    expect(verify).not.toHaveBeenCalled();
  });

  it("mit Code-Pflicht wird gespeichert, OHNE auf die Prüfung zu warten", async () => {
    find.mockResolvedValue(proofRow({ requireCode: true, code: "12345" }));
    // Eine Prüfung, die nie zurückkommt: das Einreichen muss trotzdem sofort gelingen.
    verify.mockReturnValue(new Promise(() => {}));
    const res = await submitTaskProof("p1", "u1", PAYLOAD);
    expect(res.ok).toBe(true);
    expect(update).toHaveBeenCalled();
  });

  it("die eingereichte Zeile trägt noch KEIN Prüf-Ergebnis", async () => {
    find.mockResolvedValue(proofRow({ requireCode: true, code: "12345" }));
    verify.mockReturnValue(new Promise(() => {}));
    await submitTaskProof("p1", "u1", PAYLOAD);
    // Bis das Ergebnis da ist, sieht `evaluateProofs` einen Nachweis ohne Bestätigung → Sichtung.
    expect(written()).not.toHaveProperty("verifikationStatus");
  });
});

describe("proofSubmitBlockedReason — die Regel hinter Seite und Dienst", () => {
  const open = { submittedAt: null, task: { withdrawnAt: null } };

  it("offen und die Aufgabe nimmt an: nichts steht im Weg", () => {
    expect(proofSubmitBlockedReason(open, true)).toBeNull();
  });

  it("nennt jeden Hinderungsgrund beim Namen", () => {
    expect(proofSubmitBlockedReason({ ...open, submittedAt: NOW }, true)).toBe("TASK_PROOF_ALREADY_SUBMITTED");
    expect(proofSubmitBlockedReason({ ...open, task: { withdrawnAt: NOW } }, true)).toBe("TASK_NOT_EDITABLE");
    expect(proofSubmitBlockedReason(open, false)).toBe("TASK_PROOF_TOO_LATE");
  });

  /**
   * Die RANGFOLGE ist Teil der Aussage: ein zurückgezogener oder längst eingereichter Nachweis
   * bekommt seinen eigenen Grund genannt, nicht den der Frist. Sonst läse der Träger „zu spät" über
   * einer Aufgabe, die es gar nicht mehr gibt.
   */
  it("Rückzug und Einreichung schlagen die Frist", () => {
    expect(proofSubmitBlockedReason({ ...open, task: { withdrawnAt: NOW } }, false)).toBe("TASK_NOT_EDITABLE");
    expect(proofSubmitBlockedReason({ ...open, submittedAt: NOW }, false)).toBe("TASK_PROOF_ALREADY_SUBMITTED");
  });
});

describe("submitTaskProof — was gespeichert wird", () => {
  it("Bild und Aufnahmezeit werden übernommen, der Einreiche-Zeitpunkt ist jetzt", async () => {
    find.mockResolvedValue(proofRow());
    await submitTaskProof("p1", "u1", PAYLOAD);
    expect(written().imageUrl).toBe(PAYLOAD.imageUrl);
    expect(written().imageExifTime).toEqual(PAYLOAD.imageExifTime);
    expect(written().submittedAt).toEqual(NOW);
  });

  /** Ein Bild ohne EXIF ist kein Fehler — die Reihenfolge ist dann nur nicht belegbar, und
   *  `evaluateProofs` schickt die Aufgabe zur Sichtung. */
  it("fehlende Aufnahmezeit wird als null gespeichert, nicht abgewiesen", async () => {
    find.mockResolvedValue(proofRow());
    const res = await submitTaskProof("p1", "u1", { ...PAYLOAD, imageExifTime: null });
    expect(res.ok).toBe(true);
    expect(written().imageExifTime).toBeNull();
  });
});

describe("reviewTaskProof — der Ausweg aus awaitingReview", () => {
  /** Ein eingereichter Nachweis, über den geurteilt werden kann. */
  const submitted = (over: Record<string, unknown> = {}) => ({
    id: "p1",
    submittedAt: new Date("2026-07-25T13:00:00Z"),
    task: { id: "t1", title: "Einkaufen", withdrawnAt: null },
    ...over,
  });
  /** Was die Sichtung geschrieben hat. */
  const reviewed = () => updateOne.mock.calls[0][0].data;
  const evaluatedAs = (state: string) => evaluate.mockResolvedValue({ evaluation: { state } });

  it("schreibt Urteil, Zeitpunkt und Anmerkung", async () => {
    find.mockResolvedValue(submitted());
    evaluatedAs("awaitingReview");
    const res = await reviewTaskProof("p1", "u1", { accepted: true, note: "  sauber  " }, "herrin");
    expect(res.ok).toBe(true);
    expect(reviewed().reviewAccepted).toBe(true);
    expect(reviewed().reviewedAt).toEqual(NOW);
    expect(reviewed().reviewNote).toBe("sauber");
  });

  it("eine leere Anmerkung wird zu null, nicht zu einem leeren Text", async () => {
    find.mockResolvedValue(submitted());
    evaluatedAs("awaitingReview");
    await reviewTaskProof("p1", "u1", { accepted: false, note: "   " }, "herrin");
    expect(reviewed().reviewNote).toBeNull();
  });

  it("über einen noch nicht eingereichten Nachweis lässt sich nicht urteilen", async () => {
    find.mockResolvedValue(submitted({ submittedAt: null }));
    const res = await reviewTaskProof("p1", "u1", { accepted: true }, "herrin");
    if (res.ok) throw new Error("erwartet: Fehler");
    expect(res.error).toBe("TASK_PROOF_NOT_SUBMITTED");
    expect(updateOne).not.toHaveBeenCalled();
  });

  it("fremder Nachweis wird nicht gefunden (IDOR-Schutz)", async () => {
    find.mockResolvedValue(null);
    const res = await reviewTaskProof("p1", "u1", { accepted: true }, "herrin");
    if (res.ok) throw new Error("erwartet: Fehler");
    expect(res.error).toBe("TASK_PROOF_NOT_FOUND");
  });

  /**
   * Der Poller hat seine Meldung („bitte sichten") längst abgegeben und die Zeile dabei gestempelt —
   * er sieht sie nie wieder. Das ERGEBNIS muss deshalb von der Handlung kommen, die es herbeiführt.
   */
  it("steht die Aufgabe danach fest, geht die ERGEBNIS-Meldung raus (geteilter Helfer)", async () => {
    find.mockResolvedValue(submitted());
    evaluatedAs("done");
    await reviewTaskProof("p1", "u1", { accepted: true }, "herrin");
    expect(notifyResult).toHaveBeenCalledWith(expect.objectContaining({ taskId: "t1", done: true }));
    // Der Sub bekommt NICHT zusätzlich die Sichtungs-Meldung — das Ergebnis ist die Nachricht.
    expect(notify).not.toHaveBeenCalled();
  });

  it("Ablehnung meldet den Fehlschlag", async () => {
    find.mockResolvedValue(submitted());
    evaluatedAs("missed");
    await reviewTaskProof("p1", "u1", { accepted: false }, "herrin");
    expect(notifyResult).toHaveBeenCalledWith(expect.objectContaining({ done: false }));
  });

  /**
   * REGRESSION: Ein korrigiertes Urteil MUSS eine neue Zeile im Posteingang bekommen.
   *
   * Der Poller setzt `once`, damit ein Retry nach einem Absturz keine zweite Zeile hinterlässt. Für
   * die Sichtung wäre dieselbe Sperre falsch: nach „abgelehnt → doch angenommen" verschluckte sie
   * die Korrektur, und als letzte Zeile bliebe das falsche Ergebnis stehen.
   */
  it("REGRESSION: die Sichtung setzt KEIN `once` — sonst bliebe die Korrektur unsichtbar", async () => {
    find.mockResolvedValue(submitted());
    evaluatedAs("done");
    await reviewTaskProof("p1", "u1", { accepted: true }, "herrin");
    expect(notifyResult).toHaveBeenCalledWith(expect.objectContaining({ once: false }));
  });

  /** Frist läuft noch oder ein anderer Nachweis fehlt: es GIBT noch kein Ergebnis. */
  it("steht sie noch nicht fest, erfährt nur der Sub von der Sichtung", async () => {
    find.mockResolvedValue(submitted());
    evaluatedAs("awaitingReview");
    await reviewTaskProof("p1", "u1", { accepted: true }, "herrin");
    expect(notify.mock.calls[0][1].subjectKey).toBe("taskProofAcceptedSubject");
    expect(notifyResult).not.toHaveBeenCalled();
  });

  /** Die Sichtung IST geschrieben — eine gescheiterte Meldung darf sie nicht mitreissen. */
  it("eine gescheiterte Meldung lässt das Urteil stehen", async () => {
    find.mockResolvedValue(submitted());
    evaluate.mockRejectedValue(new Error("Auswertung kaputt"));
    const res = await reviewTaskProof("p1", "u1", { accepted: true }, "herrin");
    expect(res.ok).toBe(true);
    expect(updateOne).toHaveBeenCalled();
  });
});
