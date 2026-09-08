import { describe, it, expect, vi, beforeEach } from "vitest";

// Der MCP-Serien-Pfad (#26): dünne Abbildung Argument → Dienst. Getestet wird die Übersetzung
// (ISO-Wochentage → Maske, freq), dass der dryRun den Fehlercode des Rechenkerns durchreicht, und
// die Existenz-Prüfung beim Zurückziehen. Der Commit-Pfad (createTaskSeries etc.) ist in
// taskSeries.test.ts geprüft.
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    taskSeries: { findFirst: vi.fn() },
    device: { findMany: vi.fn(async () => []) },
    deviceCategory: { findMany: vi.fn(async () => []) },
  },
}));
vi.mock("@/lib/notify", () => ({ notifyUser: vi.fn(), notifyControllers: vi.fn() }));
vi.mock("@/lib/keyholder", () => ({
  getControllerAudience: vi.fn(async () => ({ controllers: [], username: "sub" })),
  getControllersOfUser: vi.fn(async () => []),
}));

import { mcpCreateTaskSeries, mcpEditTaskSeries, mcpWithdrawTaskSeries, type CreateTaskSeriesArgs } from "./mcpWrite";
import { prisma } from "@/lib/prisma";

const db = prisma as unknown as {
  user: { findUnique: ReturnType<typeof vi.fn> };
  taskSeries: { findFirst: ReturnType<typeof vi.fn> };
};

beforeEach(() => {
  vi.clearAllMocks();
  // resolveTargetUserId liest per username, checkTaskSeries/preview per id — beide Formen decken.
  db.user.findUnique.mockResolvedValue({ id: "u1", timezone: "Europe/Zurich" });
});

const args = (over: Partial<CreateTaskSeriesArgs> = {}): CreateTaskSeriesArgs => ({
  title: "Plug tragen",
  holdWindowMinutes: 120,
  recurrence: { freq: "weekly", weekdays: [1, 4], timeOfDay: "09:00", startsOn: "2026-01-05" },
  dryRun: true,
  ...over,
});

describe("mcpCreateTaskSeries — dryRun", () => {
  it("gültig: wouldSucceed, ISO-Wochentage → Maske, Termin-Vorschau", async () => {
    const res = await mcpCreateTaskSeries("sub", args()) as { wouldSucceed: boolean; preview: { recurrence: { weekdayMask: number }; nextOccurrences: string[] } };
    expect(res.wouldSucceed).toBe(true);
    // mon = Bit 0 (1) + thu = Bit 3 (8) = 9.
    expect(res.preview.recurrence.weekdayMask).toBe(0b1001);
    expect(res.preview.nextOccurrences.length).toBeGreaterThan(0);
  });

  it("leere Wochentagsauswahl bei WEEKLY: Fehlercode des Rechenkerns durchgereicht", async () => {
    const res = await mcpCreateTaskSeries("sub", args({ recurrence: { freq: "weekly", weekdays: [], timeOfDay: "09:00", startsOn: "2026-01-05" } })) as { wouldSucceed: boolean; problem?: string };
    expect(res.wouldSucceed).toBe(false);
    expect(res.problem).toBe("RECURRENCE_WEEKDAYS");
  });

  it("beide/keine Halte-Angabe: TASK_SERIES_HOLD_MODE", async () => {
    const res = await mcpCreateTaskSeries("sub", args({ holdMinutesFromStart: 30 })) as { wouldSucceed: boolean; problem?: string };
    expect(res.wouldSucceed).toBe(false);
    expect(res.problem).toBe("TASK_SERIES_HOLD_MODE");
  });
});

describe("mcpEditTaskSeries — dryRun", () => {
  it("gibt es die Serie und die neue Spezifikation ist gültig, dann wouldSucceed", async () => {
    db.taskSeries.findFirst.mockResolvedValue({ id: "s1" });
    const res = await mcpEditTaskSeries("sub", { id: "s1", ...args() }) as { wouldSucceed: boolean; problem?: string };
    expect(res.wouldSucceed).toBe(true);
  });

  it("gibt es die Serie nicht, dann TASK_SERIES_NOT_FOUND (ohne die Regel überhaupt zu prüfen)", async () => {
    db.taskSeries.findFirst.mockResolvedValue(null);
    const res = await mcpEditTaskSeries("sub", { id: "s1", ...args() }) as { wouldSucceed: boolean; problem?: string };
    expect(res.wouldSucceed).toBe(false);
    expect(res.problem).toBe("TASK_SERIES_NOT_FOUND");
  });
});

describe("mcpWithdrawTaskSeries — dryRun", () => {
  it("gibt es die Serie, dann wouldSucceed", async () => {
    db.taskSeries.findFirst.mockResolvedValue({ id: "s1" });
    const res = await mcpWithdrawTaskSeries("sub", { id: "s1", dryRun: true }) as { wouldSucceed: boolean };
    expect(res.wouldSucceed).toBe(true);
  });

  it("gibt es sie nicht, dann TASK_SERIES_NOT_FOUND", async () => {
    db.taskSeries.findFirst.mockResolvedValue(null);
    const res = await mcpWithdrawTaskSeries("sub", { id: "s1", dryRun: true }) as { wouldSucceed: boolean; problem?: string };
    expect(res.wouldSucceed).toBe(false);
    expect(res.problem).toBe("TASK_SERIES_NOT_FOUND");
  });
});
