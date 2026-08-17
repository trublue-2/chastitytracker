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
  // `findMany` vor dem Löschen: die Rücknahme braucht die id des Urteils, um auch die
  // „Strafe verhängt"-Meldung mitzunehmen (die zeigt auf das URTEIL, nicht auf das Vergehen).
  strafeRecord: { create: vi.fn(), upsert: vi.fn(), findMany: vi.fn(), deleteMany: vi.fn() },
  task: { updateMany: vi.fn() },
  // Die Rücknahme löscht auch die „fallengelassen"-Meldung; hier zählt nur, dass sie es TUT —
  // wogegen genau, prüft `offenseDismissedNotice.test.ts` an der echten Zeile.
  message: { deleteMany: vi.fn() },
};
vi.mock("@/lib/prisma", () => ({
  prisma: { $transaction: vi.fn(async (fn: (c: typeof tx) => Promise<unknown>) => fn(tx)) },
}));
// Der Browser-Eingang dieses Vorgangs (`POST /api/admin/tasks`) läuft hier mit — er trägt dieselben
// zwei Regeln wie die Strafbuch-Route, und geprüft wird, dass er sie WIRKLICH setzt.
vi.mock("@/lib/auth", () => ({ auth: vi.fn(async () => ({ user: { id: "kh1", role: "admin", name: "herrin" } })) }));
vi.mock("@/lib/keyholder", () => ({
  isKeyholderOf: vi.fn(async () => false),
  getControllableSubsCached: vi.fn(async () => []),
  getControllersOfUser: vi.fn(async () => []),
  getControllerAudience: vi.fn(async () => ({ controllers: [], username: "sub" })),
}));
// `collectDetectedOffenses` leitet die refs aus OFFENSE_LISTS ab — der Mock muss die Tabelle
// mitliefern, sonst prüft der Test eine Auflösung, die es so nicht gibt. Die echte Tabelle ist
// reine Daten (keine DB), also wird sie durchgereicht statt nachgebaut.
vi.mock("@/lib/strafbuch", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/strafbuch")>()),
  buildStrafbuch: vi.fn(),
}));
// Nur die beiden DB-Wege ersetzt; `taskNoticeDeadline` bleibt echt, damit die Strafaufgabe ihre
// Frist hier genauso benennt wie eine gewöhnliche Aufgabe (sonst prüfte der Test eine Attrappe).
vi.mock("@/lib/taskService", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/taskService")>()),
  checkTask: vi.fn(),
  writeTask: vi.fn(),
}));
vi.mock("@/lib/notify", () => ({ notifyUser: vi.fn() }));
vi.mock("@/lib/appMeta", () => ({ markLastAction: vi.fn() }));

import { punishWithTask, judgeOffense } from "./strafurteilService";
import { POST as postTask } from "@/app/api/admin/tasks/route";
import type { NextRequest } from "next/server";
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
  tx.strafeRecord.create.mockResolvedValue({ id: "s1" });
  tx.strafeRecord.upsert.mockResolvedValue({ id: "s1" });
  tx.strafeRecord.findMany.mockResolvedValue([{ id: "s1" }]);
  tx.strafeRecord.deleteMany.mockResolvedValue({ count: 1 });
  check.mockResolvedValue({ ok: true, data: { data: {}, wirksamAb: null } });
  write.mockResolvedValue({
    id: "task-9", title: "Wohnung staubsaugen", holdUntil: HOLD_UNTIL,
    holdDurationMin: null, createdAt: new Date("2026-08-01T09:00:00Z"), startGraceMin: 30,
    wirksamAb: null, isPunishment: true,
  });
});

describe("punishWithTask", () => {
  it("legt Aufgabe und Urteil an und meldet EINE Nachricht", async () => {
    const res = await punishWithTask(PARAMS, "herrin");

    expect(res).toEqual({ ok: true, data: { id: "task-9", scheduledFor: null } });
    // Geprüft wird VOR der Transaktion (ein Dutzend Abfragen, die nichts festschreiben),
    // geschrieben darin.
    expect(check).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ isPunishment: true }), "herrin");
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
    expect(tx.strafeRecord.deleteMany).toHaveBeenCalledWith({ where: { userId: "u1", refId: { in: ["t-1"] } } });
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

/**
 * Die Strafaufgabe ist der ZWEITE Browser-Eingang desselben Urteils — und lief an beiden Regeln
 * vorbei, die für den ersten (`POST /api/admin/strafe`) längst galten: sie ersetzte ein bestehendes
 * Urteil stillschweigend, und sie stempelte an einer geteilten Referenz die zuerst erkannte Art ans
 * Urteil statt der geklickten.
 */
describe("Strafaufgabe als zweiter Browser-Eingang", () => {
  /** Der Konflikt der Datenbank: auf dieser ref liegt schon ein Urteil. Als P2002 und nicht als
   *  Vorab-Abfrage — die Schranke soll nicht davon abhängen, dass zwischen Lesen und Schreiben
   *  niemand dazwischenkommt. */
  const alreadyJudged = () =>
    tx.strafeRecord.create.mockRejectedValue(
      Object.assign(new Error("Unique constraint failed"), { code: "P2002", meta: { target: ["refId"] } }),
    );

  it("ersetzt kein bestehendes Urteil, sondern lehnt ab", async () => {
    // Das Szenario: der Keyholder öffnet das Aufgaben-Formular für Vergehen X, verwirft X im anderen
    // Tab und schickt dann ab. Ohne die Schranke würde die Verwerfung durch PUNISHED ersetzt, und
    // ihre überholte Meldung bliebe im Posteingang des Trägers stehen — nur `reopen` löscht sie.
    alreadyJudged();

    const res = await punishWithTask({ ...PARAMS, allowRevision: false }, "herrin");

    expect(res).toEqual({ ok: false, status: 409, error: "JUDGMENT_ALREADY_EXISTS" });
    // Keine Nachricht über eine Aufgabe, deren Urteil abgelehnt wurde. (Die Aufgabe selbst rollt mit
    // der Transaktion zurück — genau deshalb liegt die Schranke IN ihr und nicht davor.)
    expect(notify).not.toHaveBeenCalled();
  });

  it("die Route setzt die Regel wirklich — nicht nur der Dienst kann sie", async () => {
    // Die Zusage taugt nur, wenn der Aufrufer sie anfordert: `punishWithTask` erlaubt die Revision
    // per Vorgabe (so ruft der MCP), der Browser muss sie ausdrücklich abschalten.
    alreadyJudged();

    const res = await postTask({
      json: async () => ({
        userId: "u1", title: "Wohnung staubsaugen", holdUntil: HOLD_UNTIL.toISOString(),
        offenseRef: "t-1", offenseType: "AUFGABE",
      }),
    } as unknown as NextRequest);

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "JUDGMENT_ALREADY_EXISTS" });
  });

  it("urteilt über die Art, die der Knopf nennt — nicht über die zuerst erkannte", async () => {
    // Eine Reinigungsöffnung über dem Kontingent während einer Sperrzeit ist BEIDES; beide Arten
    // tragen dieselbe `Entry.id`. Ohne die Angabe stünde `OEFFNEN_ENTRY` am Urteil, auch wenn der
    // Knopf im Reinigungs-Limit-Abschnitt geklickt wurde.
    strafbuch.mockResolvedValue({
      ...emptyOffenseLists(),
      unauthorizedOpenings: [{ id: "e-9", startTime: HOLD_UNTIL }],
      reinigungLimitViolations: [{ entryId: "e-9", startTime: HOLD_UNTIL }],
    });

    const res = await punishWithTask(
      { ...PARAMS, refId: "e-9", offenseType: "REINIGUNG_LIMIT", allowRevision: false },
      "herrin",
    );

    expect(res).toEqual({ ok: true, data: { id: "task-9", scheduledFor: null } });
    expect(tx.strafeRecord.create.mock.calls[0][0].data).toMatchObject({ offenseType: "REINIGUNG_LIMIT" });
  });

  it("weist eine Art zurück, die es an dieser Referenz nicht gibt", async () => {
    // 400 und nicht 404: das Vergehen ist da, nur eben ein anderes — dieselbe Unterscheidung wie auf
    // dem Freitext-Weg. Und nichts wird angelegt, auch keine Aufgabe.
    const res = await punishWithTask({ ...PARAMS, offenseType: "REINIGUNG_LIMIT" }, "herrin");

    expect(res).toEqual({ ok: false, status: 400, error: "OFFENSE_TYPE_MISMATCH" });
    expect(check).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });
});
