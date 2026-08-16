import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Zwei Wege führen zu derselben Verspätung — daher die zwei Blöcke unten: ein Foto kommt nach seiner
 * Frist (`submitTaskProof`), oder die Frist rückt unter einem längst eingereichten Foto nach vorn
 * (`updateTask`). Warum es diese Meldung überhaupt braucht, steht am Modul selbst.
 */

vi.mock("@/lib/prisma", () => ({
  prisma: {
    taskProof: { findMany: vi.fn(), update: vi.fn() },
    user: { findUnique: vi.fn() },
  },
}));
vi.mock("@/lib/serverLog", () => ({ structuredLog: vi.fn() }));
vi.mock("@/lib/notify", () => ({ notifyControllers: vi.fn() }));
vi.mock("@/lib/keyholder", () => ({
  getControllerAudience: vi.fn(async () => ({ controllers: [{ id: "kh1" }], username: "sub" })),
}));
vi.mock("@/lib/notificationPrefs", () => ({ getEventChannels: vi.fn(async () => ({ mail: true, push: true })) }));

import { notifyLateProof, notifyLateProofsForTask } from "./taskProofNotify";
import { notifyControllers } from "@/lib/notify";
import { getControllerAudience } from "@/lib/keyholder";
import { prisma } from "@/lib/prisma";

const notifyKh = notifyControllers as unknown as ReturnType<typeof vi.fn>;
const audience = getControllerAudience as unknown as ReturnType<typeof vi.fn>;
const updateOne = prisma.taskProof.update as unknown as ReturnType<typeof vi.fn>;
const findProofs = prisma.taskProof.findMany as unknown as ReturnType<typeof vi.fn>;

const NOW = new Date("2026-07-25T14:00:00Z");
const HOLD_UNTIL = new Date("2026-07-25T18:00:00Z");

/** Die Aufgabe dahinter — Nullpunkt `NOW`, Ende vier Stunden später. */
const TASK = { id: "t1", title: "Einkaufen", holdUntil: HOLD_UNTIL, createdAt: NOW, wirksamAb: null };

/** Fälligkeit 60 Minuten nach dem Nullpunkt (= 15:00), eingereicht um 16:00. */
const lateProof = (over: Record<string, unknown> = {}) => ({
  id: "p1",
  dueOffsetMin: 60,
  submittedAt: new Date("2026-07-25T16:00:00Z"),
  lateNotifiedAt: null as Date | null,
  task: TASK,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  updateOne.mockResolvedValue({});
  (prisma.user.findUnique as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ username: "sub" });
});

describe("notifyLateProof — ein verspäteter Nachweis wartet auf ein Urteil", () => {
  it("meldet den Keyholdern, dass ein verspätetes Foto auf ihr Urteil wartet", async () => {
    await notifyLateProof(lateProof(), "u1");
    expect(notifyKh).toHaveBeenCalledWith("u1", [{ id: "kh1" }], expect.objectContaining({
      messageKey: "taskProofLateMessageKeyholder",
      params: { username: "sub", title: "Einkaufen" },
    }));
  });

  /** Der Bezug ist die AUFGABE — dorthin führt der Weg zur Sichtung. */
  it("die Posteingangs-Zeile zeigt auf die Aufgabe", async () => {
    await notifyLateProof(lateProof(), "u1");
    expect(notifyKh.mock.calls[0][2].inbox).toEqual({ ref: { type: "task", id: "t1" } });
  });

  /** Erst zustellen, dann stempeln — ein Fehlschlag darf die Meldung nicht als erledigt ausweisen. */
  it("stempelt die Zeile NACH dem Versand", async () => {
    await notifyLateProof(lateProof(), "u1");
    expect(updateOne).toHaveBeenCalledWith({ where: { id: "p1" }, data: { lateNotifiedAt: NOW } });
    expect(notifyKh.mock.invocationCallOrder[0]).toBeLessThan(updateOne.mock.invocationCallOrder[0]);
  });

  /**
   * GENAU EINMAL JE NACHWEIS. Der Stempel trägt die Zusage, nicht der abgeleitete Zustand: der wird
   * bei jedem Lesen neu gerechnet und darf rückwärts gehen.
   */
  it("ein zweiter Lauf schweigt", async () => {
    await notifyLateProof(lateProof({ lateNotifiedAt: NOW }), "u1");
    expect(notifyKh).not.toHaveBeenCalled();
    expect(updateOne).not.toHaveBeenCalled();
  });

  /** Rechtzeitig eingereicht: darüber meldet der Minuten-Tick („bitte sichten"), nicht dieser Weg —
   *  sonst bekäme die Keyholderin zu jedem Nachweis zwei Meldungen. */
  it("ein rechtzeitiger Nachweis löst nichts aus", async () => {
    await notifyLateProof(lateProof({ submittedAt: new Date("2026-07-25T14:30:00Z") }), "u1");
    expect(notifyKh).not.toHaveBeenCalled();
  });

  /** Ohne eigene Fälligkeit ist die Frist das Ende der Aufgabe — und danach wird gar nichts mehr
   *  angenommen. Ein solcher Nachweis kann auf dem EINREICHE-Weg nie verspätet sein. */
  it("ohne eigene Fälligkeit gibt es auf dem Einreiche-Weg keine Verspätung", async () => {
    await notifyLateProof(lateProof({ dueOffsetMin: null }), "u1");
    expect(notifyKh).not.toHaveBeenCalled();
  });

  /** Der Nachweis IST eingereicht — eine gescheiterte Meldung darf das nicht mitreissen. */
  it("wirft nie", async () => {
    notifyKh.mockRejectedValueOnce(new Error("SMTP weg"));
    await expect(notifyLateProof(lateProof(), "u1")).resolves.toBeUndefined();
    expect(updateOne).not.toHaveBeenCalled();
  });
});

/**
 * DER ZWEITE WEG ZUR VERSPÄTUNG — und bis hierher der unbemerkte.
 *
 * Die Keyholderin zieht das Ende der Aufgabe nach vorn; ein längst eingereichtes Foto liegt damit
 * hinter seiner Frist. Für sie ist der Ausgang derselbe wie bei einem verspäteten Upload — der
 * Nachweis zählt nur noch über ihre Annahme —, also gehört auch dieselbe Meldung dazu. Ohne sie
 * fiele der Nachweis still, und zwar durch ihre eigene Änderung.
 */
describe("notifyLateProofsForTask — die Frist rückt unter dem Nachweis nach vorn", () => {
  /** Eingereicht um 16:00, ohne eigene Fälligkeit: gemessen wird gegen das Ende der Aufgabe. */
  const submittedAt16 = { id: "p1", dueOffsetMin: null, submittedAt: new Date("2026-07-25T16:00:00Z"), lateNotifiedAt: null };

  it("meldet einen Nachweis, der durch das vorgezogene Ende zu spät wurde", async () => {
    findProofs.mockResolvedValue([submittedAt16]);
    await notifyLateProofsForTask({ ...TASK, holdUntil: new Date("2026-07-25T15:00:00Z") }, "u1");
    expect(notifyKh.mock.calls[0][2].messageKey).toBe("taskProofLateMessageKeyholder");
    expect(updateOne).toHaveBeenCalledWith({ where: { id: "p1" }, data: { lateNotifiedAt: NOW } });
  });

  /** Das Ende bewegt sich, aber der Nachweis liegt weiter davor: nichts ist zu melden. */
  it("ein weiterhin rechtzeitiger Nachweis löst nichts aus", async () => {
    findProofs.mockResolvedValue([submittedAt16]);
    await notifyLateProofsForTask({ ...TASK, holdUntil: new Date("2026-07-25T17:00:00Z") }, "u1");
    expect(notifyKh).not.toHaveBeenCalled();
  });

  /** Nur eingereichte und noch nicht gemeldete Zeilen — die Zusage „genau einmal je Nachweis" gilt
   *  über beide Wege hinweg, sonst käme sie nach einem Hin und Her der Frist ein zweites Mal. */
  it("holt nur eingereichte, noch nicht gemeldete Nachweise", async () => {
    findProofs.mockResolvedValue([]);
    await notifyLateProofsForTask(TASK, "u1");
    expect(findProofs.mock.calls[0][0].where).toMatchObject({
      taskId: "t1",
      submittedAt: { not: null },
      lateNotifiedAt: null,
    });
  });

  it("meldet jeden betroffenen Nachweis einzeln — jeder braucht sein eigenes Urteil", async () => {
    findProofs.mockResolvedValue([submittedAt16, { ...submittedAt16, id: "p2" }]);
    await notifyLateProofsForTask({ ...TASK, holdUntil: new Date("2026-07-25T15:00:00Z") }, "u1");
    expect(notifyKh).toHaveBeenCalledTimes(2);
    expect(updateOne.mock.calls.map((c) => c[0].where.id)).toEqual(["p1", "p2"]);
  });

  /** Empfänger, Anzeigename und Schalter hängen am TRÄGER, nicht am einzelnen Nachweis — je Nachweis
   *  geladen wären es bei drei betroffenen Fotos dreimal dieselbe Antwort. */
  it("holt Empfänger und Schalter EINMAL, nicht je Nachweis", async () => {
    findProofs.mockResolvedValue([submittedAt16, { ...submittedAt16, id: "p2" }]);
    await notifyLateProofsForTask({ ...TASK, holdUntil: new Date("2026-07-25T15:00:00Z") }, "u1");
    expect(audience).toHaveBeenCalledOnce();
  });

  /** Und gar nicht, wenn niemand betroffen ist: die vorgezogene Frist trifft oft keinen Nachweis. */
  it("lädt nichts, solange kein Nachweis verspätet ist", async () => {
    findProofs.mockResolvedValue([submittedAt16]);
    await notifyLateProofsForTask({ ...TASK, holdUntil: new Date("2026-07-25T17:00:00Z") }, "u1");
    expect(audience).not.toHaveBeenCalled();
  });

  /** Die Änderung der Aufgabe IST geschrieben — eine gescheiterte Meldung darf sie nicht mitreissen. */
  it("wirft nie", async () => {
    findProofs.mockRejectedValue(new Error("db weg"));
    await expect(notifyLateProofsForTask(TASK, "u1")).resolves.toBeUndefined();
  });
});
