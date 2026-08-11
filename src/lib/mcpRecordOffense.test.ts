import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * `record_offense` + `withdraw target:"manual_offense"` — das von Hand notierte Vergehen, das
 * einzige, das nicht aus Einträgen abgeleitet wird.
 *
 * Gepinnt werden die drei Zusagen, die man ihm nicht ansieht: (1) es entsteht mit `createdBy: "ai"`
 * (dieselbe Audit-Kennung wie `StrafeRecord.judgedBy`), (2) ein Datum in der Zukunft und ein leerer
 * Titel werden abgewiesen, statt eine unbeurteilbare Zeile anzulegen, (3) der Rückzug SETZT
 * `withdrawnAt` und löscht nicht — sonst verschwände mit dem Fehleintrag auch seine Spur.
 */

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    manualOffense: { create: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn(), update: vi.fn(), delete: vi.fn(), deleteMany: vi.fn() },
    strafeRecord: { findUnique: vi.fn() },
  },
}));
vi.mock("@/lib/appMeta", () => ({ markLastAction: vi.fn(), touchAppMeta: vi.fn() }));

import { mcpRecordOffense, mcpWithdraw } from "./mcpWrite";
import { prisma } from "@/lib/prisma";
import { MANUAL_OFFENSE_TITLE_MAX_LENGTH } from "@/lib/constants";
import { markLastAction } from "@/lib/appMeta";

const userMock = prisma.user.findUnique as unknown as ReturnType<typeof vi.fn>;
const createMock = prisma.manualOffense.create as unknown as ReturnType<typeof vi.fn>;
const findMock = prisma.manualOffense.findUnique as unknown as ReturnType<typeof vi.fn>;
const updateManyMock = prisma.manualOffense.updateMany as unknown as ReturnType<typeof vi.fn>;
const judgmentMock = prisma.strafeRecord.findUnique as unknown as ReturnType<typeof vi.fn>;

const JETZT = new Date("2026-08-11T12:00:00Z");
const GESTERN = new Date("2026-08-10T18:00:00Z");
const MORGEN = new Date("2026-08-12T12:00:00Z");

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(JETZT);
  // Eine Zeile für beide Zugriffe: resolveTargetUserId (per username) und tzOf (per id).
  userMock.mockResolvedValue({ id: "u1", timezone: "Europe/Zurich" });
  createMock.mockResolvedValue({ id: "m1" });
  judgmentMock.mockResolvedValue(null); // unbeurteilt — der Rückzug fragt das zuerst
});

describe("record_offense legt an", () => {
  it("schreibt Titel, Zeitpunkt und Beschreibung — als KI notiert", async () => {
    const r = await mcpRecordOffense("sub", {
      title: "Abmachung gebrochen",
      occurredAt: GESTERN.toISOString(),
      description: "Ohne Rückfrage die Verabredung abgesagt.",
    }) as { ok: boolean; id: string; message: string };

    expect(createMock).toHaveBeenCalledWith({
      data: {
        userId: "u1",
        occurredAt: GESTERN,
        title: "Abmachung gebrochen",
        description: "Ohne Rückfrage die Verabredung abgesagt.",
        createdBy: "ai",
      },
    });
    expect(r.ok).toBe(true);
    expect(r.id).toBe("m1");
    // Die Antwort nennt die ref — ohne sie müsste der Agent erst get_offenses lesen, um zu urteilen.
    expect(r.message).toContain("m1");
    expect(markLastAction).toHaveBeenCalled();
  });

  it("ohne occurredAt gilt jetzt, ohne description bleibt das Feld leer (null, nicht \"\")", async () => {
    await mcpRecordOffense("sub", { title: "Unhöflich am Telefon" });
    expect(createMock).toHaveBeenCalledWith({
      data: { userId: "u1", occurredAt: JETZT, title: "Unhöflich am Telefon", description: null, createdBy: "ai" },
    });
  });

  it("trimmt Titel und Beschreibung", async () => {
    await mcpRecordOffense("sub", { title: "  Zu spät  ", description: "   " });
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ title: "Zu spät", description: null }) }),
    );
  });
});

describe("record_offense weist Unmögliches ab, statt es anzulegen", () => {
  // Die Absagen tragen die Fehler-CODES des Service: der MCP-Rand prüft seit v5.1 nicht mehr selbst,
  // sondern durch `validateManualOffenseInput` — dieselbe Grenze wie das Admin-Formular.
  it("leerer/nur-Leerzeichen-Titel", async () => {
    await expect(mcpRecordOffense("sub", { title: "   " })).rejects.toThrow(/OFFENSE_TITLE_REQUIRED/);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("zu langer Titel — dieselbe Grenze wie im Formular, die der MCP vorher gar nicht kannte", async () => {
    await expect(mcpRecordOffense("sub", { title: "x".repeat(MANUAL_OFFENSE_TITLE_MAX_LENGTH + 1) }))
      .rejects.toThrow(/OFFENSE_TITLE_TOO_LONG/);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("Zeitpunkt in der Zukunft — ein Vergehen von morgen wäre eine Prognose", async () => {
    await expect(mcpRecordOffense("sub", { title: "Wird schon", occurredAt: MORGEN.toISOString() }))
      .rejects.toThrow(/TIME_IN_FUTURE/);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("unparsbares occurredAt", async () => {
    await expect(mcpRecordOffense("sub", { title: "x", occurredAt: "gestern Abend" }))
      .rejects.toThrow(/INVALID_DATETIME/);
    expect(createMock).not.toHaveBeenCalled();
  });
});

describe("record_offense dryRun", () => {
  it("zeigt die effektiven Werte und committet nichts", async () => {
    const r = await mcpRecordOffense("sub", { dryRun: true, title: "Abmachung gebrochen", occurredAt: GESTERN.toISOString() }) as {
      dryRun: boolean; wouldSucceed: boolean; preview: { title: string; occurredAt: string; recordedBy: string };
    };
    expect(r.dryRun).toBe(true);
    expect(r.wouldSucceed).toBe(true);
    expect(r.preview.title).toBe("Abmachung gebrochen");
    expect(r.preview.occurredAt).toBe("2026-08-10T20:00:00+02:00"); // Offset-ISO in der Sub-Zeitzone
    expect(r.preview.recordedBy).toBe("ai");
    expect(createMock).not.toHaveBeenCalled();
  });

  it("lehnt auch im dryRun ab, was der Commit ablehnen würde", async () => {
    await expect(mcpRecordOffense("sub", { dryRun: true, title: "x", occurredAt: MORGEN.toISOString() }))
      .rejects.toThrow(/TIME_IN_FUTURE/);
  });
});

describe("withdraw target:\"manual_offense\" zieht zurück statt zu löschen", () => {
  const offense = { userId: "u1", title: "Abmachung gebrochen", occurredAt: GESTERN, withdrawnAt: null };

  it("setzt withdrawnAt und benennt, was weggegangen ist", async () => {
    findMock.mockResolvedValue(offense);
    updateManyMock.mockResolvedValue({ count: 1 });

    const r = await mcpWithdraw("sub", { target: "manual_offense", id: "m1" }) as {
      withdrawn: number; withdrawnItems: { id: string; message: string | null }[]; message: string;
    };

    // Der offene Zustand steht in der Where-Klausel — ein zweiter Rückzug trifft null Zeilen.
    expect(updateManyMock).toHaveBeenCalledWith({ where: { id: "m1", userId: "u1", withdrawnAt: null }, data: { withdrawnAt: JETZT } });
    // Kein Löschen: der Fehleintrag fällt aus dem Strafbuch, bleibt aber nachlesbar.
    expect(prisma.manualOffense.delete).not.toHaveBeenCalled();
    expect(prisma.manualOffense.deleteMany).not.toHaveBeenCalled();
    expect(r.withdrawn).toBe(1);
    expect(r.withdrawnItems).toEqual([
      { id: "m1", status: "triggered", scheduledFor: null, endsAt: null, message: "Abmachung gebrochen", code: null },
    ]);
    // Ein bereits gefälltes Urteil überlebt den Rückzug — die Antwort muss das sagen, sonst hält der
    // Agent die Strafe für mit erledigt.
    expect(r.message).toMatch(/reopen/);
    expect(markLastAction).toHaveBeenCalled();
  });

  it("ohne id gar nichts — ein Rundumschlag räumte das ganze Kapitel ab", async () => {
    await expect(mcpWithdraw("sub", { target: "manual_offense" })).rejects.toThrow(/requires an id/);
    expect(updateManyMock).not.toHaveBeenCalled();
  });

  it("fremder Sub oder unbekannte id → kein Rückzug, statt stillem Erfolg", async () => {
    findMock.mockResolvedValue(null);
    await expect(mcpWithdraw("sub", { target: "manual_offense", id: "m1" })).rejects.toThrow(/No manual offense with id m1/);
    findMock.mockResolvedValue({ ...offense, userId: "u2" });
    await expect(mcpWithdraw("sub", { target: "manual_offense", id: "m1" })).rejects.toThrow(/No manual offense with id m1/);
    expect(updateManyMock).not.toHaveBeenCalled();
  });

  it("bereits zurückgezogen → Fehler statt eines zweiten, stillen Rückzugs", async () => {
    findMock.mockResolvedValue({ ...offense, withdrawnAt: GESTERN });
    await expect(mcpWithdraw("sub", { target: "manual_offense", id: "m1" })).rejects.toThrow(/already withdrawn/);
    expect(updateManyMock).not.toHaveBeenCalled();
  });

  it("verliert das Rennen gegen einen parallelen Rückzug, statt Erfolg zu melden", async () => {
    findMock.mockResolvedValue(offense); // beim Lesen noch offen …
    updateManyMock.mockResolvedValue({ count: 0 }); // … beim Schreiben nicht mehr
    await expect(mcpWithdraw("sub", { target: "manual_offense", id: "m1" })).rejects.toThrow(/already withdrawn/);
  });

  it("dryRun zeigt die betroffene Zeile und committet nichts", async () => {
    findMock.mockResolvedValue(offense);
    const r = await mcpWithdraw("sub", { target: "manual_offense", id: "m1", dryRun: true }) as {
      dryRun: boolean; preview: { title: string; occurredAt: string | null; willWithdraw: number };
    };
    expect(r.dryRun).toBe(true);
    expect(r.preview.willWithdraw).toBe(1);
    expect(r.preview.title).toBe("Abmachung gebrochen");
    expect(r.preview.occurredAt).toBe("2026-08-10T20:00:00+02:00");
    expect(updateManyMock).not.toHaveBeenCalled();
  });
});
