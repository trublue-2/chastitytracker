import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Die Eingabe-Regeln des von Hand notierten Vergehens. Sie stehen im Service und nicht in der
 * Route, damit der Browser-Rand und der MCP-Rand (`mcpRecordOffense`) dieselbe Grenze ziehen —
 * dieser Test hält fest, welche das ist.
 */

vi.mock("@/lib/prisma", () => ({
  prisma: { manualOffense: { create: vi.fn(), updateMany: vi.fn() } },
}));
vi.mock("@/lib/appMeta", () => ({ markLastAction: vi.fn() }));

import { validateManualOffenseInput, createManualOffense, withdrawManualOffense } from "./manualOffenseService";
import { MANUAL_OFFENSE_TITLE_MAX_LENGTH, MANUAL_OFFENSE_DESCRIPTION_MAX_LENGTH } from "./constants";
import { prisma } from "@/lib/prisma";

const createMock = prisma.manualOffense.create as unknown as ReturnType<typeof vi.fn>;
const updateManyMock = prisma.manualOffense.updateMany as unknown as ReturnType<typeof vi.fn>;

const JETZT = new Date("2026-08-11T12:00:00Z");
const GESTERN = new Date("2026-08-10T12:00:00Z");
const MORGEN = new Date("2026-08-12T12:00:00Z");

const roh = { userId: "u1", occurredAt: GESTERN.toISOString(), title: "Abmachung gebrochen", createdBy: "keyholder" };

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(JETZT);
  vi.clearAllMocks();
  createMock.mockReset().mockResolvedValue({ id: "neu" });
  updateManyMock.mockReset().mockResolvedValue({ count: 1 });
});
afterEach(() => vi.useRealTimers());

describe("validateManualOffenseInput", () => {
  it("formt die Roh-Eingabe zu den Schreib-Parametern", () => {
    expect(validateManualOffenseInput(roh)).toEqual({
      ok: true,
      data: { userId: "u1", occurredAt: GESTERN, title: "Abmachung gebrochen", description: null, createdBy: "keyholder" },
    });
  });

  it("trimmt Titel und Beschreibung; eine leere Beschreibung wird null", () => {
    const res = validateManualOffenseInput({ ...roh, title: "  Titel  ", description: "   " });
    expect(res.ok && res.data).toMatchObject({ title: "Titel", description: null });
  });

  it("leerer Titel → OFFENSE_TITLE_REQUIRED", () => {
    expect(validateManualOffenseInput({ ...roh, title: "   " })).toEqual({ ok: false, status: 400, error: "OFFENSE_TITLE_REQUIRED" });
  });

  it("Titel/Beschreibung über der Grenze → eigener Code", () => {
    expect(validateManualOffenseInput({ ...roh, title: "x".repeat(MANUAL_OFFENSE_TITLE_MAX_LENGTH + 1) }))
      .toEqual({ ok: false, status: 400, error: "OFFENSE_TITLE_TOO_LONG" });
    expect(validateManualOffenseInput({ ...roh, description: "x".repeat(MANUAL_OFFENSE_DESCRIPTION_MAX_LENGTH + 1) }))
      .toEqual({ ok: false, status: 400, error: "OFFENSE_DESCRIPTION_TOO_LONG" });
  });

  it("nicht-string Titel ergibt einen 400, keinen geworfenen Fehler", () => {
    expect(validateManualOffenseInput({ ...roh, title: 5 })).toEqual({ ok: false, status: 400, error: "OFFENSE_TITLE_REQUIRED" });
  });

  it("unlesbarer Zeitpunkt → INVALID_DATETIME", () => {
    expect(validateManualOffenseInput({ ...roh, occurredAt: "kein Datum" })).toEqual({ ok: false, status: 400, error: "INVALID_DATETIME" });
  });

  it("Zeitpunkt in der Zukunft → TIME_IN_FUTURE, genau jetzt ist noch zulässig", () => {
    expect(validateManualOffenseInput({ ...roh, occurredAt: MORGEN.toISOString() }))
      .toEqual({ ok: false, status: 400, error: "TIME_IN_FUTURE" });
    expect(validateManualOffenseInput({ ...roh, occurredAt: JETZT.toISOString() }).ok).toBe(true);
  });
});

describe("createManualOffense / withdrawManualOffense", () => {
  it("legt an und gibt die id zurück", async () => {
    expect(await createManualOffense({ userId: "u1", occurredAt: GESTERN, title: "T", description: null, createdBy: "keyholder" }))
      .toEqual({ id: "neu" });
  });

  it("zieht über withdrawnAt zurück statt zu löschen, auf den eigenen Sub beschränkt", async () => {
    expect(await withdrawManualOffense("o1", "u1")).toBe(true);
    const call = updateManyMock.mock.calls[0][0];
    expect(call.where).toEqual({ id: "o1", userId: "u1", withdrawnAt: null });
    expect(call.data.withdrawnAt).toBeInstanceOf(Date);
  });

  it("zweiter Rückzug trifft nichts mehr → false", async () => {
    updateManyMock.mockResolvedValue({ count: 0 });
    expect(await withdrawManualOffense("o1", "u1")).toBe(false);
  });
});
