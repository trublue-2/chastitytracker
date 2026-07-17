import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * K-01 (leichte Variante, MCP-Befundliste 2026-07-17): dryRun für alle 12 V1-Write-Tools — validiert
 * Argument-Auflösung + die hier verfügbaren Regeln, OHNE die mutierende Service-Funktion aufzurufen.
 * Diese Tests pinnen zwei Dinge pro Tool: (1) dryRun:true committet NICHTS (die mutierende Funktion
 * wird nie aufgerufen), (2) wo eine echte Prüf-Funktion existiert (checkOrgasmWindowEnd,
 * checkGoalPlausibility, checkLockEnd), erkennt der Preview einen Verstoss auch wirklich.
 */

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    device: { findMany: vi.fn() },
    deviceCategory: { findMany: vi.fn() },
    orgasmusAnforderung: { count: vi.fn() },
    verschlussAnforderung: { count: vi.fn(), findMany: vi.fn() },
    kontrollAnforderung: { count: vi.fn(), findFirst: vi.fn() },
    trainingVorgabe: { findUnique: vi.fn() },
    // getIsLocked/hasActiveKontrolle (advisory dryRun-Checks) lesen darüber.
    entry: { findFirst: vi.fn() },
  },
}));

// Die mutierenden Service-Funktionen — dryRun darf keine davon je aufrufen.
vi.mock("@/lib/verschlussAnforderungService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/verschlussAnforderungService")>();
  return { ...actual, createVerschlussAnforderung: vi.fn(), updateSperrzeitEnde: vi.fn(), withdrawVerschlussAnforderung: vi.fn() };
});
vi.mock("@/lib/kontrolleService", () => ({ requestKontrolle: vi.fn(), resolveKontrolle: vi.fn(), hasActiveKontrolle: vi.fn() }));
vi.mock("@/lib/vorgabeService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/vorgabeService")>();
  return { ...actual, createVorgabe: vi.fn(), updateVorgabe: vi.fn(), deleteVorgabe: vi.fn(), listVorgaben: vi.fn() };
});
vi.mock("@/lib/reinigungService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/reinigungService")>();
  return { ...actual, setReinigungSettings: vi.fn() };
});
vi.mock("@/lib/orgasmusAnforderungService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/orgasmusAnforderungService")>();
  return { ...actual, createOrgasmusAnforderung: vi.fn(), withdrawOrgasmusAnforderung: vi.fn() };
});
vi.mock("@/lib/strafurteilService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/strafurteilService")>();
  return { ...actual, judgeOffense: vi.fn() };
});

import {
  mcpRequestLock, mcpSetLockPeriod, mcpRequestInspection, mcpRequestOrgasm, mcpSetTrainingGoal,
  mcpWithdraw, mcpEditTrainingGoal, mcpDeleteTrainingGoal, mcpSetCleaning, mcpResolveInspection,
  mcpEditLockPeriod, mcpJudgeOffense,
} from "./mcpWrite";
import { prisma } from "@/lib/prisma";
import { createVerschlussAnforderung, updateSperrzeitEnde } from "@/lib/verschlussAnforderungService";
import { requestKontrolle, resolveKontrolle, hasActiveKontrolle } from "@/lib/kontrolleService";
import { createVorgabe, updateVorgabe, deleteVorgabe } from "@/lib/vorgabeService";
import { setReinigungSettings } from "@/lib/reinigungService";
import { createOrgasmusAnforderung } from "@/lib/orgasmusAnforderungService";
import { judgeOffense } from "@/lib/strafurteilService";

const userMock = prisma.user.findUnique as unknown as ReturnType<typeof vi.fn>;
const trainingVorgabeMock = prisma.trainingVorgabe.findUnique as unknown as ReturnType<typeof vi.fn>;
const kontrollFindFirstMock = prisma.kontrollAnforderung.findFirst as unknown as ReturnType<typeof vi.fn>;
const sperrzeitFindManyMock = prisma.verschlussAnforderung.findMany as unknown as ReturnType<typeof vi.fn>;
const entryFindFirstMock = prisma.entry.findFirst as unknown as ReturnType<typeof vi.fn>;

const JETZT = new Date("2026-07-17T12:00:00Z");
const MORGEN = new Date("2026-07-18T12:00:00Z");
/** getIsLocked liest den jüngsten KG-Eintrag — VERSCHLUSS = verschlossen, OEFFNEN = offen. */
const NICHT_VERSCHLOSSEN = { type: "OEFFNEN" };
const VERSCHLOSSEN = { type: "VERSCHLUSS" };

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(JETZT);
  userMock.mockResolvedValue({ id: "u1", username: "sub", role: "admin" });
  (prisma.orgasmusAnforderung.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);
  (prisma.verschlussAnforderung.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);
  (prisma.kontrollAnforderung.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);
  // Default: nicht verschlossen (passt zu request_lock, das genau das verlangt). Tests für
  // set_lock_period/request_inspection (die einen verschlossenen User verlangen) setzen VERSCHLOSSEN.
  entryFindFirstMock.mockResolvedValue(NICHT_VERSCHLOSSEN);
  (hasActiveKontrolle as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(false);
});

describe("dryRun committet nichts", () => {
  it("request_lock", async () => {
    const r = await mcpRequestLock("sub", { dryRun: true });
    expect((r as { dryRun: boolean }).dryRun).toBe(true);
    expect(createVerschlussAnforderung).not.toHaveBeenCalled();
  });

  it("set_lock_period", async () => {
    entryFindFirstMock.mockResolvedValue(VERSCHLOSSEN);
    const r = await mcpSetLockPeriod("sub", { dryRun: true, untilAt: MORGEN.toISOString() });
    expect((r as { dryRun: boolean }).dryRun).toBe(true);
    expect(createVerschlussAnforderung).not.toHaveBeenCalled();
  });

  it("request_inspection", async () => {
    entryFindFirstMock.mockResolvedValue(VERSCHLOSSEN);
    const r = await mcpRequestInspection("sub", { dryRun: true });
    expect((r as { dryRun: boolean }).dryRun).toBe(true);
    expect(requestKontrolle).not.toHaveBeenCalled();
  });

  it("set_cleaning", async () => {
    const r = await mcpSetCleaning("sub", { dryRun: true, maxMinutes: 30 });
    expect((r as { dryRun: boolean }).dryRun).toBe(true);
    expect(setReinigungSettings).not.toHaveBeenCalled();
  });

  it("judge_offense", async () => {
    const r = await mcpJudgeOffense("sub", { dryRun: true, ref: "o1", action: "dismiss" });
    expect((r as { dryRun: boolean }).dryRun).toBe(true);
    expect(judgeOffense).not.toHaveBeenCalled();
  });

  it("withdraw (reine Lese-Vorschau, keine Zähl-Mutation)", async () => {
    const r = await mcpWithdraw("sub", { dryRun: true, target: "orgasm_directive" });
    expect((r as { dryRun: boolean }).dryRun).toBe(true);
    expect(prisma.orgasmusAnforderung.count).toHaveBeenCalledTimes(1);
  });
});

describe("dryRun erkennt echte Regelverstösse (B-01/B-02, nicht nur Argument-Form)", () => {
  it("request_orgasm: Vergangenheits-Fenster wird auch im dryRun abgelehnt", async () => {
    const r = await mcpRequestOrgasm("sub", {
      dryRun: true, art: "GELEGENHEIT",
      beginsAt: new Date("2026-07-10T10:00:00Z").toISOString(),
      endsAt: new Date("2026-07-11T10:00:00Z").toISOString(),
    }) as { dryRun: boolean; wouldSucceed: boolean; problem?: string };
    expect(r.dryRun).toBe(true);
    expect(r.wouldSucceed).toBe(false);
    expect(r.problem).toBe("ORGASM_END_MUST_BE_FUTURE");
    expect(createOrgasmusAnforderung).not.toHaveBeenCalled();
  });

  it("request_orgasm: plausibles Fenster im dryRun erlaubt", async () => {
    const r = await mcpRequestOrgasm("sub", { dryRun: true, art: "GELEGENHEIT", endsAt: MORGEN.toISOString() }) as { wouldSucceed: boolean };
    expect(r.wouldSucceed).toBe(true);
  });

  it("request_orgasm: explizites endsAt vor beginsAt wird auch im dryRun abgelehnt (code-review-Fund)", async () => {
    // Beide Zeiten liegen in der Zukunft (checkOrgasmWindowEnd allein würde das durchwinken) —
    // aber endsAt < beginsAt ist strukturell ungültig, dieselbe Regel wie beim echten Commit.
    const r = await mcpRequestOrgasm("sub", {
      dryRun: true, art: "GELEGENHEIT",
      beginsAt: new Date("2026-07-20T10:00:00Z").toISOString(),
      endsAt: new Date("2026-07-18T10:00:00Z").toISOString(),
    }) as { wouldSucceed: boolean; problem?: string };
    expect(r.wouldSucceed).toBe(false);
    expect(r.problem).toBe("ORGASM_END_BEFORE_START");
  });

  it("request_lock: bereits verschlossener User wird auch im dryRun abgelehnt", async () => {
    entryFindFirstMock.mockResolvedValue(VERSCHLOSSEN);
    const r = await mcpRequestLock("sub", { dryRun: true }) as { wouldSucceed: boolean; problem?: string };
    expect(r.wouldSucceed).toBe(false);
    expect(r.problem).toBe("USER_ALREADY_LOCKED");
  });

  it("set_lock_period: nicht verschlossener User wird auch im dryRun abgelehnt", async () => {
    // entryFindFirstMock steht per Default auf NICHT_VERSCHLOSSEN.
    const r = await mcpSetLockPeriod("sub", { dryRun: true, untilAt: MORGEN.toISOString() }) as { wouldSucceed: boolean; problem?: string };
    expect(r.wouldSucceed).toBe(false);
    expect(r.problem).toBe("USER_NOT_LOCKED");
  });

  it("set_lock_period: Ende vor der Auslösung wird auch im dryRun abgelehnt (checkLockEnd, code-review-Fund)", async () => {
    entryFindFirstMock.mockResolvedValue(VERSCHLOSSEN);
    const r = await mcpSetLockPeriod("sub", {
      dryRun: true, untilAt: MORGEN.toISOString(), scheduledAt: new Date("2026-08-04T12:00:00Z").toISOString(),
    }) as { wouldSucceed: boolean; problem?: string };
    expect(r.wouldSucceed).toBe(false);
    expect(r.problem).toBe("LOCK_PERIOD_END_MUST_BE_AFTER_TRIGGER");
  });

  it("request_inspection: nicht verschlossener User wird auch im dryRun abgelehnt", async () => {
    const r = await mcpRequestInspection("sub", { dryRun: true }) as { wouldSucceed: boolean; problem?: string };
    expect(r.wouldSucceed).toBe(false);
    expect(r.problem).toBe("USER_NOT_LOCKED");
  });

  it("set_training_goal: 500 Std/Woche wird auch im dryRun abgelehnt", async () => {
    const r = await mcpSetTrainingGoal("sub", { dryRun: true, minPerWeekHours: 500 }) as { wouldSucceed: boolean; problem?: string };
    expect(r.wouldSucceed).toBe(false);
    expect(r.problem).toBe("GOAL_WEEK_TARGET_TOO_HIGH");
    expect(createVorgabe).not.toHaveBeenCalled();
  });

  it("edit_training_goal: implausible Änderung wird auch bei reinem Stunden-Edit im dryRun abgelehnt", async () => {
    trainingVorgabeMock.mockResolvedValue({ id: "g1", userId: "u1", categoryId: null, gueltigAb: JETZT, gueltigBis: null, validUntilManual: false, minProTagH: 2, minProWocheH: null, minProMonatH: null, minProJahrH: null, notiz: null });
    const r = await mcpEditTrainingGoal("sub", { dryRun: true, id: "g1", minPerWeekHours: 999 }) as { wouldSucceed: boolean; problem?: string };
    expect(r.wouldSucceed).toBe(false);
    expect(r.problem).toBe("GOAL_WEEK_TARGET_TOO_HIGH");
    expect(updateVorgabe).not.toHaveBeenCalled();
  });

  it("set_cleaning: dryRun zeigt den GEKLEMMTEN Wert, nicht den rohen Input (K-06-Falle)", async () => {
    const r = await mcpSetCleaning("sub", { dryRun: true, maxMinutes: 9999 }) as { preview: { maxMinutes: number; maxMinutesClampedFrom?: number } };
    expect(r.preview.maxMinutes).toBe(120); // MAX_MINUTEN_RANGE.max
    expect(r.preview.maxMinutesClampedFrom).toBe(9999);
  });

  it("edit_lock_period: Ende vor der Auslösung wird auch im dryRun abgelehnt (checkLockEnd)", async () => {
    const wirksamAb = new Date("2026-08-04T12:00:00Z"); // 3 Wochen voraus
    sperrzeitFindManyMock.mockResolvedValue([{ id: "s1", userId: "u1", wirksamAb, endetAt: null, withdrawnAt: null, benachrichtigtAt: null }]);
    const r = await mcpEditLockPeriod("sub", { dryRun: true, untilAt: MORGEN.toISOString() }) as { wouldSucceed: boolean; problem?: string };
    expect(r.wouldSucceed).toBe(false);
    expect(r.problem).toBe("LOCK_PERIOD_END_MUST_BE_AFTER_TRIGGER");
    expect(updateSperrzeitEnde).not.toHaveBeenCalled();
  });

  it("delete_training_goal: existierendes Ziel wird gefunden, nichts gelöscht", async () => {
    trainingVorgabeMock.mockResolvedValue({ id: "g1", userId: "u1" });
    const r = await mcpDeleteTrainingGoal("sub", { dryRun: true, id: "g1" }) as { dryRun: boolean };
    expect(r.dryRun).toBe(true);
    expect(deleteVorgabe).not.toHaveBeenCalled();
  });

  it("resolve_inspection: gefundene Inspektion wird gemeldet, nichts aufgelöst", async () => {
    kontrollFindFirstMock.mockResolvedValue({ id: "k1" });
    const r = await mcpResolveInspection("sub", { dryRun: true, action: "verify" }) as { dryRun: boolean; preview: { id: string } };
    expect(r.dryRun).toBe(true);
    expect(r.preview.id).toBe("k1");
    expect(resolveKontrolle).not.toHaveBeenCalled();
  });

  it("judge_offense: punish ohne text wird auch im dryRun abgelehnt", async () => {
    const r = await mcpJudgeOffense("sub", { dryRun: true, ref: "o1", action: "punish" }) as { wouldSucceed: boolean; problem?: string };
    expect(r.wouldSucceed).toBe(false);
    expect(r.problem).toBe("PENALTY_TEXT_REQUIRED");
  });
});
