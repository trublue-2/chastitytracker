import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * B1 — die beiden Hälften der Terminierung, die nicht in `evaluateTask` liegen:
 *
 *  1. die ZUSTELLUNG im Minuten-Tick (`dispatchDueTasks`) — mit der Regel, die das ganze Muster
 *     begründet: ein verspäteter Tick darf keine unerfüllbare Frist zustellen.
 *  2. die SICHTBARKEIT (`taskIntervals`) — eine noch nicht ausgelöste Aufgabe darf beim Träger
 *     weder auftauchen noch etwas blockieren, bei der Keyholderin dagegen schon.
 */

vi.mock("@/lib/prisma", () => ({
  prisma: {
    task: { findMany: vi.fn(), updateMany: vi.fn() },
    entry: { findMany: vi.fn(async () => []) },
    user: { findUnique: vi.fn(async () => null) },
    // Der Poller fragt vor dem Zustellen, wer gerade eine Gesundheitspause hat — leer = niemand.
    healthHold: { findMany: vi.fn(async () => []) },
  },
}));
vi.mock("@/lib/notify", () => ({ notifyUser: vi.fn(), notifyControllers: vi.fn() }));
vi.mock("@/lib/keyholder", () => ({ getControllersOfUser: vi.fn(async () => []), getControllerAudience: vi.fn(async () => ({ controllers: [], username: "sub" })) }));

import { dispatchDueTasks } from "./taskService";
import { getDashboardTasks, getEvaluatedTaskHistory, getTasksBlocking } from "./taskIntervals";
import { prisma } from "@/lib/prisma";
import { notifyUser } from "@/lib/notify";

const findMany = prisma.task.findMany as unknown as ReturnType<typeof vi.fn>;
const update = prisma.task.updateMany as unknown as ReturnType<typeof vi.fn>;
const notify = notifyUser as unknown as ReturnType<typeof vi.fn>;

const NOW = new Date("2026-07-26T07:04:00Z");
/** Geplant war 07:00 — der Tick kommt vier Minuten zu spät (Neustart, gescheiterter Versand …). */
const GEPLANT = new Date("2026-07-26T07:00:00Z");

/** Eine terminierte Aufgabe, wie der Poller sie liest. Gestellt am Vorabend, wirksam 07:00,
 *  30 min Kulanz, Ende 09:00 — die geplante Spanne ist damit zwei Stunden. */
const row = (over: Record<string, unknown> = {}) => ({
  id: "t1",
  userId: "u1",
  title: "Plug tragen",
  holdUntil: new Date("2026-07-26T09:00:00Z"),
  holdDurationMin: null,
  startGraceMin: 30,
  createdAt: new Date("2026-07-25T21:00:00Z"),
  wirksamAb: GEPLANT,
  isPunishment: false,
  createdBy: "herrin",
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  findMany.mockResolvedValue([]);
  update.mockResolvedValue({ count: 1 });
  notify.mockResolvedValue(undefined);
});

describe("dispatchDueTasks — Zustellung terminierter Aufgaben", () => {
  it("stellt zu, benennt die Keyholderin als Absenderin und stempelt danach", async () => {
    findMany.mockResolvedValue([row()]);

    await dispatchDueTasks(NOW);

    expect(notify).toHaveBeenCalledOnce();
    const [userId, content] = notify.mock.calls[0];
    expect(userId).toBe("u1");
    expect(content.subjectKey).toBe("taskAssignedSubject");
    // Der Absender ist, wer die Aufgabe gestellt hat — der Poller ist nur der Bote.
    expect(content.inbox).toMatchObject({ actor: "herrin", once: true });
    expect(update).toHaveBeenCalledOnce();
    // Der Stempel greift nur, solange die Aufgabe offen UND unzugestellt ist — ein Rückzug
    // zwischen Vorauswahl und Versand darf sie nicht wieder aufwecken.
    expect(update.mock.calls[0][0].where).toEqual({ id: "t1", withdrawnAt: null, benachrichtigtAt: null });
  });

  it("DER FALLSTRICK: die geplante Spanne wandert auf die tatsächliche Zustellung", async () => {
    findMany.mockResolvedValue([row()]);

    await dispatchDueTasks(NOW);

    const data = update.mock.calls[0][0].data;
    // Vier Minuten Verspätung → das Ende rückt um vier Minuten nach hinten, die zwei Stunden
    // bleiben zwei Stunden. Ohne das verlöre der Träger Kulanz für etwas, wovon er nichts wusste.
    expect(data.holdUntil.getTime() - data.wirksamAb.getTime()).toBe(2 * 3600_000);
    expect(data.holdUntil.getTime()).toBeGreaterThanOrEqual(new Date("2026-07-26T09:04:00Z").getTime());
    // Der Nullpunkt wandert mit — daran hängt die Kulanzfrist, die als blosse Minutenzahl gespeichert ist.
    expect(data.wirksamAb.getTime()).toBeGreaterThanOrEqual(NOW.getTime());
    expect(data.benachrichtigtAt).toEqual(data.wirksamAb);
  });

  it("eine STARK verspätete Zustellung bringt trotzdem keine abgelaufene Frist mit", async () => {
    // Die Instanz stand über Nacht: geplant war vorgestern, zugestellt wird jetzt.
    findMany.mockResolvedValue([row({
      wirksamAb: new Date("2026-07-24T07:00:00Z"),
      holdUntil: new Date("2026-07-24T09:00:00Z"),
    })]);

    await dispatchDueTasks(NOW);

    const data = update.mock.calls[0][0].data;
    expect(data.holdUntil.getTime()).toBeGreaterThan(NOW.getTime());
  });

  it("eine Strafaufgabe wird als Strafe zugestellt, nicht als gewöhnliche Aufgabe", async () => {
    findMany.mockResolvedValue([row({ isPunishment: true })]);
    await dispatchDueTasks(NOW);
    expect(notify.mock.calls[0][1].subjectKey).toBe("penaltyTaskSubject");
  });

  it("scheitert der Versand, bleibt die Zeile ungestempelt — der nächste Tick versucht es erneut", async () => {
    findMany.mockResolvedValue([row(), row({ id: "t2" })]);
    notify.mockRejectedValueOnce(new Error("SMTP weg"));

    await dispatchDueTasks(NOW);

    // Die zweite Aufgabe geht trotzdem raus: ein Fehler darf den Tick nie abbrechen.
    expect(update.mock.calls.map((c) => c[0].where.id)).toEqual(["t2"]);
  });

  it("sucht nur, was fällig UND noch nicht zugestellt ist", async () => {
    await dispatchDueTasks(NOW);
    expect(findMany.mock.calls[0][0].where).toEqual({
      wirksamAb: { not: null, lte: NOW },
      benachrichtigtAt: null,
      withdrawnAt: null,
    });
  });
});

/**
 * Die Lese-Seite. Geprüft wird die `where`-Klausel und nicht das Ergebnis: der Filter MUSS in SQL
 * stehen, sonst zieht eine terminierte Aufgabe den `take`-Deckel voll und verdrängt eine sichtbare.
 */
describe("Sichtbarkeit — eine noch nicht ausgelöste Aufgabe gibt es für den Träger nicht", () => {
  /** Das Fragment, das `isHiddenFromSub` in SQL ausdrückt. */
  const VISIBLE = { AND: [{ OR: [{ wirksamAb: null }, { benachrichtigtAt: { not: null } }] }] };
  const whereOf = (call: number) => findMany.mock.calls[call][0].where;

  it("die Aufgaben-Vorauswahl des Trägers filtert sie weg", async () => {
    await getDashboardTasks("u1", NOW, "sub");
    expect(whereOf(0)).toMatchObject(VISIBLE);
  });

  it("die Keyholder-Sicht filtert sie NICHT weg — sie hat sie ja geplant", async () => {
    await getDashboardTasks("u1", NOW, "keyholder");
    expect(whereOf(0).AND).toBeUndefined();
  });

  it("auch die Historie des Trägers folgt derselben Sichtbarkeit — beide Abfragen", async () => {
    await getEvaluatedTaskHistory("u1", NOW, { audience: "sub" });
    expect(whereOf(0)).toMatchObject(VISIBLE);
    expect(whereOf(1)).toMatchObject(VISIBLE);
  });

  it("sie BLOCKIERT nichts: die Ablege-Warnung sieht sie gar nicht erst", async () => {
    await getTasksBlocking("u1", NOW, { kg: true });
    expect(whereOf(0)).toMatchObject(VISIBLE);
  });
});
