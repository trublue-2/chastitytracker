import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Bestrafen durch eine Aufgabe — die Zusicherung ist, dass Urteil und Aufgabe ZUSAMMEN entstehen
 * oder gar nicht.
 *
 * Nacheinander geschrieben liesse ein Abbruch dazwischen eine Strafaufgabe beim Sub stehen, über die
 * nie jemand geurteilt hat: der Keyholder sähe das Vergehen weiter als offen und bestrafte dasselbe
 * ein zweites Mal. Dazu die zweite Zusicherung: wird ein Urteil ERSETZT, verschwindet die alte
 * Strafaufgabe — sonst läuft sie weiter und erzeugt beim Verstreichen ihrer Frist ein neues
 * Vergehen, das niemand begangen hat.
 */

const tx = {
  strafeRecord: { upsert: vi.fn(), deleteMany: vi.fn() },
  task: { updateMany: vi.fn() },
  // Die Rücknahme löscht auch die „fallengelassen"-Meldung; hier zählt nur, dass sie es TUT —
  // wogegen genau, prüft `offenseDismissedNotice.test.ts` an der echten Zeile.
  message: { deleteMany: vi.fn() },
};
vi.mock("@/lib/prisma", () => ({
  prisma: { $transaction: vi.fn(async (fn: (c: typeof tx) => Promise<unknown>) => fn(tx)) },
}));
// `collectDetectedOffenses` leitet die refs aus OFFENSE_LISTS ab — der Mock muss die Tabelle
// mitliefern, sonst prüft der Test eine Auflösung, die es so nicht gibt. Die echte Tabelle ist
// reine Daten (keine DB), also wird sie durchgereicht statt nachgebaut.
vi.mock("@/lib/strafbuch", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/strafbuch")>()),
  buildStrafbuch: vi.fn(),
}));
vi.mock("@/lib/taskService", () => ({ checkTask: vi.fn(), writeTask: vi.fn() }));
vi.mock("@/lib/notify", () => ({ notifyUser: vi.fn() }));
vi.mock("@/lib/appMeta", () => ({ markLastAction: vi.fn() }));

import { punishWithTask, judgeOffense } from "./strafurteilService";
import { buildStrafbuch } from "@/lib/strafbuch";
import { checkTask, writeTask } from "@/lib/taskService";
import { notifyUser } from "@/lib/notify";
import { emptyOffenseLists } from "@/test/strafbuchFixture";

const strafbuch = buildStrafbuch as unknown as ReturnType<typeof vi.fn>;
const check = checkTask as unknown as ReturnType<typeof vi.fn>;
const write = writeTask as unknown as ReturnType<typeof vi.fn>;
const notify = notifyUser as unknown as ReturnType<typeof vi.fn>;

/** Ein Strafbuch, das genau ein Vergehen kennt: eine nicht erfüllte Aufgabe mit `refId` „t-1". */
function strafbuchWith(refId: string) {
  return {
    ...emptyOffenseLists(),
    unfulfilledTasks: [{ id: refId, holdUntil: new Date("2026-08-01T10:00:00Z"), failedAt: null }],
  };
}

const HOLD_UNTIL = new Date("2026-08-03T18:00:00Z");
const PARAMS = {
  userId: "u1",
  refId: "t-1",
  actor: "herrin",
  title: "Wohnung staubsaugen",
  holdUntil: HOLD_UNTIL,
};

beforeEach(() => {
  vi.clearAllMocks();
  strafbuch.mockResolvedValue(strafbuchWith("t-1"));
  tx.strafeRecord.upsert.mockResolvedValue({ id: "s1" });
  tx.strafeRecord.deleteMany.mockResolvedValue({ count: 1 });
  check.mockResolvedValue({ ok: true, data: { data: {} } });
  write.mockResolvedValue({ id: "task-9", title: "Wohnung staubsaugen", holdUntil: HOLD_UNTIL });
});

describe("punishWithTask", () => {
  it("legt Aufgabe und Urteil an und meldet EINE Nachricht", async () => {
    const res = await punishWithTask(PARAMS, "herrin");

    expect(res).toEqual({ ok: true, data: { id: "task-9" } });
    // Geprüft wird VOR der Transaktion (ein Dutzend Abfragen, die nichts festschreiben),
    // geschrieben darin.
    expect(check).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ isPunishment: true }));
    expect(write).toHaveBeenCalledWith(tx, expect.anything());
    // Das Urteil trägt die Aufgabe — das ist die Verbindung, auf der alles Weitere aufbaut.
    const upsert = tx.strafeRecord.upsert.mock.calls[0][0];
    expect(upsert.where).toEqual({ refId: "t-1" });
    expect(upsert.create).toMatchObject({ status: "PUNISHED", taskId: "task-9", reason: "Wohnung staubsaugen" });
    expect(upsert.update).toMatchObject({ status: "PUNISHED", taskId: "task-9", erledigtAt: null });
    // GENAU eine Nachricht: die Strafe IST die Aufgabe.
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0][1]).toMatchObject({ messageKey: "penaltyTaskMessage" });
  });

  it("zieht die ersetzte Strafaufgabe zurück, statt sie weiterlaufen zu lassen", async () => {
    await punishWithTask(PARAMS, "herrin");

    // Über die Beziehung, nicht über eine vorher gelesene id — die NEUE Aufgabe ist zu diesem
    // Zeitpunkt noch nicht verknüpft, getroffen wird also nur die alte.
    expect(tx.task.updateMany).toHaveBeenCalledWith({
      where: { userId: "u1", withdrawnAt: null, strafeRecords: { some: { refId: "t-1" } } },
      data: { withdrawnAt: expect.any(Date) },
    });
  });

  it("nimmt bei einer Rücknahme die Strafaufgabe mit", async () => {
    // Bliebe sie stehen, forderte die App weiter eine Strafe ein, die es nicht mehr gibt — und ihr
    // Verstreichen wäre später ein neues Vergehen, das niemand begangen hat.
    const res = await judgeOffense({ userId: "u1", refId: "t-1", action: "reopen" }, "herrin");

    expect(res).toEqual({ ok: true, data: { status: "open", done: false } });
    expect(tx.task.updateMany).toHaveBeenCalledWith({
      where: { userId: "u1", withdrawnAt: null, strafeRecords: { some: { refId: "t-1" } } },
      data: { withdrawnAt: expect.any(Date) },
    });
    expect(tx.strafeRecord.deleteMany).toHaveBeenCalledWith({ where: { userId: "u1", refId: "t-1" } });
  });

  it("urteilt nicht über ein Vergehen, das gar nicht erkannt ist", async () => {
    const res = await punishWithTask({ ...PARAMS, refId: "fremd" }, "herrin");

    expect(res).toEqual({ ok: false, status: 404, error: "OFFENSE_NOT_FOUND" });
    expect(check).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it("gibt die Ablehnung des Formulars durch und schreibt kein Urteil", async () => {
    // Der Grund muss den Keyholder im Klartext erreichen — nicht als generischer Transaktionsfehler.
    check.mockResolvedValue({ ok: false, status: 400, error: "TASK_HOLD_UNTIL_TOO_SOON" });

    const res = await punishWithTask(PARAMS, "herrin");

    expect(res).toEqual({ ok: false, status: 400, error: "TASK_HOLD_UNTIL_TOO_SOON" });
    expect(tx.strafeRecord.upsert).not.toHaveBeenCalled();
    // Keine Nachricht über eine Strafe, die es nicht gibt.
    expect(notify).not.toHaveBeenCalled();
  });
});
