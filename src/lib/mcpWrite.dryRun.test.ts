import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * K-01 (leichte Variante, MCP-Befundliste 2026-07-17): dryRun für die V1-Write-Tools — validiert
 * Argument-Auflösung + die hier verfügbaren Regeln, OHNE die mutierende Service-Funktion aufzurufen.
 * Nicht mehr ganz vollständig: die Einstellungs-Werkzeuge, die später dazukamen
 * (`set_weight_tracking`, `set_offense_rules`, `set_inspection_escalation`), pinnen dieselbe
 * Zusage in ihren eigenen Dateien — dort steht der Bestand daneben, den ihre Vorschau zeigen muss.
 *
 * Diese Tests pinnen zwei Dinge pro Tool: (1) dryRun:true committet NICHTS (die mutierende Funktion
 * wird nie aufgerufen), (2) wo eine echte Prüf-Funktion existiert (checkOrgasmWindowEnd,
 * checkGoalPlausibility, checkLockEnd), erkennt der Preview einen Verstoss auch wirklich.
 */

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn() },
    device: { findMany: vi.fn() },
    deviceCategory: { findMany: vi.fn() },
    orgasmusAnforderung: { count: vi.fn() },
    verschlussAnforderung: { count: vi.fn(), findMany: vi.fn(), findUnique: vi.fn() },
    kontrollAnforderung: { count: vi.fn(), findFirst: vi.fn() },
    trainingVorgabe: { findFirst: vi.fn() },
    strafeRecord: { findUnique: vi.fn() },
    // Der Gesundheits-Halt ist Vorbedingung jeder Direktive (`isHealthHoldActive`) — `null` = keiner.
    healthHold: { findFirst: vi.fn(async () => null) },
    // getIsLocked/hasActiveKontrolle (advisory dryRun-Checks) lesen darüber.
    entry: { findFirst: vi.fn() },
    // Die EINZIGEN Schreibvorgänge der Aufgaben-Werkzeuge (`createTask` → writeTask → tx.task.create,
    // `updateTask` → task.updateMany, `reviewTaskProof` → taskProof.update). Weder `taskService` noch
    // `taskProofService` sind in dieser Datei gemockt — die Vorschauen rufen `checkTask`/
    // `checkTaskUpdate`/`proofReviewBlockedReason` echt auf —, also müssen die Schreibwege hier als
    // Mocks danebenstehen, um beweisen zu können, dass sie ruhen. Gelesen wird über `findUnique`
    // (`edit_task`) bzw. `findFirst` (`resolveTaskProof` in `review_task_proof`).
    task: { create: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn() },
    taskProof: { update: vi.fn() },
  },
}));

// Die mutierenden Service-Funktionen — dryRun darf keine davon je aufrufen.
vi.mock("@/lib/verschlussAnforderungService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/verschlussAnforderungService")>();
  return { ...actual, createVerschlussAnforderung: vi.fn(), updateLockPeriodEnd: vi.fn(), updateLockRequest: vi.fn(), withdrawVerschlussAnforderung: vi.fn(), withdrawVerschlussAnforderungById: vi.fn() };
});
vi.mock("@/lib/kontrolleService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/kontrolleService")>();
  return { ...actual, requestKontrolle: vi.fn(), resolveKontrolle: vi.fn(), resolveInspectionEntry: vi.fn(), hasActiveKontrolle: vi.fn() };
});
vi.mock("@/lib/vorgabeService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/vorgabeService")>();
  return { ...actual, createVorgabe: vi.fn(), updateVorgabe: vi.fn(), deleteVorgabe: vi.fn(), listVorgaben: vi.fn() };
});
vi.mock("@/lib/autoKontrolleService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/autoKontrolleService")>();
  return { ...actual, setAutoKontrolleSettings: vi.fn() };
});
vi.mock("@/lib/cleaningService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/cleaningService")>();
  return { ...actual, setCleaningSettings: vi.fn() };
});
vi.mock("@/lib/orgasmusAnforderungService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/orgasmusAnforderungService")>();
  return { ...actual, createOrgasmusAnforderung: vi.fn(), withdrawOrgasmusAnforderung: vi.fn() };
});
vi.mock("@/lib/releaseNowService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/releaseNowService")>();
  // `previewReleaseNow` bleibt ECHT — sie ist genau das, was hier geprüft wird.
  return { ...actual, releaseNow: vi.fn() };
});
vi.mock("@/lib/strafurteilService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/strafurteilService")>();
  return { ...actual, judgeOffense: vi.fn(), requireDetectedOffense: vi.fn() };
});
// buildStrafbuch aggregiert quer über viele Prisma-Tabellen (Entry, VerschlussAnforderung, AppMeta,
// ...) — für den judge_offense-dryRun (B-05: "ist der ref noch ein live erkanntes Vergehen?") reicht
// ein Mock, dessen konkreter Rückgabewert egal ist, weil requireDetectedOffense direkt daneben
// ebenfalls gemockt ist und ihn nicht interpretiert.
vi.mock("@/lib/strafbuch", () => ({ buildStrafbuch: vi.fn().mockResolvedValue({}) }));

import {
  mcpRequestLock, mcpSetLockPeriod, mcpRequestInspection, mcpRequestOrgasm, mcpSetTrainingGoal,
  mcpWithdraw, mcpEditTrainingGoal, mcpDeleteTrainingGoal, mcpSetCleaning, mcpResolveInspection,
  mcpEditLockPeriod, mcpEditLockRequest, mcpJudgeOffense, mcpCreateTask, mcpEditTask, mcpSetAutoInspections,
  mcpReviewTaskProof, mcpReleaseNow,
} from "./mcpWrite";
import { prisma } from "@/lib/prisma";
import { createVerschlussAnforderung, updateLockPeriodEnd, updateLockRequest, withdrawVerschlussAnforderungById } from "@/lib/verschlussAnforderungService";
import { requestKontrolle, resolveKontrolle, resolveInspectionEntry, hasActiveKontrolle } from "@/lib/kontrolleService";
import { createVorgabe, updateVorgabe, deleteVorgabe } from "@/lib/vorgabeService";
import { setCleaningSettings } from "@/lib/cleaningService";
import { setAutoKontrolleSettings } from "@/lib/autoKontrolleService";
import { createOrgasmusAnforderung } from "@/lib/orgasmusAnforderungService";
import { judgeOffense, requireDetectedOffense } from "@/lib/strafurteilService";
import { releaseNow } from "@/lib/releaseNowService";
import { CLEANING_WINDOWS_MAX } from "@/lib/constants";
import { ALL_WEEKDAYS, weekdayMaskOf } from "@/lib/weekdays";
import { taskRow } from "@/test/taskRow";
import { taskProofRow } from "@/test/taskProofRow";

const userMock = prisma.user.findUnique as unknown as ReturnType<typeof vi.fn>;
const userFindUniqueOrThrowMock = prisma.user.findUniqueOrThrow as unknown as ReturnType<typeof vi.fn>;
const trainingVorgabeMock = prisma.trainingVorgabe.findFirst as unknown as ReturnType<typeof vi.fn>;
const kontrollFindFirstMock = prisma.kontrollAnforderung.findFirst as unknown as ReturnType<typeof vi.fn>;
const lockPeriodFindManyMock = prisma.verschlussAnforderung.findMany as unknown as ReturnType<typeof vi.fn>;
const vaFindUniqueMock = prisma.verschlussAnforderung.findUnique as unknown as ReturnType<typeof vi.fn>;
const entryFindFirstMock = prisma.entry.findFirst as unknown as ReturnType<typeof vi.fn>;
const strafeRecordFindUniqueMock = prisma.strafeRecord.findUnique as unknown as ReturnType<typeof vi.fn>;
const detectedOffenseMock = requireDetectedOffense as unknown as ReturnType<typeof vi.fn>;
const taskCreateMock = prisma.task.create as unknown as ReturnType<typeof vi.fn>;
const taskFindUniqueMock = prisma.task.findUnique as unknown as ReturnType<typeof vi.fn>;
const taskFindFirstMock = prisma.task.findFirst as unknown as ReturnType<typeof vi.fn>;
const taskUpdateManyMock = prisma.task.updateMany as unknown as ReturnType<typeof vi.fn>;
const taskProofUpdateMock = prisma.taskProof.update as unknown as ReturnType<typeof vi.fn>;

/** Die Antwort-Form von `dryRunPreview` — dieselbe für jedes Werkzeug. */
type TaskPreview = { wouldSucceed: boolean; problem?: string; preview: Record<string, unknown> };

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
  // Eine Zeile für beide Settings-Tools: set_cleaning liest die Reinigungs-, set_auto_inspections
  // die Auto-Kontroll-Spalten desselben Users.
  userFindUniqueOrThrowMock.mockResolvedValue({
    cleaningAllowed: false, cleaningMaxMinutes: 15, cleaningMaxPerDay: 0, cleaningWindows: JSON.stringify([{ start: "19:00", end: "20:00" }]),
    id: "u1", timezone: "Europe/Zurich", autoKontrolleAktiv: true,
    autoKontrollePerDayMin: 2, autoKontrollePerDayMax: 4, autoKontrolleRuheVon: "22:00", autoKontrolleRuheBis: "06:00",
    autoKontrolleFristVon: 15, autoKontrolleFristBis: 60, autoKontrolleFensterVon: "", autoKontrolleFensterBis: "",
    autoKontrolleNurBeiSperre: false, autoInspectionPlannedFor: null,
  });
  strafeRecordFindUniqueMock.mockResolvedValue(null);
  // Default: ref ist ein aktuell erkanntes Vergehen (punish/dismiss-diff braucht das, siehe B-05-Guard
  // gegen OFFENSE_NOT_FOUND). Tests, die genau diesen Guard prüfen, setzen [] explizit.
  detectedOffenseMock.mockResolvedValue({ canonicalType: "unauthorized_opening", offenseType: "OEFFNEN_ENTRY", refId: "o1", at: JETZT });
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
    expect(setCleaningSettings).not.toHaveBeenCalled();
  });

  it("set_auto_inspections", async () => {
    const r = await mcpSetAutoInspections("sub", { dryRun: true, perDayMax: 6 });
    expect((r as { dryRun: boolean }).dryRun).toBe(true);
    expect(setAutoKontrolleSettings).not.toHaveBeenCalled();
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

  it("request_orgasm: explizites endsAt vor beginnt wird auch im dryRun abgelehnt (code-review-Fund)", async () => {
    // Beide Zeiten liegen in der Zukunft (checkOrgasmWindowEnd allein würde das durchwinken) —
    // aber endsAt < beginnt ist strukturell ungültig, dieselbe Regel wie beim echten Commit.
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

  it("release_now: nicht verschlossener User wird auch im dryRun abgelehnt — mit dem Code der SCHNITTSTELLE", async () => {
    // entryFindFirstMock steht per Default auf NICHT_VERSCHLOSSEN.
    // Der Punkt dieses Tests ist der NAME: `createOeffnenEntryTx` wirft intern `NOT_LOCKED`, und
    // genau der stand hier einmal. Die Vorschau muss denselben Code nennen wie der Vollzug —
    // `NOT_LOCKED` trägt im errors-Namensraum TRÄGER-Text und gehört einer Keyholderin nie vorgelegt.
    const r = await mcpReleaseNow("sub", { dryRun: true }) as { wouldSucceed: boolean; problem?: string };
    expect(r.wouldSucceed).toBe(false);
    expect(r.problem).toBe("USER_NOT_LOCKED");
    expect(releaseNow).not.toHaveBeenCalled();
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

  // Wie beim Auto-Kontroll-Zwilling: das Tool-Schema (route.ts) weist Werte ausserhalb des Bereichs
  // inzwischen schon ab. Der Klemm-Schritt bleibt die zweite Linie für Aufrufer ohne zod-Validierung.
  it("set_cleaning: dryRun zeigt den GEKLEMMTEN Wert, nicht den rohen Input (K-06-Falle)", async () => {
    const r = await mcpSetCleaning("sub", { dryRun: true, maxMinutes: 9999 }) as { preview: { maxMinutes: number; maxMinutesClampedFrom?: number } };
    expect(r.preview.maxMinutes).toBe(120); // CLEANING_MAX_MINUTES_RANGE.max
    expect(r.preview.maxMinutesClampedFrom).toBe(9999);
  });

  it("edit_lock_period: Ende vor der Auslösung wird auch im dryRun abgelehnt (checkLockEnd)", async () => {
    const wirksamAb = new Date("2026-08-04T12:00:00Z"); // 3 Wochen voraus
    lockPeriodFindManyMock.mockResolvedValue([{ id: "s1", userId: "u1", wirksamAb, endsAt: null, withdrawnAt: null, benachrichtigtAt: null }]);
    const r = await mcpEditLockPeriod("sub", { dryRun: true, untilAt: MORGEN.toISOString() }) as { wouldSucceed: boolean; problem?: string };
    expect(r.wouldSucceed).toBe(false);
    expect(r.problem).toBe("LOCK_PERIOD_END_MUST_BE_AFTER_TRIGGER");
    expect(updateLockPeriodEnd).not.toHaveBeenCalled();
  });

  /**
   * create_task: die Nachweis-Frist gegen das Ende der Aufgabe — auch im DAUER-MODUS, wo die
   * Vorschau keinen Zeitpunkt zu NENNEN hat.
   *
   * Sie kann trotzdem einen ausrechnen: `earliestTaskEnd` ist derselbe Helfer, mit dem `checkTask`
   * gegen den frühestmöglichen Zeitpunkt (Nullpunkt + Dauer) misst. Vorher prüfte die Vorschau in
   * diesem Modus gar nicht und meldete Erfolg für einen Aufruf, der als 400 zurückkam.
   */
  it("create_task: eine Nachweis-Frist hinter dem Ende ist auch im Dauer-Modus ein Problem", async () => {
    const args = {
      dryRun: true, title: "Plug tragen", requireKgLocked: true,
      requireProof: [{ description: "Selfie", dueMinutes: 120 }],
    };
    // Dauer 60 min, Nachweis nach 120 min — eine Stunde hinter dem frühestmöglichen Ende.
    const dauer = await mcpCreateTask("sub", { ...args, holdMinutesFromStart: 60 }) as { wouldSucceed: boolean; problem?: string };
    expect(dauer.wouldSucceed).toBe(false);
    expect(dauer.problem).toBe("TASK_PROOF_DUE_AFTER_END");

    // Innerhalb der Dauer bleibt sie zulässig — die Schranke ist die Dauer, nicht ihr Vorhandensein.
    const drin = await mcpCreateTask("sub", { ...args, holdMinutesFromStart: 180 }) as { wouldSucceed: boolean };
    expect(drin.wouldSucceed).toBe(true);

    // Und der Modus mit festem Ende urteilt unverändert: 1 h Frist, Nachweis nach 120 min.
    const fest = await mcpCreateTask("sub", { ...args, holdHours: 1 }) as { wouldSucceed: boolean; problem?: string };
    expect(fest.problem).toBe("TASK_PROOF_DUE_AFTER_END");
  });

  it("delete_training_goal: existierendes Ziel wird gefunden, nichts gelöscht", async () => {
    trainingVorgabeMock.mockResolvedValue({ id: "g1", userId: "u1", categoryId: null, gueltigAb: JETZT, gueltigBis: null, validUntilManual: false, minProTagH: 2, minProWocheH: null, minProMonatH: null, minProJahrH: null, notiz: null });
    const r = await mcpDeleteTrainingGoal("sub", { dryRun: true, id: "g1" }) as { dryRun: boolean };
    expect(r.dryRun).toBe(true);
    expect(deleteVorgabe).not.toHaveBeenCalled();
  });

  it("delete_training_goal: sucht per findFirst mit deletedAt:null (B-04) — ein gelöschtes Ziel gilt als nicht gefunden", async () => {
    trainingVorgabeMock.mockResolvedValue(null); // findFirst mit deletedAt:null findet ein gelöschtes Ziel nicht mehr
    await expect(mcpDeleteTrainingGoal("sub", { dryRun: true, id: "g1" })).rejects.toThrow(/not found/);
    expect(trainingVorgabeMock).toHaveBeenCalledWith({ where: { id: "g1", deletedAt: null } });
    expect(deleteVorgabe).not.toHaveBeenCalled();
  });

  it("resolve_inspection: gefundene Inspektion wird gemeldet, nichts aufgelöst", async () => {
    // Adressiert wird der EINTRAG — eine Selbstkontrolle hat keine Anforderung, über die sie
    // auffindbar wäre (Vorfall 07.08.2026).
    entryFindFirstMock.mockResolvedValue({ id: "e1", verifikationStatus: null });
    const r = await mcpResolveInspection("sub", { dryRun: true, action: "verify" }) as { dryRun: boolean; preview: { id: string } };
    expect(r.dryRun).toBe(true);
    expect(r.preview.id).toBe("e1");
    expect(resolveInspectionEntry).not.toHaveBeenCalled();
  });

  it("judge_offense: punish ohne text wird auch im dryRun abgelehnt", async () => {
    const r = await mcpJudgeOffense("sub", { dryRun: true, ref: "o1", action: "punish" }) as { wouldSucceed: boolean; problem?: string };
    expect(r.wouldSucceed).toBe(false);
    expect(r.problem).toBe("PENALTY_TEXT_REQUIRED");
  });
});

describe("create_task als Strafe (offenseRef)", () => {
  it("meldet eine tote ref als Problem, statt Erfolg vorzutäuschen", async () => {
    // Sonst legt der Agent seinem Nutzer eine Vorschau vor, die der Commit mit OFFENSE_NOT_FOUND
    // ablehnt — die Vorschau ist genau dafür da, das vorher zu wissen.
    detectedOffenseMock.mockResolvedValue(null);

    const r = await mcpCreateTask("sub", {
      dryRun: true, title: "Wohnung staubsaugen", holdHours: 4, offenseRef: "weg",
    }) as { wouldSucceed: boolean; problem?: string; preview: Record<string, unknown> };

    expect(r.wouldSucceed).toBe(false);
    expect(r.problem).toBe("OFFENSE_NOT_FOUND");
  });

  it("weist die Aufgabe als Strafe aus — auch wenn der Aufrufer isPunishment nicht setzt", async () => {
    // Die ref ERZWINGT die Strafe (`punishWithTask` setzt `isPunishment: true`). Zeigte die Vorschau
    // hier `false`, widerspräche sie dem Commit.
    detectedOffenseMock.mockResolvedValue({ canonicalType: "unauthorized_opening", offenseType: "OEFFNEN_ENTRY", refId: "o1", at: JETZT });

    const r = await mcpCreateTask("sub", {
      dryRun: true, title: "Wohnung staubsaugen", holdHours: 4, offenseRef: "o1",
    }) as { wouldSucceed: boolean; preview: Record<string, unknown> };

    expect(r.wouldSucceed).toBe(true);
    expect(r.preview.isPunishment).toBe(true);
    expect(r.preview.penaltyForOffense).toBe("o1");
  });

  /**
   * Leere Strings sind „nicht gesetzt", kein unlesbares Datum — manche Clients füllen ausgelassene
   * optionale Felder so. Seit die Terminierung (B1) `parseIsoDate` bedingungslos aufrief, warf die
   * Vorschau dafür einen harten Werkzeug-Fehler; der Commit-Pfad kam mit demselben Wert längst
   * zurecht (`createTask` prüft auf Truthiness). Vorschau und Commit dürfen nicht verschieden
   * urteilen.
   */
  it("ein leeres scheduledAt bedeutet sofort wirksam, nicht unlesbar", async () => {
    const r = await mcpCreateTask("sub", { dryRun: true, title: "Einkaufen", holdHours: 2, scheduledAt: "" }) as {
      wouldSucceed: boolean; preview: Record<string, unknown>;
    };

    expect(r.wouldSucceed).toBe(true);
    expect(r.preview.scheduledFor).toBeNull();
  });

  it("ohne offenseRef bleibt es eine gewöhnliche Aufgabe — ohne Strafbuch-Aufbau", async () => {
    detectedOffenseMock.mockClear();

    const r = await mcpCreateTask("sub", { dryRun: true, title: "Einkaufen", holdHours: 2 }) as {
      wouldSucceed: boolean; preview: Record<string, unknown>;
    };

    expect(r.wouldSucceed).toBe(true);
    expect(r.preview.penaltyForOffense).toBeNull();
    expect(detectedOffenseMock).not.toHaveBeenCalled();
  });
});

/**
 * Die Vorschau von `create_task` prüft mit `checkTask` — derselben Funktion, die der Commit fährt —
 * statt deren Schranken abzuschreiben. Diese Tests pinnen das an den Schranken fest, die eine
 * Abschrift übersehen hatte oder übersehen müsste. Der Anlass war die Fälligkeits-Schranke: sie hing
 * an `holdUntil` und fiel im DAUER-MODUS (`holdMinutesFromStart`) still auf „passt schon", während
 * der Commit gegen Nullpunkt + Dauer mass und mit 400 antwortete.
 */
describe("create_task: die Vorschau prüft mit checkTask, nicht mit einer Abschrift", () => {
  /** Der Dauer-Modus braucht eine Bedingung, an der die Uhr starten kann — sonst weist ihn schon die
   *  Schranke davor ab. `requireKgLocked` kostet keine Auflösung (kein Gerätename). */
  const dauerModus = { title: "Plug tragen", holdMinutesFromStart: 60, requireKgLocked: true, dryRun: true };
  /** Wirksam erst in vier Stunden — der Nullpunkt einer terminierten Aufgabe. */
  const IN_VIER_STUNDEN = new Date(JETZT.getTime() + 4 * 3600_000).toISOString();

  it("Dauer-Modus: eine Fälligkeit hinter der Haltedauer wird gemeldet, auf der Kante nicht", async () => {
    const zuSpaet = await mcpCreateTask("sub", {
      ...dauerModus, requireProof: [{ description: "zu spät", dueMinutes: 120 }],
    }) as TaskPreview;
    expect(zuSpaet.wouldSucceed).toBe(false);
    expect(zuSpaet.problem).toBe("TASK_PROOF_DUE_AFTER_END");

    // Genau auf dem Ende ist zulässig — dieselbe Kante wie im Dienst.
    const aufDerKante = await mcpCreateTask("sub", {
      ...dauerModus, requireProof: [{ description: "auf der Kante", dueMinutes: 60 }],
    }) as TaskPreview;
    expect(aufDerKante.wouldSucceed).toBe(true);
    expect(aufDerKante.problem).toBeUndefined();
  });

  it("Dauer-Modus: der Nullpunkt kürzt sich weg — eine terminierte Aufgabe misst gegen ihre Dauer, nicht gegen jetzt", async () => {
    // Gegen „jetzt" gerechnet läge „nach 30 Minuten" scheinbar weit vor dem Ende; in Wahrheit zählen
    // Fälligkeit UND Dauer ab dem Auslöse-Zeitpunkt.
    const r = await mcpCreateTask("sub", {
      ...dauerModus,
      scheduledAt: IN_VIER_STUNDEN,
      requireProof: [{ description: "halbe Stunde nach dem Start", dueMinutes: 30 }],
    }) as TaskPreview;

    expect(r.wouldSucceed).toBe(true);
    expect(r.preview.scheduledFor).toBe(IN_VIER_STUNDEN);
  });

  it("Dauer-Modus ohne Bedingung: die Vorschau nennt den Code, an dem der Commit ZUERST scheitert", async () => {
    // `checkTask` prüft diese Schranke VOR den Nachweisen — hier ist beides falsch, gemeldet wird
    // die erste. Genau diese Reihenfolge bekommt die Vorschau über den Aufruf geschenkt.
    const r = await mcpCreateTask("sub", {
      title: "Plug tragen", holdMinutesFromStart: 60, dryRun: true,
      requireProof: [{ description: "zu spät", dueMinutes: 120 }],
    }) as TaskPreview;

    expect(r.wouldSucceed).toBe(false);
    expect(r.problem).toBe("TASK_HOLD_DURATION_WITHOUT_REQUIREMENTS");
  });

  it("Dauer-Modus: die Vorschau nennt die GEKLEMMTE Dauer, nicht den rohen Input (K-06-Falle)", async () => {
    const r = await mcpCreateTask("sub", { ...dauerModus, holdMinutesFromStart: 0.4 }) as TaskPreview;

    expect(r.preview.hold).toBe("1 minute(s) from the moment the user has everything on");
  });

  it("festes Ende: eine Fälligkeit hinter dem Ende wird gemeldet, davor nicht", async () => {
    const zuSpaet = await mcpCreateTask("sub", {
      title: "Einkaufen", holdHours: 3, dryRun: true,
      requireProof: [{ description: "zu spät", dueMinutes: 240 }],
    }) as TaskPreview;
    expect(zuSpaet.problem).toBe("TASK_PROOF_DUE_AFTER_END");

    const passt = await mcpCreateTask("sub", {
      title: "Einkaufen", holdHours: 3, dryRun: true,
      requireProof: [{ description: "rechtzeitig", dueMinutes: 180 }],
    }) as TaskPreview;
    expect(passt.wouldSucceed).toBe(true);
  });

  /**
   * Die Ausbeute des Aufrufs: Schranken, die eine Abschrift NIE hatte. Sie stehen hier, damit ein
   * späterer Rückbau auf eigene Nachrechnung auffliegt statt still wieder Erfolg zu versprechen.
   */
  it("erbt die übrigen Schranken von checkTask — Frist zu früh, Titel, Nachweis-Zahl", async () => {
    // Ende in 15 Minuten, spätester Beginn aber erst nach der Kulanzfrist: nie erfüllbar.
    const zuFrueh = await mcpCreateTask("sub", {
      title: "Plug tragen", holdHours: 0.25, requireKgLocked: true, dryRun: true,
    }) as TaskPreview;
    expect(zuFrueh.problem).toBe("TASK_HOLD_UNTIL_TOO_SOON");

    const ohneTitel = await mcpCreateTask("sub", { title: "   ", holdHours: 3, dryRun: true }) as TaskPreview;
    expect(ohneTitel.problem).toBe("TASK_TITLE_REQUIRED");

    const zuViele = await mcpCreateTask("sub", {
      title: "Einkaufen", holdHours: 3, dryRun: true,
      requireProof: Array.from({ length: 11 }, (_, i) => ({ description: `N${i}` })),
    }) as TaskPreview;
    expect(zuViele.problem).toBe("TASK_TOO_MANY_PROOFS");
  });

  it("committet trotz der echten Prüfung nichts", async () => {
    await mcpCreateTask("sub", { ...dauerModus }) as TaskPreview;
    expect(taskCreateMock).not.toHaveBeenCalled();
  });
});

/**
 * Dieselbe Klasse für `edit_task`: die Vorschau prüft mit `checkTaskUpdate` — der Funktion, die
 * `updateTask` fährt — statt mit einer handgeschriebenen `withdrawnAt`-Abfrage. Die kannte genau
 * EINEN der Ablehnungsgründe des Commits; für eine erledigte Aufgabe und für jede gerissene
 * Feldgrenze versprach sie Erfolg und der Commit antwortete mit 400.
 */
describe("edit_task: die Vorschau prüft mit checkTaskUpdate, nicht mit einer Abschrift", () => {
  /** Die gewöhnliche offene Aufgabe mit einer Bedingung — geteilt mit `mcpEditTaskHold.test.ts`,
   *  damit eine neue Spalte der Zeile nicht in zwei Dateien nachgetragen werden muss. */
  const aufgabe = (over: Partial<Record<string, unknown>> = {}) => {
    taskFindUniqueMock.mockResolvedValue(taskRow(JETZT, over));
  };

  beforeEach(() => aufgabe());

  it("eine ERLEDIGTE Aufgabe wird gemeldet — nicht nur die zurückgezogene", async () => {
    aufgabe({ completedAt: JETZT });
    const r = await mcpEditTask("sub", { id: "t1", title: "neu", dryRun: true }) as TaskPreview;
    expect(r.wouldSucceed).toBe(false);
    expect(r.problem).toBe("TASK_NOT_EDITABLE");
  });

  it("die zurückgezogene bleibt gemeldet", async () => {
    aufgabe({ withdrawnAt: JETZT });
    const r = await mcpEditTask("sub", { id: "t1", title: "neu", dryRun: true }) as TaskPreview;
    expect(r.problem).toBe("TASK_NOT_EDITABLE");
  });

  it("erbt die Feldgrenzen — leerer Titel, zu langer Titel, zu lange Beschreibung", async () => {
    const ohneTitel = await mcpEditTask("sub", { id: "t1", title: "   ", dryRun: true }) as TaskPreview;
    expect(ohneTitel.problem).toBe("TASK_TITLE_REQUIRED");

    const zuLang = await mcpEditTask("sub", { id: "t1", title: "x".repeat(81), dryRun: true }) as TaskPreview;
    expect(zuLang.problem).toBe("TASK_TITLE_TOO_LONG");

    const zuVielText = await mcpEditTask("sub", { id: "t1", description: "x".repeat(2001), dryRun: true }) as TaskPreview;
    expect(zuVielText.problem).toBe("TASK_DESCRIPTION_TOO_LONG");
  });

  /**
   * Die Untergrenze der neuen Endzeit hängt daran, OB die Aufgabe Bedingungen hat: mit ihnen zählt
   * die Startfrist, ohne sie nur der Nullpunkt. Beides an derselben terminierten Aufgabe, damit die
   * beiden Grenzen auseinanderliegen — sonst bewiese der Test nur, dass irgendeine greift.
   *
   * Die Regel selbst gehört `taskService.test.ts`; hier steht sie, weil die Vorschau die Zahl der
   * Bedingungen ABLEITEN muss — mit einem festverdrahteten „ja" liefe die zweite Hälfte anders aus.
   */
  it("die Startfrist zählt nur bei einer Aufgabe MIT Bedingungen", async () => {
    // Wirksam ab morgen 12:00, eine Stunde Kulanz → Startfrist morgen 13:00. Ein Ende um 12:30
    // liegt davor.
    const terminiert = { wirksamAb: MORGEN, startGraceMin: 60, holdUntil: MORGEN };
    const ende = new Date(MORGEN.getTime() + 30 * 60_000).toISOString();

    aufgabe(terminiert);
    const mitBedingung = await mcpEditTask("sub", { id: "t1", holdUntilAt: ende, dryRun: true }) as TaskPreview;
    expect(mitBedingung.problem).toBe("TASK_HOLD_UNTIL_TOO_SOON");

    aufgabe({ ...terminiert, _count: { requirements: 0 } });
    const ohneBedingung = await mcpEditTask("sub", { id: "t1", holdUntilAt: ende, dryRun: true }) as TaskPreview;
    expect(ohneBedingung.wouldSucceed).toBe(true);
  });

  it("die zulässige Änderung meldet Erfolg, zeigt die neue Fassung und committet nichts", async () => {
    const r = await mcpEditTask("sub", { id: "t1", title: "Anderes tragen", dryRun: true }) as TaskPreview & {
      diff: Record<string, [unknown, unknown]>;
    };
    expect(r.wouldSucceed).toBe(true);
    expect(r.problem).toBeUndefined();
    expect(r.preview.title).toBe("Anderes tragen");
    expect(r.diff.title).toEqual(["Wohnung staubsaugen", "Anderes tragen"]);
    expect(taskUpdateManyMock).not.toHaveBeenCalled();
  });
});

/**
 * Dieselbe Klasse ein drittes Mal, für `review_task_proof`: die Vorschau prüft mit
 * `proofReviewBlockedReason` — der Funktion, die auch `reviewTaskProof` fährt. Die Regeln selbst
 * gehören `taskProofService.test.ts`; hier steht, dass die VORSCHAU sie erbt und dabei nichts
 * schreibt.
 */
describe("review_task_proof: die Vorschau prüft mit proofReviewBlockedReason, nicht mit einer Abschrift", () => {
  /** Ein eingereichter, noch nicht gesichteter Nachweis an einer offenen Aufgabe. Die Hülle kommt
   *  aus `taskProofRow`, damit ein neues Feld des `select` in `taskProofRef.ts` nicht in zwei
   *  Testdateien nachgetragen werden muss. */
  const nachweis = ({ proof, task }: { proof?: Record<string, unknown>; task?: Record<string, unknown> } = {}) => {
    taskFindFirstMock.mockResolvedValue(taskProofRow(
      [{ id: "p1", description: "Foto vom Schloss", submittedAt: JETZT, reviewedAt: null, ...proof }],
      task,
    ));
  };
  const vorschau = () =>
    mcpReviewTaskProof("sub", { taskId: "t1", index: 1, accepted: false, dryRun: true }) as Promise<TaskPreview>;

  beforeEach(() => nachweis());

  it("eine zurückgezogene Aufgabe wird gemeldet", async () => {
    nachweis({ task: { withdrawnAt: JETZT } });
    const r = await vorschau();
    expect(r.wouldSucceed).toBe(false);
    expect(r.problem).toBe("TASK_NOT_EDITABLE");
  });

  it("ein noch nicht eingereichter Nachweis wird gemeldet", async () => {
    nachweis({ proof: { submittedAt: null } });
    expect((await vorschau()).problem).toBe("TASK_PROOF_NOT_SUBMITTED");
  });

  it("die zulässige Sichtung meldet Erfolg, zeigt den Nachweis und committet nichts", async () => {
    const r = await vorschau();
    expect(r.wouldSucceed).toBe(true);
    expect(r.problem).toBeUndefined();
    expect(r.preview.title).toBe("Wohnung staubsaugen");
    expect(r.preview.description).toBe("Foto vom Schloss");
    expect(r.preview.accepted).toBe(false);
    // Ein zweites Urteil ist erlaubt (`reviewTaskProof` ist bewusst wiederholbar) — die Vorschau sagt
    // es nur an, statt es zu einem Hinderungsgrund zu machen.
    expect(r.preview.previouslyReviewed).toBe(false);
    expect(taskProofUpdateMock).not.toHaveBeenCalled();
  });

  it("ein bereits gesichteter Nachweis bleibt zulässig und wird als solcher angesagt", async () => {
    nachweis({ proof: { reviewedAt: JETZT } });
    const r = await vorschau();
    expect(r.wouldSucceed).toBe(true);
    expect(r.preview.previouslyReviewed).toBe(true);
  });
});

describe("dryRun liefert diff (B-05: Vorschau statt Ja/Nein bei Edits eines bestehenden Objekts)", () => {
  it("edit_training_goal: diff zeigt genau die geänderten Felder [alt, neu]", async () => {
    trainingVorgabeMock.mockResolvedValue({ id: "g1", userId: "u1", categoryId: null, gueltigAb: JETZT, gueltigBis: null, validUntilManual: false, minProTagH: 2, minProWocheH: null, minProMonatH: null, minProJahrH: null, notiz: "alt" });
    const r = await mcpEditTrainingGoal("sub", { dryRun: true, id: "g1", minPerDayHours: 3 }) as { diff: Record<string, [unknown, unknown]> };
    expect(r.diff.minPerDayHours).toEqual([2, 3]);
    expect(r.diff.note).toBeUndefined(); // unverändert (Notiz nicht mitgegeben → Bestand behalten)
  });

  it("delete_training_goal: diff zeigt alle Felder als [Wert, undefined] (Objekt verschwindet)", async () => {
    trainingVorgabeMock.mockResolvedValue({ id: "g1", userId: "u1", categoryId: null, gueltigAb: JETZT, gueltigBis: null, validUntilManual: false, minProTagH: 2, minProWocheH: null, minProMonatH: null, minProJahrH: null, notiz: null });
    const r = await mcpDeleteTrainingGoal("sub", { dryRun: true, id: "g1" }) as { diff: Record<string, [unknown, unknown]> };
    expect(r.diff.minPerDayHours).toEqual([2, null]);
  });

  it("set_cleaning: diff zeigt den Bestandswert gegen den GEKLEMMTEN neuen Wert", async () => {
    userFindUniqueOrThrowMock.mockResolvedValue({ cleaningAllowed: false, cleaningMaxMinutes: 15, cleaningMaxPerDay: 0 });
    const r = await mcpSetCleaning("sub", { dryRun: true, maxMinutes: 9999 }) as { diff: Record<string, [unknown, unknown]> };
    expect(r.diff.maxMinutes).toEqual([15, 120]);
  });

  it("resolve_inspection: diff zeigt den bisherigen gegen den resultierenden verifikationStatus", async () => {
    entryFindFirstMock.mockResolvedValue({ id: "e1", verifikationStatus: "rejected" });
    const r = await mcpResolveInspection("sub", { dryRun: true, action: "verify" }) as { diff: Record<string, [unknown, unknown]> };
    expect(r.diff.verifikationStatus).toEqual(["rejected", "manual"]);
  });

  it("edit_lock_period: diff zeigt das bisherige gegen das neue Enddatum", async () => {
    lockPeriodFindManyMock.mockResolvedValue([{ id: "s1", userId: "u1", wirksamAb: null, endsAt: null, withdrawnAt: null, benachrichtigtAt: null }]);
    const r = await mcpEditLockPeriod("sub", { dryRun: true, untilAt: MORGEN.toISOString() }) as { diff: Record<string, [unknown, unknown]> };
    expect(r.diff.endsAt).toEqual([null, "2026-07-18T14:00:00+02:00"]); // K-02: Offset-ISO (Europe/Zurich) statt Zulu
    expect(r.diff.indefinite).toEqual([true, false]);
  });

  it("judge_offense: erstes Urteil zeigt diff als Create (undefined → Wert), kein Bestand vorher", async () => {
    strafeRecordFindUniqueMock.mockResolvedValue(null);
    const r = await mcpJudgeOffense("sub", { dryRun: true, ref: "o1", action: "punish", text: "20 Schläge" }) as { diff: Record<string, [unknown, unknown]> };
    expect(r.diff.status).toEqual([undefined, "PUNISHED"]);
    expect(r.diff.reason).toEqual([undefined, "20 Schläge"]);
  });

  it("judge_offense: erneutes Urteil zeigt diff gegen den bestehenden StrafeRecord", async () => {
    strafeRecordFindUniqueMock.mockResolvedValue({ userId: "u1", status: "DISMISSED", reason: "alt", judgedBy: "ai", erledigtAt: null });
    const r = await mcpJudgeOffense("sub", { dryRun: true, ref: "o1", action: "punish", text: "neu" }) as { diff: Record<string, [unknown, unknown]> };
    expect(r.diff.status).toEqual(["DISMISSED", "PUNISHED"]);
    expect(r.diff.reason).toEqual(["alt", "neu"]);
  });

  // Diese beiden Fälle wären ohne Guard fälschlich als erfolgreiche Transition dargestellt worden,
  // obwohl judgeOffense sie real ablehnt (JUDGMENT_NOT_FOUND / PENALTY_NOT_PUNISHED) — der dryRun
  // prüft den Strafbuch-Zustand hier bewusst NICHT (siehe Kommentar in mcpWrite.ts), darf aber auch
  // keinen diff vortäuschen, den er nicht kennt.
  it("judge_offense: reopen ohne bestehenden StrafeRecord liefert KEINEN diff (würde real JUDGMENT_NOT_FOUND ablehnen)", async () => {
    strafeRecordFindUniqueMock.mockResolvedValue(null);
    const r = await mcpJudgeOffense("sub", { dryRun: true, ref: "o1", action: "reopen" }) as { diff?: Record<string, [unknown, unknown]> };
    expect(r.diff).toBeUndefined();
  });

  it("judge_offense: complete auf nicht-PUNISHED Record liefert KEINEN diff (würde real PENALTY_NOT_PUNISHED ablehnen)", async () => {
    strafeRecordFindUniqueMock.mockResolvedValue({ userId: "u1", status: "DISMISSED", reason: "alt", judgedBy: "ai", erledigtAt: null });
    const r = await mcpJudgeOffense("sub", { dryRun: true, ref: "o1", action: "complete" }) as { diff?: Record<string, [unknown, unknown]> };
    expect(r.diff).toBeUndefined();
  });

  it("judge_offense: reopen mit bestehendem Record zeigt jedes Feld als [Wert, null] (Zeile verschwindet)", async () => {
    strafeRecordFindUniqueMock.mockResolvedValue({ userId: "u1", status: "PUNISHED", reason: "20 Schläge", judgedBy: "ai", erledigtAt: null });
    const r = await mcpJudgeOffense("sub", { dryRun: true, ref: "o1", action: "reopen" }) as { diff: Record<string, [unknown, unknown]> };
    expect(r.diff.status).toEqual(["PUNISHED", null]);
    expect(r.diff.reason).toEqual(["20 Schläge", null]);
  });

  it("judge_offense: punish auf ref ohne aktuell erkanntes Vergehen liefert KEINEN diff (würde real OFFENSE_NOT_FOUND ablehnen)", async () => {
    strafeRecordFindUniqueMock.mockResolvedValue(null);
    detectedOffenseMock.mockResolvedValue(null); // ref "o1" ist kein erkanntes Vergehen (mehr)
    const r = await mcpJudgeOffense("sub", { dryRun: true, ref: "o1", action: "punish", text: "20 Schläge" }) as { diff?: Record<string, [unknown, unknown]> };
    expect(r.diff).toBeUndefined();
  });

  it("judge_offense: ref eines ANDEREN Users wird nicht als before angezeigt (Cross-User-Leak)", async () => {
    strafeRecordFindUniqueMock.mockResolvedValue({ userId: "ANDERER-USER", status: "PUNISHED", reason: "fremdes Urteil", judgedBy: "ai", erledigtAt: null });
    const r = await mcpJudgeOffense("sub", { dryRun: true, ref: "o1", action: "punish", text: "neu" }) as { diff: Record<string, [unknown, unknown]> };
    expect(r.diff.status).toEqual([undefined, "PUNISHED"]); // Create-Diff, NICHT gegen das fremde Urteil
    expect(r.diff.reason).not.toContain("fremdes Urteil");
  });
});

/**
 * Mehrere Einschliess-Anforderungen dürfen koexistieren (v6). Damit bekommt der MCP zwei neue
 * Fähigkeiten, die vorher niemand brauchte: EINE davon ändern (`edit_lock_request`) und EINE davon
 * zurückziehen (`withdraw` mit id). Beide müssen dieselbe Zeile treffen, die sie melden.
 */
describe("mehrere Anforderungen: edit_lock_request + withdraw per id", () => {
  /** Eine offene ANFORDERUNGs-Zeile, wie getKeyholderLockRequests sie liefert. */
  const anf = (over: object = {}) => ({
    id: "a1", userId: "u1", art: "ANFORDERUNG", endsAt: MORGEN, message: null, minDurationHours: null,
    lockEndsAt: null, deviceId: null, device: null, cleaningAllowed: false,
    fulfilledAt: null, withdrawnAt: null, wirksamAb: null, benachrichtigtAt: JETZT, ...over,
  });

  it("dryRun committet nichts", async () => {
    lockPeriodFindManyMock.mockResolvedValue([anf()]);
    const r = await mcpEditLockRequest("sub", { dryRun: true, message: "neu" });
    expect((r as { dryRun: boolean }).dryRun).toBe(true);
    expect(updateLockRequest).not.toHaveBeenCalled();
  });

  it("diff zeigt genau die geänderten Felder [alt, neu]", async () => {
    lockPeriodFindManyMock.mockResolvedValue([anf({ minDurationHours: 24 })]);
    const r = await mcpEditLockRequest("sub", { dryRun: true, lockUntilAt: MORGEN.toISOString() }) as { diff: Record<string, [unknown, unknown]> };
    expect(r.diff.minDurationHours).toEqual([24, null]); // vom absoluten Ende verdrängt
    expect(r.diff.lockUntilAt).toEqual([null, "2026-07-18T14:00:00+02:00"]);
    expect(r.diff.deadlineAt).toBeUndefined(); // unangetastet → kein Diff-Eintrag
  });

  it("ein Sperr-Ende vor der Auslösung wird auch im dryRun abgelehnt (checkLockEnd)", async () => {
    const wirksamAb = new Date("2026-08-04T12:00:00Z"); // 3 Wochen voraus
    lockPeriodFindManyMock.mockResolvedValue([anf({ wirksamAb, benachrichtigtAt: null })]);
    const r = await mcpEditLockRequest("sub", { dryRun: true, lockUntilAt: MORGEN.toISOString() }) as { wouldSucceed: boolean; problem?: string };
    expect(r.wouldSucceed).toBe(false);
    expect(r.problem).toBe("LOCK_PERIOD_END_MUST_BE_AFTER_TRIGGER");
    expect(updateLockRequest).not.toHaveBeenCalled();
  });

  it("mehrere offen und keine id → Fehler mit den Kandidaten, statt eine zu raten", async () => {
    const geplant = anf({ id: "a2", wirksamAb: new Date("2026-08-04T12:00:00Z"), benachrichtigtAt: null });
    lockPeriodFindManyMock.mockResolvedValue([geplant, anf()]);

    // Die Kandidaten stehen IM Fehler — sonst müsste der Agent erst ein Lese-Tool suchen.
    await expect(mcpEditLockRequest("sub", { message: "neu" })).rejects.toThrow(/2 lock requests are open.*"id":"a2".*"id":"a1"/);
    expect(updateLockRequest).not.toHaveBeenCalled();
  });

  it("mit id wird genau die gemeinte geändert, die übrige steht unter untouched", async () => {
    const geplant = anf({ id: "a2", wirksamAb: new Date("2026-08-04T12:00:00Z"), benachrichtigtAt: null });
    lockPeriodFindManyMock.mockResolvedValue([geplant, anf()]);
    (updateLockRequest as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, data: { id: "a1", userId: "u1", notified: true, deliveredToPoller: false } });

    const r = await mcpEditLockRequest("sub", { id: "a1", message: "neu" }) as { id: string; untouched: { id: string; status: string }[]; message: string };
    expect(r.id).toBe("a1");
    expect(r.untouched).toEqual([{ id: "a2", status: "scheduled", scheduledFor: "2026-08-04T14:00:00+02:00", endsAt: "2026-07-18T14:00:00+02:00", message: null }]);
    expect(r.message).toContain("2 lock requests are open");
  });

  it("Mindestdauer und absolutes Sperr-Ende zusammen werden abgelehnt, statt eines still zu verwerfen", async () => {
    // Die Regel liegt im Service (LOCK_DURATION_OR_END) — unwrap() macht daraus den englischen Satz.
    lockPeriodFindManyMock.mockResolvedValue([anf()]);
    (updateLockRequest as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, status: 400, error: "LOCK_DURATION_OR_END" });
    await expect(mcpEditLockRequest("sub", { minDurationHours: 12, lockUntilAt: MORGEN.toISOString() }))
      .rejects.toThrow(/not both/);
  });

  it("dryRun meldet den Mindestdauer+Sperr-Ende-Konflikt schon vor dem Commit (nicht wouldSucceed)", async () => {
    // Die Vorschau darf nicht Erfolg versprechen für eine Eingabe, die updateLockRequest ablehnt.
    lockPeriodFindManyMock.mockResolvedValue([anf()]);
    const r = await mcpEditLockRequest("sub", { dryRun: true, minDurationHours: 12, lockUntilAt: MORGEN.toISOString() }) as { wouldSucceed: boolean; problem?: string };
    expect(r.wouldSucceed).toBe(false);
    expect(r.problem).toBe("LOCK_DURATION_OR_END");
    expect(updateLockRequest).not.toHaveBeenCalled();
  });

  it("withdraw mit id trifft genau eine Zeile — und prüft, dass sie zum Sub und zur Art gehört", async () => {
    vaFindUniqueMock.mockResolvedValue({ id: "a1", userId: "u1", art: "ANFORDERUNG", wirksamAb: null, benachrichtigtAt: null, endsAt: null, message: null });
    (withdrawVerschlussAnforderungById as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, data: { userId: "u1", notified: true } });

    const r = await mcpWithdraw("sub", { target: "lock_request", id: "a1" }) as { withdrawn: number };
    expect(r.withdrawn).toBe(1);
    expect(withdrawVerschlussAnforderungById).toHaveBeenCalledWith("a1", "ai");

    // Fremder Sub / falsche Art / bereits weg → gar kein Rückzug, statt stillem Erfolg.
    vaFindUniqueMock.mockResolvedValue({ id: "a1", userId: "u2", art: "ANFORDERUNG", wirksamAb: null, benachrichtigtAt: null, endsAt: null, message: null });
    await expect(mcpWithdraw("sub", { target: "lock_request", id: "a1" })).rejects.toThrow(/No open lock_request/);
    vaFindUniqueMock.mockResolvedValue({ id: "a1", userId: "u1", art: "SPERRZEIT", wirksamAb: null, benachrichtigtAt: null, endsAt: null, message: null });
    await expect(mcpWithdraw("sub", { target: "lock_request", id: "a1" })).rejects.toThrow(/No open lock_request/);
    // „Bereits zurückgezogen" beurteilt der Service (eine Wahrheit, eine Stelle) — der Guard hier
    // beantwortet nur „gehört die Zeile diesem Sub und dieser Art?".
    vaFindUniqueMock.mockResolvedValue({ id: "a1", userId: "u1", art: "ANFORDERUNG", wirksamAb: null, benachrichtigtAt: null, endsAt: null, message: null });
    (withdrawVerschlussAnforderungById as unknown as ReturnType<typeof vi.fn>)
      .mockResolvedValue({ ok: false, status: 400, error: "LOCK_PERIOD_ALREADY_WITHDRAWN" });
    await expect(mcpWithdraw("sub", { target: "lock_request", id: "a1" })).rejects.toThrow(/already/);
    expect(withdrawVerschlussAnforderungById).toHaveBeenCalledTimes(2);
  });

  it("withdraw dryRun ohne id listet die betroffenen Anforderungen (id + Status + Nachricht), nicht nur die Zahl", async () => {
    // Bei mehreren offenen sagt eine blosse „2" nicht, WELCHE ein id-loser Rückzug träfe — die Liste
    // macht die gezielte Einzel-Rücknahme überhaupt erst wählbar.
    const geplant = anf({ id: "a2", message: "später", wirksamAb: new Date("2026-08-04T12:00:00Z"), benachrichtigtAt: null });
    lockPeriodFindManyMock.mockResolvedValue([geplant, anf({ message: "jetzt" })]);

    const r = await mcpWithdraw("sub", { target: "lock_request", dryRun: true }) as {
      preview: { willWithdraw: number; targets: { id: string; status: string; message: string | null }[] };
    };
    expect(r.preview.willWithdraw).toBe(2);
    expect(r.preview.targets).toEqual([
      { id: "a2", status: "scheduled", scheduledFor: "2026-08-04T14:00:00+02:00", endsAt: "2026-07-18T14:00:00+02:00", message: "später" },
      { id: "a1", status: "triggered", scheduledFor: null, endsAt: "2026-07-18T14:00:00+02:00", message: "jetzt" },
    ]);
    expect(withdrawVerschlussAnforderungById).not.toHaveBeenCalled();
  });

  it("request_lock: eine TERMINIERTE Anforderung ist auch bei verschlossenem Sub erlaubt", async () => {
    entryFindFirstMock.mockResolvedValue(VERSCHLOSSEN);
    const r = await mcpRequestLock("sub", { dryRun: true, deadlineHours: 4, delayMinutes: 60 }) as { wouldSucceed: boolean };
    expect(r.wouldSucceed).toBe(true);

    const sofort = await mcpRequestLock("sub", { dryRun: true, deadlineHours: 4 }) as { wouldSucceed: boolean; problem?: string };
    expect(sofort.wouldSucceed).toBe(false);
    expect(sofort.problem).toBe("USER_ALREADY_LOCKED");
  });

  it("request_lock: Mindestdauer und absolutes Sperr-Ende zusammen meldet schon der dryRun", async () => {
    const r = await mcpRequestLock("sub", { dryRun: true, deadlineHours: 4, minDurationHours: 12, lockUntilAt: MORGEN.toISOString() }) as { wouldSucceed: boolean; problem?: string };
    expect(r.wouldSucceed).toBe(false);
    expect(r.problem).toBe("LOCK_DURATION_OR_END");
    expect(createVerschlussAnforderung).not.toHaveBeenCalled();
  });
});

/**
 * set_cleaning.windows: die Reinigungs-Fenster über den MCP umlegen, ergänzen, löschen. Die Liste
 * ERSETZT den Stand — deshalb muss der Agent sehen, was er dabei verdrängt (diff), und darf keine
 * Fenster still verlieren, wenn ein Paar Murks ist (der Lese-Pfad verwirft solche Paare, siehe
 * parseCleaningWindows — genau das wäre hier eine unbemerkte Löschung).
 */
describe("set_cleaning: Reinigungs-Fenster", () => {
  const setCleaningMock = setCleaningSettings as unknown as ReturnType<typeof vi.fn>;
  beforeEach(() => setCleaningMock.mockResolvedValue({ ok: true, data: null }));

  it("ersetzt die ganze Liste — der Service bekommt genau die übergebenen Fenster", async () => {
    const windows = [{ start: "07:00", end: "08:00" }, { start: "19:00", end: "20:30" }];
    const r = await mcpSetCleaning("sub", { windows }) as { message: string };
    // `changedBy` steht mit dabei: die Reinigungs-Historie hält fest, wer geändert hat — über den
    // MCP ist das die KI. Die Wochentage sind zu diesem Zeitpunkt bereits Maske: der MCP nimmt sie
    // als ISO-Liste entgegen, der Service kennt nur die Speicherform.
    const gespeichert = windows.map((w) => ({ ...w, days: ALL_WEEKDAYS }));
    expect(setCleaningMock).toHaveBeenCalledWith("u1", { allowed: undefined, maxMinutes: undefined, maxPerDay: undefined, windows: gespeichert, changedBy: "ai" });
    expect(r.message).toContain("07:00-08:00 daily, 19:00-20:30 daily");
  });

  it("Wochentage kommen als ISO-Liste und gehen als Maske weiter", async () => {
    const r = await mcpSetCleaning("sub", { windows: [{ start: "06:00", end: "07:00", days: [1, 2] }] }) as { message: string };
    expect(setCleaningMock).toHaveBeenCalledWith("u1", expect.objectContaining({
      windows: [{ start: "06:00", end: "07:00", days: weekdayMaskOf([1, 2]) }],
    }));
    expect(r.message).toContain("06:00-07:00 mon,tue");
  });

  it("eine leere Tages-Liste wird abgelehnt — eine Regel, die nie gilt, ist keine", async () => {
    await expect(mcpSetCleaning("sub", { windows: [{ start: "06:00", end: "07:00", days: [] }] }))
      .rejects.toThrow(/windows\[0\].*Invalid time/);
    expect(setCleaningMock).not.toHaveBeenCalled();
  });

  it("windows:[] löscht alle Fenster — und die Meldung sagt, dass das die Reinigung NICHT verbietet", async () => {
    const r = await mcpSetCleaning("sub", { windows: [] }) as { message: string };
    expect(setCleaningMock).toHaveBeenCalledWith("u1", expect.objectContaining({ windows: [] }));
    expect(r.message).toMatch(/no longer restricted to times of day/);
    expect(r.message).toMatch(/allowed:false/);
  });

  it("ohne windows bleiben die Fenster unberührt (undefined, nicht [])", async () => {
    await mcpSetCleaning("sub", { maxMinutes: 20 });
    expect(setCleaningMock).toHaveBeenCalledWith("u1", expect.objectContaining({ windows: undefined }));
  });

  it("ein ungültiges Paar wird mit Index + Grund abgelehnt, statt still zu verschwinden", async () => {
    await expect(mcpSetCleaning("sub", { windows: [{ start: "07:00", end: "08:00" }, { start: "19:00", end: "18:00" }] }))
      .rejects.toThrow(/windows\[1\] \{"start":"19:00","end":"18:00","days":127\}: The end must be after the start/);
    expect(setCleaningMock).not.toHaveBeenCalled();
  });

  it("dieselbe Ablehnung schon im dryRun — der Preview darf nichts versprechen, was der Commit ablehnt", async () => {
    await expect(mcpSetCleaning("sub", { dryRun: true, windows: [{ start: "25:00", end: "26:00" }] }))
      .rejects.toThrow(/windows\[0\].*Invalid time/);
  });

  it("zu viele Fenster werden abgelehnt — ohne Index, die Liste als Ganzes ist zu lang", async () => {
    const windows = Array.from({ length: CLEANING_WINDOWS_MAX + 1 }, () => ({ start: "07:00", end: "08:00" }));
    await expect(mcpSetCleaning("sub", { windows })).rejects.toThrow(/^windows: Too many cleaning windows$/);
    expect(setCleaningMock).not.toHaveBeenCalled();
  });

  it("ganz ohne Feld: der Hinweis nennt windows mit", async () => {
    await expect(mcpSetCleaning("sub", {})).rejects.toThrow(/allowed, maxMinutes, maxPerDay, windows/);
  });

  it("dryRun zeigt die ALTE gegen die NEUE Liste und committet nichts", async () => {
    const r = await mcpSetCleaning("sub", { dryRun: true, windows: [{ start: "06:00", end: "07:00" }] }) as {
      preview: { windows: string[] }; diff: Record<string, [unknown, unknown]>;
    };
    expect(r.preview.windows).toEqual(["06:00-07:00 daily"]);
    expect(r.diff.windows).toEqual([["19:00-20:00 daily"], ["06:00-07:00 daily"]]);
    expect(setCleaningMock).not.toHaveBeenCalled();
  });

  it("dryRun ohne windows: kein Fenster-Diff (unberührt heisst unberührt)", async () => {
    const r = await mcpSetCleaning("sub", { dryRun: true, allowed: true }) as { diff: Record<string, [unknown, unknown]> };
    expect(r.diff.windows).toBeUndefined();
    expect(r.diff.allowed).toEqual([false, true]);
  });
});
