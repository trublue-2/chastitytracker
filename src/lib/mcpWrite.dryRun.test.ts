import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * K-01 (leichte Variante, MCP-Befundliste 2026-07-17): dryRun für alle V1-Write-Tools — validiert
 * Argument-Auflösung + die hier verfügbaren Regeln, OHNE die mutierende Service-Funktion aufzurufen.
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
    // getIsLocked/hasActiveKontrolle (advisory dryRun-Checks) lesen darüber.
    entry: { findFirst: vi.fn() },
  },
}));

// Die mutierenden Service-Funktionen — dryRun darf keine davon je aufrufen.
vi.mock("@/lib/verschlussAnforderungService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/verschlussAnforderungService")>();
  return { ...actual, createVerschlussAnforderung: vi.fn(), updateSperrzeitEnde: vi.fn(), updateLockRequest: vi.fn(), withdrawVerschlussAnforderung: vi.fn(), withdrawVerschlussAnforderungById: vi.fn() };
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
  mcpEditLockPeriod, mcpEditLockRequest, mcpJudgeOffense, mcpCreateTask, mcpSetAutoInspections,
} from "./mcpWrite";
import { prisma } from "@/lib/prisma";
import { createVerschlussAnforderung, updateSperrzeitEnde, updateLockRequest, withdrawVerschlussAnforderungById } from "@/lib/verschlussAnforderungService";
import { requestKontrolle, resolveKontrolle, resolveInspectionEntry, hasActiveKontrolle } from "@/lib/kontrolleService";
import { createVorgabe, updateVorgabe, deleteVorgabe } from "@/lib/vorgabeService";
import { setReinigungSettings } from "@/lib/reinigungService";
import { setAutoKontrolleSettings } from "@/lib/autoKontrolleService";
import { createOrgasmusAnforderung } from "@/lib/orgasmusAnforderungService";
import { judgeOffense, requireDetectedOffense } from "@/lib/strafurteilService";
import { CLEANING_WINDOWS_MAX } from "@/lib/constants";

const userMock = prisma.user.findUnique as unknown as ReturnType<typeof vi.fn>;
const userFindUniqueOrThrowMock = prisma.user.findUniqueOrThrow as unknown as ReturnType<typeof vi.fn>;
const trainingVorgabeMock = prisma.trainingVorgabe.findFirst as unknown as ReturnType<typeof vi.fn>;
const kontrollFindFirstMock = prisma.kontrollAnforderung.findFirst as unknown as ReturnType<typeof vi.fn>;
const sperrzeitFindManyMock = prisma.verschlussAnforderung.findMany as unknown as ReturnType<typeof vi.fn>;
const vaFindUniqueMock = prisma.verschlussAnforderung.findUnique as unknown as ReturnType<typeof vi.fn>;
const entryFindFirstMock = prisma.entry.findFirst as unknown as ReturnType<typeof vi.fn>;
const strafeRecordFindUniqueMock = prisma.strafeRecord.findUnique as unknown as ReturnType<typeof vi.fn>;
const detectedOffenseMock = requireDetectedOffense as unknown as ReturnType<typeof vi.fn>;

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
    reinigungErlaubt: false, reinigungMaxMinuten: 15, reinigungMaxProTag: 0, reinigungsFenster: JSON.stringify([{ start: "19:00", end: "20:00" }]),
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
    expect(setReinigungSettings).not.toHaveBeenCalled();
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

  // Wie beim Auto-Kontroll-Zwilling: das Tool-Schema (route.ts) weist Werte ausserhalb des Bereichs
  // inzwischen schon ab. Der Klemm-Schritt bleibt die zweite Linie für Aufrufer ohne zod-Validierung.
  it("set_cleaning: dryRun zeigt den GEKLEMMTEN Wert, nicht den rohen Input (K-06-Falle)", async () => {
    const r = await mcpSetCleaning("sub", { dryRun: true, maxMinutes: 9999 }) as { preview: { maxMinutes: number; maxMinutesClampedFrom?: number } };
    expect(r.preview.maxMinutes).toBe(120); // CLEANING_MAX_MINUTES_RANGE.max
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

describe("dryRun liefert diff (B-05: Vorschau statt Ja/Nein bei Edits eines bestehenden Objekts)", () => {
  it("edit_training_goal: diff zeigt genau die geänderten Felder [alt, neu]", async () => {
    trainingVorgabeMock.mockResolvedValue({ id: "g1", userId: "u1", categoryId: null, gueltigAb: JETZT, gueltigBis: null, validUntilManual: false, minProTagH: 2, minProWocheH: null, minProMonatH: null, minProJahrH: null, notiz: "alt" });
    const r = await mcpEditTrainingGoal("sub", { dryRun: true, id: "g1", minPerDayHours: 3 }) as { diff: Record<string, [unknown, unknown]> };
    expect(r.diff.minProTagH).toEqual([2, 3]);
    expect(r.diff.note).toBeUndefined(); // unverändert (Notiz nicht mitgegeben → Bestand behalten)
  });

  it("delete_training_goal: diff zeigt alle Felder als [Wert, undefined] (Objekt verschwindet)", async () => {
    trainingVorgabeMock.mockResolvedValue({ id: "g1", userId: "u1", categoryId: null, gueltigAb: JETZT, gueltigBis: null, validUntilManual: false, minProTagH: 2, minProWocheH: null, minProMonatH: null, minProJahrH: null, notiz: null });
    const r = await mcpDeleteTrainingGoal("sub", { dryRun: true, id: "g1" }) as { diff: Record<string, [unknown, unknown]> };
    expect(r.diff.minProTagH).toEqual([2, null]);
  });

  it("set_cleaning: diff zeigt den Bestandswert gegen den GEKLEMMTEN neuen Wert", async () => {
    userFindUniqueOrThrowMock.mockResolvedValue({ reinigungErlaubt: false, reinigungMaxMinuten: 15, reinigungMaxProTag: 0 });
    const r = await mcpSetCleaning("sub", { dryRun: true, maxMinutes: 9999 }) as { diff: Record<string, [unknown, unknown]> };
    expect(r.diff.maxMinutes).toEqual([15, 120]);
  });

  it("resolve_inspection: diff zeigt den bisherigen gegen den resultierenden verifikationStatus", async () => {
    entryFindFirstMock.mockResolvedValue({ id: "e1", verifikationStatus: "rejected" });
    const r = await mcpResolveInspection("sub", { dryRun: true, action: "verify" }) as { diff: Record<string, [unknown, unknown]> };
    expect(r.diff.verifikationStatus).toEqual(["rejected", "manual"]);
  });

  it("edit_lock_period: diff zeigt das bisherige gegen das neue Enddatum", async () => {
    sperrzeitFindManyMock.mockResolvedValue([{ id: "s1", userId: "u1", wirksamAb: null, endetAt: null, withdrawnAt: null, benachrichtigtAt: null }]);
    const r = await mcpEditLockPeriod("sub", { dryRun: true, untilAt: MORGEN.toISOString() }) as { diff: Record<string, [unknown, unknown]> };
    expect(r.diff.endetAt).toEqual([null, "2026-07-18T14:00:00+02:00"]); // K-02: Offset-ISO (Europe/Zurich) statt Zulu
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
    id: "a1", userId: "u1", art: "ANFORDERUNG", endetAt: MORGEN, nachricht: null, dauerH: null,
    sperrEndetAt: null, deviceId: null, device: null, reinigungErlaubt: false,
    fulfilledAt: null, withdrawnAt: null, wirksamAb: null, benachrichtigtAt: JETZT, ...over,
  });

  it("dryRun committet nichts", async () => {
    sperrzeitFindManyMock.mockResolvedValue([anf()]);
    const r = await mcpEditLockRequest("sub", { dryRun: true, message: "neu" });
    expect((r as { dryRun: boolean }).dryRun).toBe(true);
    expect(updateLockRequest).not.toHaveBeenCalled();
  });

  it("diff zeigt genau die geänderten Felder [alt, neu]", async () => {
    sperrzeitFindManyMock.mockResolvedValue([anf({ dauerH: 24 })]);
    const r = await mcpEditLockRequest("sub", { dryRun: true, lockUntilAt: MORGEN.toISOString() }) as { diff: Record<string, [unknown, unknown]> };
    expect(r.diff.minDurationHours).toEqual([24, null]); // vom absoluten Ende verdrängt
    expect(r.diff.lockUntilAt).toEqual([null, "2026-07-18T14:00:00+02:00"]);
    expect(r.diff.deadlineAt).toBeUndefined(); // unangetastet → kein Diff-Eintrag
  });

  it("ein Sperr-Ende vor der Auslösung wird auch im dryRun abgelehnt (checkLockEnd)", async () => {
    const wirksamAb = new Date("2026-08-04T12:00:00Z"); // 3 Wochen voraus
    sperrzeitFindManyMock.mockResolvedValue([anf({ wirksamAb, benachrichtigtAt: null })]);
    const r = await mcpEditLockRequest("sub", { dryRun: true, lockUntilAt: MORGEN.toISOString() }) as { wouldSucceed: boolean; problem?: string };
    expect(r.wouldSucceed).toBe(false);
    expect(r.problem).toBe("LOCK_PERIOD_END_MUST_BE_AFTER_TRIGGER");
    expect(updateLockRequest).not.toHaveBeenCalled();
  });

  it("mehrere offen und keine id → Fehler mit den Kandidaten, statt eine zu raten", async () => {
    const geplant = anf({ id: "a2", wirksamAb: new Date("2026-08-04T12:00:00Z"), benachrichtigtAt: null });
    sperrzeitFindManyMock.mockResolvedValue([geplant, anf()]);

    // Die Kandidaten stehen IM Fehler — sonst müsste der Agent erst ein Lese-Tool suchen.
    await expect(mcpEditLockRequest("sub", { message: "neu" })).rejects.toThrow(/2 lock requests are open.*"id":"a2".*"id":"a1"/);
    expect(updateLockRequest).not.toHaveBeenCalled();
  });

  it("mit id wird genau die gemeinte geändert, die übrige steht unter untouched", async () => {
    const geplant = anf({ id: "a2", wirksamAb: new Date("2026-08-04T12:00:00Z"), benachrichtigtAt: null });
    sperrzeitFindManyMock.mockResolvedValue([geplant, anf()]);
    (updateLockRequest as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, data: { id: "a1", userId: "u1", notified: true, deliveredToPoller: false } });

    const r = await mcpEditLockRequest("sub", { id: "a1", message: "neu" }) as { id: string; untouched: { id: string; status: string }[]; message: string };
    expect(r.id).toBe("a1");
    expect(r.untouched).toEqual([{ id: "a2", status: "scheduled", scheduledFor: "2026-08-04T14:00:00+02:00", endsAt: "2026-07-18T14:00:00+02:00", message: null }]);
    expect(r.message).toContain("2 lock requests are open");
  });

  it("Mindestdauer und absolutes Sperr-Ende zusammen werden abgelehnt, statt eines still zu verwerfen", async () => {
    // Die Regel liegt im Service (LOCK_DURATION_OR_END) — unwrap() macht daraus den englischen Satz.
    sperrzeitFindManyMock.mockResolvedValue([anf()]);
    (updateLockRequest as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, status: 400, error: "LOCK_DURATION_OR_END" });
    await expect(mcpEditLockRequest("sub", { minDurationHours: 12, lockUntilAt: MORGEN.toISOString() }))
      .rejects.toThrow(/not both/);
  });

  it("dryRun meldet den Mindestdauer+Sperr-Ende-Konflikt schon vor dem Commit (nicht wouldSucceed)", async () => {
    // Die Vorschau darf nicht Erfolg versprechen für eine Eingabe, die updateLockRequest ablehnt.
    sperrzeitFindManyMock.mockResolvedValue([anf()]);
    const r = await mcpEditLockRequest("sub", { dryRun: true, minDurationHours: 12, lockUntilAt: MORGEN.toISOString() }) as { wouldSucceed: boolean; problem?: string };
    expect(r.wouldSucceed).toBe(false);
    expect(r.problem).toBe("LOCK_DURATION_OR_END");
    expect(updateLockRequest).not.toHaveBeenCalled();
  });

  it("withdraw mit id trifft genau eine Zeile — und prüft, dass sie zum Sub und zur Art gehört", async () => {
    vaFindUniqueMock.mockResolvedValue({ id: "a1", userId: "u1", art: "ANFORDERUNG", wirksamAb: null, benachrichtigtAt: null, endetAt: null, nachricht: null });
    (withdrawVerschlussAnforderungById as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, data: { userId: "u1", notified: true } });

    const r = await mcpWithdraw("sub", { target: "lock_request", id: "a1" }) as { withdrawn: number };
    expect(r.withdrawn).toBe(1);
    expect(withdrawVerschlussAnforderungById).toHaveBeenCalledWith("a1", "ai");

    // Fremder Sub / falsche Art / bereits weg → gar kein Rückzug, statt stillem Erfolg.
    vaFindUniqueMock.mockResolvedValue({ id: "a1", userId: "u2", art: "ANFORDERUNG", wirksamAb: null, benachrichtigtAt: null, endetAt: null, nachricht: null });
    await expect(mcpWithdraw("sub", { target: "lock_request", id: "a1" })).rejects.toThrow(/No open lock_request/);
    vaFindUniqueMock.mockResolvedValue({ id: "a1", userId: "u1", art: "SPERRZEIT", wirksamAb: null, benachrichtigtAt: null, endetAt: null, nachricht: null });
    await expect(mcpWithdraw("sub", { target: "lock_request", id: "a1" })).rejects.toThrow(/No open lock_request/);
    // „Bereits zurückgezogen" beurteilt der Service (eine Wahrheit, eine Stelle) — der Guard hier
    // beantwortet nur „gehört die Zeile diesem Sub und dieser Art?".
    vaFindUniqueMock.mockResolvedValue({ id: "a1", userId: "u1", art: "ANFORDERUNG", wirksamAb: null, benachrichtigtAt: null, endetAt: null, nachricht: null });
    (withdrawVerschlussAnforderungById as unknown as ReturnType<typeof vi.fn>)
      .mockResolvedValue({ ok: false, status: 400, error: "LOCK_PERIOD_ALREADY_WITHDRAWN" });
    await expect(mcpWithdraw("sub", { target: "lock_request", id: "a1" })).rejects.toThrow(/already/);
    expect(withdrawVerschlussAnforderungById).toHaveBeenCalledTimes(2);
  });

  it("withdraw dryRun ohne id listet die betroffenen Anforderungen (id + Status + Nachricht), nicht nur die Zahl", async () => {
    // Bei mehreren offenen sagt eine blosse „2" nicht, WELCHE ein id-loser Rückzug träfe — die Liste
    // macht die gezielte Einzel-Rücknahme überhaupt erst wählbar.
    const geplant = anf({ id: "a2", nachricht: "später", wirksamAb: new Date("2026-08-04T12:00:00Z"), benachrichtigtAt: null });
    sperrzeitFindManyMock.mockResolvedValue([geplant, anf({ nachricht: "jetzt" })]);

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
 * parseReinigungsFenster — genau das wäre hier eine unbemerkte Löschung).
 */
describe("set_cleaning: Reinigungs-Fenster", () => {
  const setReinigungMock = setReinigungSettings as unknown as ReturnType<typeof vi.fn>;
  beforeEach(() => setReinigungMock.mockResolvedValue({ ok: true, data: null }));

  it("ersetzt die ganze Liste — der Service bekommt genau die übergebenen Fenster", async () => {
    const windows = [{ start: "07:00", end: "08:00" }, { start: "19:00", end: "20:30" }];
    const r = await mcpSetCleaning("sub", { windows }) as { message: string };
    expect(setReinigungMock).toHaveBeenCalledWith("u1", { erlaubt: undefined, maxMinuten: undefined, maxProTag: undefined, fenster: windows });
    expect(r.message).toContain("07:00-08:00, 19:00-20:30");
  });

  it("windows:[] löscht alle Fenster — und die Meldung sagt, dass das die Reinigung NICHT verbietet", async () => {
    const r = await mcpSetCleaning("sub", { windows: [] }) as { message: string };
    expect(setReinigungMock).toHaveBeenCalledWith("u1", expect.objectContaining({ fenster: [] }));
    expect(r.message).toMatch(/no longer restricted to times of day/);
    expect(r.message).toMatch(/allowed:false/);
  });

  it("ohne windows bleiben die Fenster unberührt (undefined, nicht [])", async () => {
    await mcpSetCleaning("sub", { maxMinutes: 20 });
    expect(setReinigungMock).toHaveBeenCalledWith("u1", expect.objectContaining({ fenster: undefined }));
  });

  it("ein ungültiges Paar wird mit Index + Grund abgelehnt, statt still zu verschwinden", async () => {
    await expect(mcpSetCleaning("sub", { windows: [{ start: "07:00", end: "08:00" }, { start: "19:00", end: "18:00" }] }))
      .rejects.toThrow(/windows\[1\] \{"start":"19:00","end":"18:00"\}: The end must be after the start/);
    expect(setReinigungMock).not.toHaveBeenCalled();
  });

  it("dieselbe Ablehnung schon im dryRun — der Preview darf nichts versprechen, was der Commit ablehnt", async () => {
    await expect(mcpSetCleaning("sub", { dryRun: true, windows: [{ start: "25:00", end: "26:00" }] }))
      .rejects.toThrow(/windows\[0\].*Invalid time/);
  });

  it("zu viele Fenster werden abgelehnt — ohne Index, die Liste als Ganzes ist zu lang", async () => {
    const windows = Array.from({ length: CLEANING_WINDOWS_MAX + 1 }, () => ({ start: "07:00", end: "08:00" }));
    await expect(mcpSetCleaning("sub", { windows })).rejects.toThrow(/^windows: Too many cleaning windows$/);
    expect(setReinigungMock).not.toHaveBeenCalled();
  });

  it("ganz ohne Feld: der Hinweis nennt windows mit", async () => {
    await expect(mcpSetCleaning("sub", {})).rejects.toThrow(/allowed, maxMinutes, maxPerDay, windows/);
  });

  it("dryRun zeigt die ALTE gegen die NEUE Liste und committet nichts", async () => {
    const r = await mcpSetCleaning("sub", { dryRun: true, windows: [{ start: "06:00", end: "07:00" }] }) as {
      preview: { windows: string[] }; diff: Record<string, [unknown, unknown]>;
    };
    expect(r.preview.windows).toEqual(["06:00-07:00"]);
    expect(r.diff.windows).toEqual([["19:00-20:00"], ["06:00-07:00"]]);
    expect(setReinigungMock).not.toHaveBeenCalled();
  });

  it("dryRun ohne windows: kein Fenster-Diff (unberührt heisst unberührt)", async () => {
    const r = await mcpSetCleaning("sub", { dryRun: true, allowed: true }) as { diff: Record<string, [unknown, unknown]> };
    expect(r.diff.windows).toBeUndefined();
    expect(r.diff.allowed).toEqual([false, true]);
  });
});
