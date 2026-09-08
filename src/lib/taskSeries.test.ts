import { describe, it, expect, vi, beforeEach } from "vitest";

// Minimaler Prisma-Doppelgänger für den Serien-Pfad: nur die Methoden, die `createTaskSeries` und
// `materializeDueSeries` (samt dem geteilten `checkTask`) tatsächlich anfassen.
vi.mock("@/lib/prisma", () => {
  const p = {
    taskSeries: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    taskSeriesRequirement: { deleteMany: vi.fn() },
    taskSeriesProof: { deleteMany: vi.fn() },
    task: { create: vi.fn() },
    user: { findUnique: vi.fn() },
    healthHold: { findFirst: vi.fn(async () => null) },
    device: { findMany: vi.fn(async () => []) },
    deviceCategory: { findMany: vi.fn(async () => []) },
    // $transaction(fn) ruft die Callback mit demselben Client als „tx" — reicht für die
    // deleteMany+update-Kette in updateTaskSeries.
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(p)),
  };
  return { prisma: p };
});
vi.mock("@/lib/notify", () => ({ notifyUser: vi.fn(), notifyControllers: vi.fn() }));
vi.mock("@/lib/keyholder", () => ({
  getControllerAudience: vi.fn(async () => ({ controllers: [], username: "sub" })),
  getControllersOfUser: vi.fn(async () => []),
}));

import { createTaskSeries, updateTaskSeries, withdrawTaskSeries, materializeDueSeries, type CreateTaskSeriesParams } from "./taskService";
import { prisma } from "@/lib/prisma";
import { notifyUser } from "@/lib/notify";

const db = prisma as unknown as {
  taskSeries: Record<string, ReturnType<typeof vi.fn>>;
  taskSeriesRequirement: Record<string, ReturnType<typeof vi.fn>>;
  taskSeriesProof: Record<string, ReturnType<typeof vi.fn>>;
  task: Record<string, ReturnType<typeof vi.fn>>;
  user: Record<string, ReturnType<typeof vi.fn>>;
  healthHold: Record<string, ReturnType<typeof vi.fn>>;
};
const notify = notifyUser as unknown as ReturnType<typeof vi.fn>;

const baseParams = (over: Partial<CreateTaskSeriesParams> = {}): CreateTaskSeriesParams => ({
  userId: "u1",
  title: "Plug tragen",
  holdWindowMin: 120,
  recurrence: {
    freq: "DAILY", timeOfDay: "09:00", startsOn: "2026-01-05T00:00:00Z",
  },
  ...over,
});

import { afterEach } from "vitest";

// Die Uhr festnageln: der geteilte `checkTask` liest INTERN `new Date()` (nicht das an
// `materializeDueSeries` übergebene `now`). In Produktion sind beide ≈ jetzt; im Test muss die
// Systemuhr auf denselben Zeitpunkt stehen, sonst wirkt die frisch gerechnete Frist schon abgelaufen.
beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-01-06T09:30:00Z"));
  db.user.findUnique.mockResolvedValue({ id: "u1", timezone: "Europe/Zurich" });
  db.healthHold.findFirst.mockResolvedValue(null);
  db.taskSeries.create.mockResolvedValue({ id: "s1" });
});
afterEach(() => {
  vi.useRealTimers();
});

describe("createTaskSeries — Validierung", () => {
  it("legt eine gültige Serie an", async () => {
    const res = await createTaskSeries(baseParams(), "herrin");
    expect(res.ok).toBe(true);
    expect(db.taskSeries.create).toHaveBeenCalledTimes(1);
  });

  it("weist beide Halte-Modi gleichzeitig ab", async () => {
    const res = await createTaskSeries(baseParams({ holdDurationMin: 30 }), "herrin");
    expect(res).toMatchObject({ ok: false, error: "TASK_SERIES_HOLD_MODE" });
  });

  it("weist keinen Halte-Modus ab", async () => {
    const res = await createTaskSeries(baseParams({ holdWindowMin: null }), "herrin");
    expect(res).toMatchObject({ ok: false, error: "TASK_SERIES_HOLD_MODE" });
  });

  it("verlangt bei Dauer-Modus mindestens eine Bedingung", async () => {
    const res = await createTaskSeries(baseParams({ holdWindowMin: null, holdDurationMin: 30 }), "herrin");
    expect(res).toMatchObject({ ok: false, error: "TASK_HOLD_DURATION_WITHOUT_REQUIREMENTS" });
  });

  it("reicht den Fehlercode des Rechenkerns durch (leere Wochentagsmaske)", async () => {
    const res = await createTaskSeries(baseParams({ recurrence: { freq: "WEEKLY", timeOfDay: "09:00", startsOn: "2026-01-05T00:00:00Z", weekdayMask: 0 } }), "herrin");
    expect(res).toMatchObject({ ok: false, error: "RECURRENCE_WEEKDAYS" });
  });

  it("weist eine ungültige Uhrzeit ab", async () => {
    const res = await createTaskSeries(baseParams({ recurrence: { freq: "DAILY", timeOfDay: "24:00", startsOn: "2026-01-05T00:00:00Z" } }), "herrin");
    expect(res).toMatchObject({ ok: false, error: "RECURRENCE_TIME" });
  });
});

describe("updateTaskSeries", () => {
  beforeEach(() => {
    db.taskSeries.findFirst.mockResolvedValue({ id: "s1" });
    db.taskSeries.update.mockResolvedValue({ id: "s1" });
  });

  it("ersetzt Vorlage + Bedingungen + Nachweise und zählt die Version hoch", async () => {
    const res = await updateTaskSeries("s1", baseParams({ title: "Neu" }), "andere");
    expect(res.ok).toBe(true);
    // Kinder werden zuerst geleert, dann neu angelegt.
    expect(db.taskSeriesRequirement.deleteMany).toHaveBeenCalledWith({ where: { seriesId: "s1" } });
    expect(db.taskSeriesProof.deleteMany).toHaveBeenCalledWith({ where: { seriesId: "s1" } });
    const data = db.taskSeries.update.mock.calls[0][0].data;
    expect(data.title).toBe("Neu");
    expect(data.version).toEqual({ increment: 1 });
    // `createdBy` bleibt der Ersteller — die Änderung fasst es nicht an.
    expect(data.createdBy).toBeUndefined();
  });

  it("gibt es die Serie (für diesen User) nicht, dann TASK_SERIES_NOT_FOUND", async () => {
    db.taskSeries.findFirst.mockResolvedValue(null);
    const res = await updateTaskSeries("s1", baseParams(), "herrin");
    expect(res).toMatchObject({ ok: false, error: "TASK_SERIES_NOT_FOUND" });
    expect(db.taskSeries.update).not.toHaveBeenCalled();
  });

  it("eine ungültige neue Regel wird abgewiesen, nichts geschrieben", async () => {
    const res = await updateTaskSeries("s1", baseParams({ recurrence: { freq: "WEEKLY", timeOfDay: "09:00", startsOn: "2026-01-05T00:00:00Z", weekdayMask: 0 } }), "herrin");
    expect(res).toMatchObject({ ok: false, error: "RECURRENCE_WEEKDAYS" });
    expect(db.taskSeries.update).not.toHaveBeenCalled();
  });
});

describe("withdrawTaskSeries", () => {
  it("setzt deletedAt (Soft-Delete) für die eigene Serie", async () => {
    db.taskSeries.updateMany.mockResolvedValue({ count: 1 });
    const res = await withdrawTaskSeries("s1", "u1");
    expect(res.ok).toBe(true);
    const call = db.taskSeries.updateMany.mock.calls[0][0];
    expect(call.where).toMatchObject({ id: "s1", userId: "u1", deletedAt: null });
    expect(call.data.deletedAt).toBeInstanceOf(Date);
  });

  it("trifft es keine Zeile (fremd oder schon weg), dann TASK_SERIES_NOT_FOUND", async () => {
    db.taskSeries.updateMany.mockResolvedValue({ count: 0 });
    const res = await withdrawTaskSeries("s1", "u1");
    expect(res).toMatchObject({ ok: false, error: "TASK_SERIES_NOT_FOUND" });
  });
});

describe("materializeDueSeries", () => {
  // 2026-01-06 10:30 Zürich = 09:30 UTC. Der Termin 09:00 Zürich (= 08:00 UTC) an diesem Tag ist
  // fällig; der von gestern liegt vor dem 25-h-Fenster.
  const NOW = new Date("2026-01-06T09:30:00Z");
  const JAN6_0900_ZURICH = new Date("2026-01-06T08:00:00Z");

  const seriesRow = (over: Record<string, unknown> = {}) => ({
    id: "s1", userId: "u1", title: "Plug tragen", description: null,
    holdDurationMin: null, holdWindowMin: 120, startGraceMin: 30, proofOrderMatters: true, createdBy: "herrin",
    freq: "DAILY", interval: 1, weekdayMask: null, ordinal: null, timeOfDay: "09:00",
    startsOn: new Date("2026-01-05T00:00:00Z"), until: null, exclusionDates: null,
    lastMaterializedOccurrence: null,
    requirements: [], proofs: [], user: { timezone: "Europe/Zurich" },
    ...over,
  });

  it("erzeugt eine Aufgabe für den fälligen Termin, meldet sie und rückt den Cursor vor", async () => {
    db.taskSeries.findMany.mockResolvedValue([seriesRow()]);
    db.task.create.mockResolvedValue({
      id: "t1", title: "Plug tragen", holdUntil: new Date(NOW.getTime() + 120 * 60_000),
      holdDurationMin: null, createdAt: NOW, startGraceMin: 30, wirksamAb: null, isPunishment: false,
    });

    await materializeDueSeries(NOW);

    expect(db.task.create).toHaveBeenCalledTimes(1);
    const created = db.task.create.mock.calls[0][0].data;
    expect(created.series).toEqual({ connect: { id: "s1" } });
    expect(created.seriesOccurrence).toEqual(JAN6_0900_ZURICH);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(db.taskSeries.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "s1" }, data: { lastMaterializedOccurrence: JAN6_0900_ZURICH } }),
    );
  });

  it("ist idempotent: ein bereits materialisierter Termin (Unique-Verletzung) meldet nichts, rückt aber vor", async () => {
    db.taskSeries.findMany.mockResolvedValue([seriesRow()]);
    db.task.create.mockRejectedValue(Object.assign(new Error("unique"), {
      code: "P2002", meta: { target: ["seriesId", "seriesOccurrence"] },
    }));

    await materializeDueSeries(NOW);

    expect(notify).not.toHaveBeenCalled();
    expect(db.taskSeries.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { lastMaterializedOccurrence: JAN6_0900_ZURICH } }),
    );
  });

  it("bei aktivem Gesundheits-Halt: nichts erzeugen, Cursor NICHT vorrücken", async () => {
    db.taskSeries.findMany.mockResolvedValue([seriesRow()]);
    db.healthHold.findFirst.mockResolvedValue({ id: "h1" });

    await materializeDueSeries(NOW);

    expect(db.task.create).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
    expect(db.taskSeries.update).not.toHaveBeenCalled();
  });

  it("nichts Fälliges: keine Aufgabe, kein Cursor-Update", async () => {
    // Cursor steht bereits auf dem heutigen Termin — es gibt nichts Neues.
    db.taskSeries.findMany.mockResolvedValue([seriesRow({ lastMaterializedOccurrence: JAN6_0900_ZURICH })]);

    await materializeDueSeries(NOW);

    expect(db.task.create).not.toHaveBeenCalled();
    expect(db.taskSeries.update).not.toHaveBeenCalled();
  });
});
