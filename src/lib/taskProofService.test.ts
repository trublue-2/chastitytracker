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
    task: { findMany: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    user: { findUnique: vi.fn() },
  },
}));
vi.mock("@/lib/verifyCode", () => ({ verifyKontrolleCodeDetailed: vi.fn() }));
vi.mock("@/lib/serverLog", () => ({ structuredLog: vi.fn() }));
vi.mock("@/lib/notify", () => ({ notifyUser: vi.fn(), notifyControllers: vi.fn() }));
vi.mock("@/lib/keyholder", () => ({ getControllerAudience: vi.fn(async () => ({ controllers: [{ id: "kh1" }], username: "sub" })) }));
vi.mock("@/lib/notificationPrefs", () => ({ getEventChannels: vi.fn(async () => ({ mail: true, push: true })) }));
// Nur `evaluateTaskById` festnageln, der Rest bleibt ECHT: `SUB_VISIBLE_WHERE` hängt am Einreiche-Pfad
// und wird unten geprüft. Als Attrappe (`{}` oder eine abgeschriebene Kopie) prüfte der Test die
// Attrappe statt die Regel — grün, während das Fragment fehlt oder veraltet ist.
vi.mock("@/lib/taskIntervals", async (orig) => ({ ...(await orig<object>()), evaluateTaskById: vi.fn() }));
// Der Sichtungs-Pfad verbucht über den geteilten Helfer; WAS der verbucht, prüft
// `taskService.test.ts`. Hier zählt, ob er gerufen wird — und was der Pfad tut, wenn die Aufgabe
// danach noch nicht feststeht.
vi.mock("@/lib/taskService", () => ({ settleIfFinal: vi.fn(async () => "notFinal") }));

import { submitTaskProof, proofVerificationOutcome, proofSubmitBlockedReason, proofReviewBlockedReason, reviewTaskProof } from "./taskProofService";
import { notifyUser, notifyControllers } from "@/lib/notify";
import { evaluateTaskById } from "@/lib/taskIntervals";
import { settleIfFinal } from "@/lib/taskService";
import { prisma } from "@/lib/prisma";
import { verifyKontrolleCodeDetailed } from "@/lib/verifyCode";

const find = prisma.taskProof.findFirst as unknown as ReturnType<typeof vi.fn>;
const update = prisma.taskProof.updateMany as unknown as ReturnType<typeof vi.fn>;
const updateOne = prisma.taskProof.update as unknown as ReturnType<typeof vi.fn>;
const verify = verifyKontrolleCodeDetailed as unknown as ReturnType<typeof vi.fn>;
const notify = notifyUser as unknown as ReturnType<typeof vi.fn>;
const notifyKh = notifyControllers as unknown as ReturnType<typeof vi.fn>;
const evaluate = evaluateTaskById as unknown as ReturnType<typeof vi.fn>;
const taskFindMany = prisma.task.findMany as unknown as ReturnType<typeof vi.fn>;
const taskUpdate = prisma.task.update as unknown as ReturnType<typeof vi.fn>;
const taskUpdateMany = prisma.task.updateMany as unknown as ReturnType<typeof vi.fn>;
const settle = settleIfFinal as unknown as ReturnType<typeof vi.fn>;

const NOW = new Date("2026-07-25T14:00:00Z");
const HOLD_UNTIL = new Date("2026-07-25T18:00:00Z");
const PAYLOAD = { imageUrl: "/api/uploads/x.jpg", imageExifTime: new Date("2026-07-25T13:50:00Z") };

/** Die Aufgabe dahinter — Nullpunkt `NOW`, Ende vier Stunden später. */
const TASK = {
  id: "t1",
  title: "Einkaufen",
  withdrawnAt: null as Date | null,
  holdUntil: HOLD_UNTIL,
  holdDurationMin: null as number | null,
  createdAt: NOW,
  wirksamAb: null as Date | null,
};

/** Ein offener Nachweis ohne Code-Pflicht — der einfachste Fall. */
const proofRow = (over: Record<string, unknown> = {}) => ({
  id: "p1",
  requireCode: false,
  code: null,
  submittedAt: null,
  dueOffsetMin: null,
  lateNotifiedAt: null,
  task: TASK,
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
    find.mockResolvedValue(proofRow({ task: { ...TASK, withdrawnAt: NOW } }));
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
    find.mockResolvedValue(proofRow({ task: { ...TASK, holdDurationMin: 60 } }));
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

describe("proofReviewBlockedReason — geteilt von Service und dryRun-Vorschau", () => {
  /** Ein eingereichter Nachweis an einer offenen Aufgabe: nichts steht der Sichtung im Weg. */
  const proof = { submittedAt: NOW };
  const task = { withdrawnAt: null };

  it("eingereicht und die Aufgabe offen: nichts steht im Weg", () => {
    expect(proofReviewBlockedReason(proof, task)).toBeNull();
  });

  it("nennt jeden Hinderungsgrund beim Namen", () => {
    expect(proofReviewBlockedReason(proof, { withdrawnAt: NOW })).toBe("TASK_NOT_EDITABLE");
    expect(proofReviewBlockedReason({ submittedAt: null }, task)).toBe("TASK_PROOF_NOT_SUBMITTED");
  });

  /** Sind beide Gründe da, gewinnt der Zustand der AUFGABE: an einer zurückgezogenen Aufgabe ist ein
   *  fehlender Nachweis keine Auskunft, die dem Aufrufer weiterhilft — nachreichen kann er ihn
   *  ohnehin nicht mehr. Die Vorschau erbt diese Reihenfolge, statt eine eigene zu wählen. */
  it("bei zwei Gründen gewinnt der Zustand der Aufgabe", () => {
    expect(proofReviewBlockedReason({ submittedAt: null }, { withdrawnAt: NOW })).toBe("TASK_NOT_EDITABLE");
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

  /**
   * Bis zum Auslösen existiert eine terminierte Aufgabe für den Träger NICHT — samt ihrer Nachweise.
   * Geprüft wird die `where`-Klausel: der Filter MUSS in SQL stehen, sonst lädt der Dienst die Zeile
   * und mit ihr Beschreibung und Code, bevor er sie ablehnt.
   */
  it("ein Nachweis einer noch nicht zugestellten Aufgabe wird gar nicht erst geladen", async () => {
    find.mockResolvedValue(null);
    const res = await submitTaskProof("p1", "u1", PAYLOAD);
    expect(find.mock.calls[0][0].where.task).toMatchObject({
      userId: "u1",
      AND: [{ OR: [{ wirksamAb: null }, { benachrichtigtAt: { not: null } }] }],
    });
    // Ununterscheidbar von einem fremden Nachweis — der Ausgang verrät die Aufgabe nicht.
    expect(res).toMatchObject({ ok: false, status: 404, error: "TASK_PROOF_NOT_FOUND" });
    expect(update).not.toHaveBeenCalled();
  });
});

/**
 * Die Verdrahtung — das eine, was `taskProofNotify.test.ts` nicht zeigen kann: dass
 * `submitTaskProof` die Meldung überhaupt anstösst. Ob sie im Einzelfall feuert, ist dort geprüft.
 *
 * `vi.waitFor`, weil der Aufruf bewusst NICHT awaited wird (SMTP gehört nicht in den Upload des
 * Trägers). Der Test wartet damit auf dieselbe Weise wie die Wirklichkeit: die Antwort ist da,
 * die Meldung kommt gleich.
 */
describe("submitTaskProof — die Verspätung wird gemeldet", () => {
  it("ein nach seiner Frist eingereichtes Foto meldet sich bei den Keyholdern", async () => {
    vi.setSystemTime(new Date("2026-07-25T16:00:00Z"));
    find.mockResolvedValue(proofRow({ dueOffsetMin: 60 }));
    await submitTaskProof("p1", "u1", PAYLOAD);
    await vi.waitFor(() => expect(notifyKh.mock.calls[0][2].messageKey).toBe("taskProofLateMessageKeyholder"));
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
  /** Was der geteilte Helfer über die Aufgabe berichtet — „steht fest" gegen „läuft noch". */
  const settlesAs = (outcome: "settled" | "notFinal" | "gone") => settle.mockResolvedValue(outcome);

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
  it("steht die Aufgabe danach fest, verbucht der geteilte Helfer sie", async () => {
    find.mockResolvedValue(submitted());
    settlesAs("settled");
    await reviewTaskProof("p1", "u1", { accepted: true }, "herrin");
    expect(settle).toHaveBeenCalledWith("u1", "t1", false);
    // Der Sub bekommt NICHT zusätzlich die Sichtungs-Meldung — das Ergebnis ist die Nachricht.
    expect(notify).not.toHaveBeenCalled();
  });

  it("eine verschwundene Aufgabe meldet gar nichts", async () => {
    find.mockResolvedValue(submitted());
    settlesAs("gone");
    await reviewTaskProof("p1", "u1", { accepted: true }, "herrin");
    expect(notify).not.toHaveBeenCalled();
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
    settlesAs("settled");
    await reviewTaskProof("p1", "u1", { accepted: true }, "herrin");
    // Drittes Argument: `once`. Die Selbstmeldung setzt es, die Sichtung nicht.
    expect(settle).toHaveBeenCalledWith("u1", "t1", false);
  });

  /** Frist läuft noch oder ein anderer Nachweis fehlt: es GIBT noch kein Ergebnis. */
  it("steht sie noch nicht fest, erfährt nur der Sub von der Sichtung", async () => {
    find.mockResolvedValue(submitted());
    settlesAs("notFinal");
    await reviewTaskProof("p1", "u1", { accepted: true }, "herrin");
    expect(notify.mock.calls[0][1].subjectKey).toBe("taskProofAcceptedSubject");
  });

  /**
   * REGRESSION: Ein korrigiertes Urteil, das die Aufgabe wieder OFFEN macht, muss den
   * Ergebnis-Stempel zurücknehmen.
   *
   * `resultNotifiedAt` ist das Einweg-Tor des Pollers — er wählt über `resultNotifiedAt: null`.
   * Seit eine Ablehnung die Aufgabe schon mitten in der Haltefrist entscheidet, kann sie gemeldet
   * UND gestempelt sein, während ihre Frist noch stundenlang läuft. Bleibt der Stempel nach der
   * Korrektur stehen, sieht der Poller die Zeile nie wieder: kein Ergebnis für den Träger, und eine
   * Strafaufgabe schliesst ihre Strafe nicht ab.
   */
  it("REGRESSION: wird sie wieder offen, fällt der Ergebnis-Stempel weg", async () => {
    find.mockResolvedValue(submitted());
    settlesAs("notFinal");
    await reviewTaskProof("p1", "u1", { accepted: true }, "herrin");
    expect(taskUpdateMany).toHaveBeenCalledWith({
      where: { id: "t1", userId: "u1", resultNotifiedAt: { not: null } },
      data: { resultNotifiedAt: null },
    });
  });

  /** Steht sie dagegen FEST, gehört der Stempel genau dorthin — nichts zurückzunehmen. */
  it("eine entschiedene Aufgabe behält ihren Stempel", async () => {
    find.mockResolvedValue(submitted());
    settlesAs("settled");
    await reviewTaskProof("p1", "u1", { accepted: true }, "herrin");
    expect(taskUpdateMany).not.toHaveBeenCalled();
  });

  /** Die Sichtung IST geschrieben — eine gescheiterte Meldung darf sie nicht mitreissen. */
  it("eine gescheiterte Meldung lässt das Urteil stehen", async () => {
    find.mockResolvedValue(submitted());
    settle.mockRejectedValue(new Error("Auswertung kaputt"));
    const res = await reviewTaskProof("p1", "u1", { accepted: true }, "herrin");
    expect(res.ok).toBe(true);
    expect(updateOne).toHaveBeenCalled();
  });
});
