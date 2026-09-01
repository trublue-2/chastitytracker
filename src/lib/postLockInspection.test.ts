import { describe, it, expect, vi, beforeEach } from "vitest";
import { createPrismaMock, type PrismaMock } from "@/test/prismaMock";

/**
 * Die Kontrolle nach JEDEM erfassten Verschluss (`schedulePostLockInspection`).
 *
 * Gepinnt wird, was sie von der festen Reinigungs-Regel unterscheidet — und das sind lauter
 * Eigenschaften, die still brechen können, weil ihr Ausbleiben nur bedeutet, dass eine Kontrolle
 * NICHT kommt: die Eigenständigkeit vom Hauptschalter, der Verzicht aufs Ersetzen, die feste Frist,
 * der Verschluss-Wächter und die Vorfahrt vor der Reinigungs-Regel.
 */

const prismaMock: PrismaMock = createPrismaMock();
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
const getIsLocked = vi.fn(async () => true);
vi.mock("@/lib/queries", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/queries")>();
  return { ...actual, getIsLocked };
});

const { schedulePostLockInspection, scheduleCleaningRelockInspection } = await import("./autoKontrolleService");
const { ALL_WEEKDAYS } = await import("./weekdays");

const TZ = "Europe/Zurich";
/** 14:00 Zürcher Ortszeit — mitten im Wach-Fenster. */
const TAGS = new Date("2026-06-15T12:00:00Z");
/** 00:30 Zürcher Ortszeit — mitten im Schlaf-Fenster (22:00–06:00). */
const NACHTS = new Date("2026-06-15T22:30:00Z");

const USER = {
  id: "u1", timezone: TZ, autoKontrolleAktiv: true,
  autoKontrollePerDayMin: 4, autoKontrollePerDayMax: 4,
  autoKontrolleRuheVon: "22:00", autoKontrolleRuheBis: "06:00",
  autoKontrolleFristVon: 15, autoKontrolleFristBis: 60,
  autoKontrolleFensterVon: "", autoKontrolleFensterBis: "",
  autoKontrolleNurBeiSperre: false,
  autoKontrolleDays: ALL_WEEKDAYS, autoKontrolleDayRules: null as string | null,
  postLockInspectionEnabled: true, postLockInspectionDelayMin: 20,
  postLockInspectionDelayMax: 30, postLockInspectionDeadlineMinutes: 15,
};

function createdRow(): Record<string, unknown> {
  expect(prismaMock.kontrollAnforderung.createMany).toHaveBeenCalledTimes(1);
  const { data } = prismaMock.kontrollAnforderung.createMany.mock.calls[0][0] as { data: Record<string, unknown>[] };
  expect(data).toHaveLength(1);
  return data[0];
}

const minutenNach = (row: Record<string, unknown>, now: Date) =>
  Math.round(((row.wirksamAb as Date).getTime() - now.getTime()) / 60_000);

beforeEach(() => {
  vi.clearAllMocks();
  getIsLocked.mockResolvedValue(true);
  prismaMock.user.findUnique.mockResolvedValue(USER);
  prismaMock.kontrollAnforderung.findFirst.mockResolvedValue(null);
  prismaMock.kontrollAnforderung.createMany.mockResolvedValue({ count: 1 });
});

describe("schedulePostLockInspection", () => {
  it("löst im eingestellten Fenster aus und trägt die FESTE Frist", async () => {
    const plan = (await schedulePostLockInspection("u1", TAGS))!;

    expect(plan.imSchlaf).toBe(false);
    const verzoegerung = minutenNach(createdRow(), TAGS);
    expect(verzoegerung).toBeGreaterThanOrEqual(20);
    expect(verzoegerung).toBeLessThanOrEqual(30);
    // Anders als beim Tagesplan NICHT gewürfelt: der Anlass ist bekannt, die Frist steht.
    expect(Math.round((plan.deadline.getTime() - plan.wirksamAb.getTime()) / 60_000)).toBe(15);
  });

  it("markiert die Zeile als aus einem Verschluss entstanden — und NICHT als Reinigungs-Zeile", async () => {
    await schedulePostLockInspection("u1", TAGS);
    expect(createdRow()).toMatchObject({ auto: true, postLock: true });
    expect(createdRow().cleaningRelock).toBeUndefined();
  });

  it("ersetzt KEINE geplante Kontrolle — sie kommt zusätzlich", async () => {
    prismaMock.kontrollAnforderung.findFirst.mockResolvedValue({ id: "geplant-1" });
    await schedulePostLockInspection("u1", TAGS);

    // Die Reinigungs-Regel sucht hier eine ersetzbare Zeile und löscht sie. Diese nicht: der
    // Tagesplan bleibt vollständig, die Verschluss-Kontrolle kommt oben drauf.
    expect(prismaMock.kontrollAnforderung.deleteMany).not.toHaveBeenCalled();
  });

  it("gilt auch bei abgeschalteter Automatik und bei „nur während Sperrzeit\"", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      ...USER, autoKontrolleAktiv: false, autoKontrolleNurBeiSperre: true, autoKontrollePerDayMin: 0, autoKontrollePerDayMax: 0,
    });
    expect(await schedulePostLockInspection("u1", TAGS)).not.toBeNull();
    expect(prismaMock.kontrollAnforderung.createMany).toHaveBeenCalledTimes(1);
  });

  it("schweigt, wenn der Schalter aus ist", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ ...USER, postLockInspectionEnabled: false });
    expect(await schedulePostLockInspection("u1", TAGS)).toBeNull();
    expect(prismaMock.kontrollAnforderung.createMany).not.toHaveBeenCalled();
  });

  it("schweigt, wenn der Träger gar nicht verschlossen ist (rückdatierter Nachtrag)", async () => {
    getIsLocked.mockResolvedValue(false);
    expect(await schedulePostLockInspection("u1", TAGS)).toBeNull();
    expect(prismaMock.kontrollAnforderung.createMany).not.toHaveBeenCalled();
  });

  it("die kurze Schlaf-Spanne DECKELT die eingestellte, statt sie zu ersetzen", async () => {
    // Sonst wäre die Schonung eine Verschlimmerung: eingestellt 1–2 min, Ersatzwurf 5–15 min — die
    // Kontrolle käme TIEFER im Schlaf-Fenster an als ohne sie, und ohne Eskalationsstufe 2.
    prismaMock.user.findUnique.mockResolvedValue({
      ...USER, postLockInspectionDelayMin: 1, postLockInspectionDelayMax: 2,
    });
    const plan = (await schedulePostLockInspection("u1", NACHTS))!;

    expect(plan.imSchlaf).toBe(true);
    expect(minutenNach(createdRow(), NACHTS)).toBeLessThanOrEqual(2);
  });

  it("im Schlaf-Fenster gilt die kurze Spanne statt der eingestellten", async () => {
    const plan = (await schedulePostLockInspection("u1", NACHTS))!;

    expect(plan.imSchlaf).toBe(true);
    const verzoegerung = minutenNach(createdRow(), NACHTS);
    expect(verzoegerung).toBeGreaterThanOrEqual(5);
    expect(verzoegerung).toBeLessThanOrEqual(15);
  });
});

describe("Vorfahrt vor der Reinigungs-Regel", () => {
  it("die Reinigungs-Kontrolle entfällt, solange die Verschluss-Kontrolle an ist", async () => {
    // Sonst bekäme der Träger für EINEN Wiederverschluss zwei Kontrollen: dieser Pfad läuft im
    // Aufrufer unmittelbar neben `schedulePostLockInspection`.
    expect(await scheduleCleaningRelockInspection("u1", TAGS)).toBeNull();
    expect(prismaMock.kontrollAnforderung.createMany).not.toHaveBeenCalled();
  });

  it("ist sie aus, greift die Reinigungs-Regel wie bisher", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ ...USER, postLockInspectionEnabled: false });
    prismaMock.kontrollAnforderung.deleteMany.mockResolvedValue({ count: 0 });

    expect(await scheduleCleaningRelockInspection("u1", TAGS)).not.toBeNull();
    expect(createdRow()).toMatchObject({ cleaningRelock: true });
  });
});
