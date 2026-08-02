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
  strafeRecord: { findUnique: vi.fn(), upsert: vi.fn(), delete: vi.fn() },
  task: { updateMany: vi.fn() },
};
vi.mock("@/lib/prisma", () => ({
  prisma: {
    // Der echte `$transaction` rollt bei einem Wurf zurück; hier genügt es, den Wurf durchzulassen
    // und zu prüfen, dass der Aufrufer ihn als Ablehnung des Formulars zurückgibt.
    $transaction: vi.fn(async (fn: (c: typeof tx) => Promise<unknown>) => fn(tx)),
    strafeRecord: { deleteMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  },
}));
vi.mock("@/lib/strafbuch", () => ({ buildStrafbuch: vi.fn() }));
vi.mock("@/lib/taskService", () => ({ createTaskTx: vi.fn() }));
vi.mock("@/lib/notify", () => ({ notifyUser: vi.fn() }));
vi.mock("@/lib/appMeta", () => ({ markLastAction: vi.fn() }));
vi.mock("@/lib/messageService", () => ({ senderKindOf: () => "human" }));

import { punishWithTask, judgeOffense } from "./strafurteilService";
import { buildStrafbuch } from "@/lib/strafbuch";
import { createTaskTx } from "@/lib/taskService";
import { notifyUser } from "@/lib/notify";

const strafbuch = buildStrafbuch as unknown as ReturnType<typeof vi.fn>;
const create = createTaskTx as unknown as ReturnType<typeof vi.fn>;
const notify = notifyUser as unknown as ReturnType<typeof vi.fn>;

/** Ein Strafbuch, das genau ein Vergehen kennt: eine nicht erfüllte Aufgabe mit `refId` „t-1". */
function strafbuchWith(refId: string) {
  const empty = {
    unauthorizedOpenings: [], lateControls: [], rejectedControls: [], autoRemovedControls: [],
    reinigungLimitViolations: [], wrongDeviceViolations: [], missedOrgasmInstructions: [],
    lateLocks: [], cleaningNotRelocked: [], adminPasswordChanges: [],
  };
  return { ...empty, unfulfilledTasks: [{ id: refId, holdUntil: new Date("2026-08-01T10:00:00Z"), failedAt: null }] };
}

const HOLD_UNTIL = new Date("2026-08-03T18:00:00Z");
const PARAMS = {
  userId: "u1",
  refId: "t-1",
  judgedBy: "admin" as const,
  title: "Wohnung staubsaugen",
  holdUntil: HOLD_UNTIL,
};

beforeEach(() => {
  vi.clearAllMocks();
  strafbuch.mockResolvedValue(strafbuchWith("t-1"));
  tx.strafeRecord.findUnique.mockResolvedValue(null);
  tx.strafeRecord.upsert.mockResolvedValue({ id: "s1" });
  create.mockResolvedValue({ ok: true, data: { id: "task-9", title: "Wohnung staubsaugen", holdUntil: HOLD_UNTIL } });
});

describe("punishWithTask", () => {
  it("legt Aufgabe und Urteil an und meldet EINE Nachricht", async () => {
    const res = await punishWithTask(PARAMS);

    expect(res).toEqual({ ok: true, data: { id: "task-9" } });
    // Die Aufgabe wird als Strafe angelegt — im Schreib-Client der Transaktion, als erstes Argument.
    expect(create).toHaveBeenCalledWith(tx, expect.objectContaining({ isPunishment: true }));
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
    tx.strafeRecord.findUnique.mockResolvedValue({ userId: "u1", taskId: "task-alt" });

    await punishWithTask(PARAMS);

    expect(tx.task.updateMany).toHaveBeenCalledWith({
      where: { id: "task-alt", userId: "u1", withdrawnAt: null },
      data: { withdrawnAt: expect.any(Date) },
    });
  });

  it("nimmt bei einer Rücknahme die Strafaufgabe mit", async () => {
    // Bliebe sie stehen, forderte die App weiter eine Strafe ein, die es nicht mehr gibt — und ihr
    // Verstreichen wäre später ein neues Vergehen, das niemand begangen hat.
    tx.strafeRecord.findUnique.mockResolvedValue({ userId: "u1", taskId: "task-9" });

    const res = await judgeOffense({ userId: "u1", refId: "t-1", action: "reopen", judgedBy: "admin" });

    expect(res).toEqual({ ok: true, data: { status: "open", done: false } });
    expect(tx.task.updateMany).toHaveBeenCalledWith({
      where: { id: "task-9", userId: "u1", withdrawnAt: null },
      data: { withdrawnAt: expect.any(Date) },
    });
    expect(tx.strafeRecord.delete).toHaveBeenCalledWith({ where: { refId: "t-1" } });
  });

  it("urteilt nicht über ein Vergehen, das gar nicht erkannt ist", async () => {
    const res = await punishWithTask({ ...PARAMS, refId: "fremd" });

    expect(res).toEqual({ ok: false, status: 404, error: "OFFENSE_NOT_FOUND" });
    expect(create).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it("gibt die Ablehnung des Formulars durch und schreibt kein Urteil", async () => {
    // Der Grund muss den Keyholder im Klartext erreichen — nicht als generischer Transaktionsfehler.
    create.mockResolvedValue({ ok: false, status: 400, error: "TASK_HOLD_UNTIL_TOO_SOON" });

    const res = await punishWithTask(PARAMS);

    expect(res).toEqual({ ok: false, status: 400, error: "TASK_HOLD_UNTIL_TOO_SOON" });
    expect(tx.strafeRecord.upsert).not.toHaveBeenCalled();
    // Keine Nachricht über eine Strafe, die es nicht gibt.
    expect(notify).not.toHaveBeenCalled();
  });
});
