import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Der Einreiche-Pfad des Subs (Issue #39, Etappe 3).
 *
 * Die Schranken hier tragen die Anforderung: ohne sie liesse sich ein Nachweis nachliefern, ein
 * ungünstiges Foto austauschen oder ein fremder Nachweis bespielen — und die Reihenfolge-Prüfung,
 * um die es in #39 überhaupt geht, wäre in jedem dieser Fälle wertlos.
 */

vi.mock("@/lib/prisma", () => ({
  prisma: { taskProof: { findFirst: vi.fn(), updateMany: vi.fn(), update: vi.fn() } },
}));
vi.mock("@/lib/verifyCode", () => ({ verifyKontrolleCodeDetailed: vi.fn() }));
vi.mock("@/lib/serverLog", () => ({ structuredLog: vi.fn() }));

import { submitTaskProof, proofVerificationOutcome, proofSubmitBlockedReason } from "./taskProofService";
import { prisma } from "@/lib/prisma";
import { verifyKontrolleCodeDetailed } from "@/lib/verifyCode";

const find = prisma.taskProof.findFirst as unknown as ReturnType<typeof vi.fn>;
const update = prisma.taskProof.updateMany as unknown as ReturnType<typeof vi.fn>;
const updateOne = prisma.taskProof.update as unknown as ReturnType<typeof vi.fn>;
const verify = verifyKontrolleCodeDetailed as unknown as ReturnType<typeof vi.fn>;

const NOW = new Date("2026-07-25T14:00:00Z");
const HOLD_UNTIL = new Date("2026-07-25T18:00:00Z");
const PAYLOAD = { imageUrl: "/api/uploads/x.jpg", imageExifTime: new Date("2026-07-25T13:50:00Z") };

/** Ein offener Nachweis ohne Code-Pflicht — der einfachste Fall. */
const proofRow = (over: Record<string, unknown> = {}) => ({
  id: "p1",
  requireCode: false,
  code: null,
  submittedAt: null,
  task: { id: "t1", withdrawnAt: null, holdUntil: HOLD_UNTIL },
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
    find.mockResolvedValue(proofRow({ task: { id: "t1", withdrawnAt: NOW, holdUntil: HOLD_UNTIL } }));
    const res = await submitTaskProof("p1", "u1", PAYLOAD);
    if (res.ok) throw new Error("erwartet: Fehler");
    expect(res.error).toBe("TASK_NOT_EDITABLE");
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

describe("proofSubmitBlockedReason — geteilt von Seite und Service", () => {
  const open = { submittedAt: null, task: { withdrawnAt: null, holdUntil: HOLD_UNTIL } };

  it("offen und fristgerecht: nichts steht im Weg", () => {
    expect(proofSubmitBlockedReason(open, NOW)).toBeNull();
  });

  it("nennt jeden Hinderungsgrund beim Namen", () => {
    expect(proofSubmitBlockedReason({ ...open, submittedAt: NOW }, NOW)).toBe("TASK_PROOF_ALREADY_SUBMITTED");
    expect(proofSubmitBlockedReason({ ...open, task: { withdrawnAt: NOW, holdUntil: HOLD_UNTIL } }, NOW)).toBe("TASK_NOT_EDITABLE");
    expect(proofSubmitBlockedReason(open, new Date("2026-07-25T19:00:00Z"))).toBe("TASK_PROOF_TOO_LATE");
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
