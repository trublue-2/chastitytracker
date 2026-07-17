import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * B-02 (MCP-Befundliste 2026-07-17): `set_training_goal`/`edit_training_goal` akzeptierten jeden
 * Stundenwert unkommentiert — z.B. 25 Std/Tag oder 500 Std/Woche (die Woche hat 168). Beides schlug
 * direkt in `goals.*.todayPct` durch und damit in die Adhärenz-Argumentation gegenüber dem Sub.
 */

vi.mock("@/lib/prisma", () => ({
  prisma: {
    trainingVorgabe: { create: vi.fn(), update: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
  },
}));
vi.mock("@/lib/vorgaben", () => ({ reorderVorgabenDates: vi.fn() }));
vi.mock("@/lib/deviceCategoryService", () => ({ resolveOwnedCategory: vi.fn(async () => ({ ok: true, data: null })) }));

import { createVorgabe, updateVorgabe, deleteVorgabe, listVorgaben, checkGoalPlausibility } from "./vorgabeService";
import { prisma } from "@/lib/prisma";
import { reorderVorgabenDates } from "@/lib/vorgaben";

const findFirstMock = prisma.trainingVorgabe.findFirst as unknown as ReturnType<typeof vi.fn>;
const findManyMock = prisma.trainingVorgabe.findMany as unknown as ReturnType<typeof vi.fn>;
const createMock = prisma.trainingVorgabe.create as unknown as ReturnType<typeof vi.fn>;
const updateMock = prisma.trainingVorgabe.update as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  findFirstMock.mockReset().mockResolvedValue({ userId: "u1" });
  findManyMock.mockReset().mockResolvedValue([]);
  createMock.mockReset().mockResolvedValue({ id: "neu" });
  updateMock.mockReset().mockResolvedValue({ id: "g1" });
});

describe("checkGoalPlausibility", () => {
  it("akzeptiert plausible Werte", () => {
    expect(checkGoalPlausibility({ minProTagH: 8, minProWocheH: 40 })).toBeNull();
  });

  it("akzeptiert 24 Std/Tag genau an der Grenze", () => {
    expect(checkGoalPlausibility({ minProTagH: 24 })).toBeNull();
  });

  it("lehnt mehr als 24 Std/Tag ab", () => {
    expect(checkGoalPlausibility({ minProTagH: 25 })).toBe("GOAL_DAY_TARGET_TOO_HIGH");
  });

  it("lehnt mehr als 168 Std/Woche ab (die Woche hat 168 Stunden — der dokumentierte Fehlerfall)", () => {
    expect(checkGoalPlausibility({ minProWocheH: 500 })).toBe("GOAL_WEEK_TARGET_TOO_HIGH");
  });

  it("lehnt mehr als 744 Std/Monat ab", () => {
    expect(checkGoalPlausibility({ minProMonatH: 800 })).toBe("GOAL_MONTH_TARGET_TOO_HIGH");
  });

  it("lehnt mehr als 8784 Std/Jahr ab", () => {
    expect(checkGoalPlausibility({ minProJahrH: 9000 })).toBe("GOAL_YEAR_TARGET_TOO_HIGH");
  });

  it("lehnt ein Wochenziel ab, das bei perfekter Tageserfüllung unerreichbar ist (> 7x Tagesziel)", () => {
    // 2h/Tag * 7 = 14h/Woche max plausibel — 20h/Woche ist unerreichbar, obwohl unter 168.
    expect(checkGoalPlausibility({ minProTagH: 2, minProWocheH: 20 })).toBe("GOAL_WEEK_UNREACHABLE_VS_DAY");
  });

  it("lehnt ein Monatsziel ab, das bei perfekter Tageserfüllung unerreichbar ist (> 31x Tagesziel)", () => {
    expect(checkGoalPlausibility({ minProTagH: 2, minProMonatH: 100 })).toBe("GOAL_MONTH_UNREACHABLE_VS_DAY");
  });

  it("lehnt ein Jahresziel ab, das bei perfekter Tageserfüllung unerreichbar ist (> 366x Tagesziel)", () => {
    expect(checkGoalPlausibility({ minProTagH: 2, minProJahrH: 1000 })).toBe("GOAL_YEAR_UNREACHABLE_VS_DAY");
  });

  it("minProTagH: 0 (explizit gelöscht) wird wie 'nicht gesetzt' behandelt, nicht wie ein Ziel von 0 Stunden", () => {
    // Regression (code-review Phase 5): 0 ist der einzige Wert, mit dem ein MCP-Aufrufer ein
    // Tagesziel explizit löschen kann (Zod erlaubt kein null) — ein Wechsel von "8h/Tag + 40h/Woche"
    // auf "nur noch 40h/Woche" darf nicht an "40 > 7×0" scheitern.
    expect(checkGoalPlausibility({ minProTagH: 0, minProWocheH: 40 })).toBeNull();
  });

  it("ohne Tagesziel wird die Quer-Konsistenz nicht geprüft (nichts, wogegen verglichen werden könnte)", () => {
    expect(checkGoalPlausibility({ minProWocheH: 100 })).toBeNull();
  });

  it("die absolute Obergrenze wird VOR der Quer-Konsistenz geprüft (spezifischerer Fehler zuerst)", () => {
    // 1000h/Woche verletzt sowohl die absolute Grenze (168) als auch die Quer-Konsistenz (7x1=7) —
    // die absolute Grenze ist die aussagekräftigere Meldung.
    expect(checkGoalPlausibility({ minProTagH: 1, minProWocheH: 1000 })).toBe("GOAL_WEEK_TARGET_TOO_HIGH");
  });
});

describe("createVorgabe — Plausibilitätsschranken (B-02)", () => {
  it("lehnt 25 Std/Tag ab, bevor irgendein DB-Write passiert", async () => {
    const res = await createVorgabe({ userId: "u1", gueltigAb: "2026-07-17", minProTagH: 25 });
    if (res.ok) throw new Error("erwartet: Fehler");
    expect(res.error).toBe("GOAL_DAY_TARGET_TOO_HIGH");
    expect(createMock).not.toHaveBeenCalled();
  });

  it("lehnt 500 Std/Woche ab (der dokumentierte Fehlerfall)", async () => {
    const res = await createVorgabe({ userId: "u1", gueltigAb: "2026-07-17", minProWocheH: 500 });
    if (res.ok) throw new Error("erwartet: Fehler");
    expect(res.error).toBe("GOAL_WEEK_TARGET_TOO_HIGH");
  });

  it("akzeptiert plausible Werte", async () => {
    const res = await createVorgabe({ userId: "u1", gueltigAb: "2026-07-17", minProTagH: 8 });
    expect(res.ok).toBe(true);
    expect(createMock).toHaveBeenCalledTimes(1);
  });
});

describe("updateVorgabe — Plausibilitätsschranken greifen auch bei reinem Stunden-Edit (B-02)", () => {
  it("lehnt eine implausible Änderung ab, auch ohne Datumsänderung", async () => {
    const res = await updateVorgabe("g1", { gueltigAb: "2026-07-17", minProTagH: 2, minProWocheH: 999 });
    if (res.ok) throw new Error("erwartet: Fehler");
    expect(res.error).toBe("GOAL_WEEK_TARGET_TOO_HIGH");
  });

  it("ein bereits soft-gelöschtes Ziel gilt als nicht mehr vorhanden (findFirst mit deletedAt:null)", async () => {
    // Die Prisma-Mock-Ebene sieht die WHERE-Klausel nicht selbst — hier wird nur zugesichert, dass
    // updateVorgabe überhaupt über deletedAt:null sucht (nicht per findUnique(id) allein), sonst
    // würde ein gelöschtes Ziel weiter editierbar bleiben.
    await updateVorgabe("g1", { gueltigAb: "2026-07-17", minProTagH: 2 });
    expect(findFirstMock).toHaveBeenCalledWith({ where: { id: "g1", deletedAt: null } });
  });
});

describe("deleteVorgabe — Soft-Delete (B-04, MCP-Befundliste 2026-07-17)", () => {
  it("löscht NICHT physisch — setzt deletedAt statt delete()", async () => {
    const res = await deleteVorgabe("g1");
    expect(res.ok).toBe(true);
    expect(updateMock).toHaveBeenCalledWith({ where: { id: "g1" }, data: { deletedAt: expect.any(Date) } });
  });

  it("verkettet die verbleibenden (aktiven) Ziele der Kategorie neu", async () => {
    await deleteVorgabe("g1");
    expect(reorderVorgabenDates).toHaveBeenCalledWith("u1");
  });

  it("ein zweiter Delete-Aufruf auf ein bereits gelöschtes Ziel liefert GOAL_NOT_FOUND — wie beim alten Hard-Delete", async () => {
    findFirstMock.mockResolvedValue(null); // deletedAt:null-Suche findet nichts mehr
    const res = await deleteVorgabe("g1");
    if (res.ok) throw new Error("erwartet: Fehler");
    expect(res.error).toBe("GOAL_NOT_FOUND");
    expect(updateMock).not.toHaveBeenCalled();
  });
});

describe("listVorgaben — soft-gelöschte Ziele standardmässig ausgeblendet (B-04)", () => {
  it("ohne includeDeleted: nur deletedAt:null", async () => {
    await listVorgaben("u1");
    expect(findManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: "u1", deletedAt: null },
    }));
  });

  it("mit includeDeleted:true: kein deletedAt-Filter", async () => {
    await listVorgaben("u1", { includeDeleted: true });
    expect(findManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: "u1" },
    }));
  });
});
