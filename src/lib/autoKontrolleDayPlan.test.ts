import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createPrismaMock, type PrismaMock } from "@/test/prismaMock";

/**
 * Der TAGESPLAN der Auto-Kontrollen an der DB-Grenze: wann gewürfelt wird
 * (`ensureDailyAutoKontrollenForUser`) und was eine geänderte Planungs-Einstellung auslöst
 * (`rerollTodayAutoKontrollenForUser`).
 *
 * Der wichtigste Fall ist der Wurf auf NULL Kontrollen. Er legt keine Zeile an und war deshalb
 * spurlos, solange „heute schon geplant?" an der Zeilenzahl hing: der Minuten-Poller würfelte ihn im
 * nächsten Tick weg, bis irgendwann eine Kontrolle herauskam. Aus „an rund der Hälfte der Tage eine
 * Kontrolle" (perDayMin 0 / perDayMax 1) wurde so faktisch jeden Tag eine.
 */

const prismaMock: PrismaMock = createPrismaMock();
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const { ensureDailyAutoKontrollenForUser, rerollTodayAutoKontrollenForUser, autoKontrolleSettingsFromUser } =
  await import("./autoKontrolleService");
const { midnightInTZ, dateAtLocalMinutes } = await import("./utils");

const { ALL_WEEKDAYS, weekdayMaskOf } = await import("./weekdays");

const TZ = "Europe/Zurich";
/** Lokale Mitternacht — ab hier liegt der ganze Tag in der Zukunft. */
const MIDNIGHT = midnightInTZ(new Date("2026-06-15T12:00:00Z"), TZ);
const at = (min: number) => dateAtLocalMinutes(MIDNIGHT, min, TZ);
const tick = (i: number) => new Date(MIDNIGHT.getTime() + i * 60_000);

/** 0–1 Kontrollen/Tag in einem engen festen Morgen-Fenster — die Konstellation, in der der
 *  verlorene 0-Tag auffällt: die Hälfte aller Tage sollte leer bleiben. */
const USER = {
  id: "u1", timezone: TZ, autoInspectionPlannedFor: null as Date | null,
  autoKontrolleAktiv: true, autoKontrollePerDayMin: 0, autoKontrollePerDayMax: 1,
  autoKontrolleRuheVon: "22:59", autoKontrolleRuheBis: "06:20",
  autoKontrolleFristVon: 10, autoKontrolleFristBis: 10,
  autoKontrolleFensterVon: "06:20", autoKontrolleFensterBis: "07:00",
  autoKontrolleNurBeiSperre: false,
  autoKontrolleDays: ALL_WEEKDAYS, autoKontrolleDayRules: null as string | null,
  postLockInspectionEnabled: false, postLockInspectionDelayMin: 15,
  postLockInspectionDelayMax: 45, postLockInspectionDeadlineMinutes: 15,
};

/** Eine User-Zeile, deren Merker der Code über `user.update` wirklich fortschreibt — sonst prüfte der
 *  Poller-Test in jedem Tick gegen einen eingefrorenen Anfangszustand und wäre wertlos. */
function userWithMarker(overrides: Partial<typeof USER> = {}) {
  const user = { ...USER, ...overrides };
  prismaMock.user.update.mockImplementation(async ({ data }: { data: { autoInspectionPlannedFor?: Date } }) => {
    if (data.autoInspectionPlannedFor !== undefined) user.autoInspectionPlannedFor = data.autoInspectionPlannedFor;
    return user;
  });
  return user;
}

/** Die Zeilen, die `createMany` angelegt hat (über alle Aufrufe). */
function createdRows(): { wirksamAb: Date; deadline: Date }[] {
  return prismaMock.kontrollAnforderung.createMany.mock.calls
    .flatMap((c) => (c[0] as { data: { wirksamAb: Date; deadline: Date }[] }).data);
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.kontrollAnforderung.createMany.mockResolvedValue({ count: 1 });
  prismaMock.kontrollAnforderung.deleteMany.mockResolvedValue({ count: 0 });
  // `clearAllMocks` löscht nur die Aufrufe, nicht die Rückgaben — ohne diese Zeilen trüge ein Test
  // die zugestellte Kontrolle des vorigen in den nächsten.
  prismaMock.kontrollAnforderung.findMany.mockResolvedValue([]);
  prismaMock.kontrollAnforderung.count.mockResolvedValue(0);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ensureDailyAutoKontrollenForUser — der Tages-Merker", () => {
  it("hält einen Wurf auf NULL Kontrollen über alle Poller-Ticks des Tages", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0); // Anzahl-Wurf → perDayMin = 0
    const user = userWithMarker();

    // Der Poller ruft jede Minute auf: von Mitternacht bis nach dem Fenster (07:00).
    for (let i = 0; i < 430; i++) await ensureDailyAutoKontrollenForUser(user, tick(i));

    expect(prismaMock.kontrollAnforderung.createMany).not.toHaveBeenCalled();
    // Genau EIN Wurf: danach greift der Merker, ohne dass überhaupt noch gezählt wird.
    expect(prismaMock.user.update).toHaveBeenCalledTimes(1);
    expect(prismaMock.kontrollAnforderung.count).toHaveBeenCalledTimes(1);
  });

  it("würfelt am nächsten Tag wieder — der Merker sperrt nur den eigenen Tag", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99); // → perDayMax = 1
    const user = userWithMarker({ autoInspectionPlannedFor: new Date(MIDNIGHT.getTime() - 86_400_000) });

    await ensureDailyAutoKontrollenForUser(user, tick(0));

    expect(createdRows()).toHaveLength(1);
    expect(user.autoInspectionPlannedFor).toEqual(MIDNIGHT);
  });

  it("legt die Kontrolle ins feste Auslöse-Fenster", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    await ensureDailyAutoKontrollenForUser(userWithMarker(), tick(0));

    const [slot] = createdRows();
    expect(slot.wirksamAb.getTime()).toBeGreaterThanOrEqual(at(380).getTime()); // 06:20
    expect(slot.wirksamAb.getTime()).toBeLessThan(at(420).getTime()); // 07:00
    expect(slot.deadline.getTime() - slot.wirksamAb.getTime()).toBe(10 * 60_000);
  });

  it("übernimmt einen Plan, der noch ohne Merker entstanden ist (Deploy-Tag), ohne ihn zu verdoppeln", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    prismaMock.kontrollAnforderung.count.mockResolvedValue(1);
    const user = userWithMarker();

    await ensureDailyAutoKontrollenForUser(user, tick(0));
    await ensureDailyAutoKontrollenForUser(user, tick(1));

    expect(prismaMock.kontrollAnforderung.createMany).not.toHaveBeenCalled();
    expect(user.autoInspectionPlannedFor).toEqual(MIDNIGHT); // nachgetragen …
    expect(prismaMock.kontrollAnforderung.count).toHaveBeenCalledTimes(1); // … und danach nicht mehr gezählt
  });

  it("plant nichts für einen abgeschalteten Sub und setzt auch keinen Merker", async () => {
    const user = userWithMarker({ autoKontrolleAktiv: false });
    expect(await ensureDailyAutoKontrollenForUser(user, tick(0))).toBe(0);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });
});

describe("rerollTodayAutoKontrollenForUser — Neuwurf nach einer Settings-Änderung", () => {
  /** Weites Wach-Fenster ohne festes Auslöse-Fenster, feste Tages-Anzahl. */
  const wide = (proTag: number) => autoKontrolleSettingsFromUser({
    ...USER, autoKontrollePerDayMin: proTag, autoKontrollePerDayMax: proTag,
    autoKontrolleRuheVon: "22:00", autoKontrolleRuheBis: "06:00",
    autoKontrolleFristVon: 15, autoKontrolleFristBis: 60,
    autoKontrolleFensterVon: "", autoKontrolleFensterBis: "",
  });

  it("räumt nur die noch nicht zugestellten Zeilen von heute weg", async () => {
    await rerollTodayAutoKontrollenForUser("u1", wide(1), MIDNIGHT, TZ);

    expect(prismaMock.kontrollAnforderung.deleteMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        userId: "u1", benachrichtigtAt: null, withdrawnAt: null, createdAt: { gte: MIDNIGHT },
      }),
    });
  });

  it("rechnet eine bereits zugestellte Kontrolle aufs neue Kontingent an", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    prismaMock.kontrollAnforderung.findMany.mockResolvedValue([{ wirksamAb: at(600), deadline: at(630) }]);

    // Neu gewürfelt wird 1 — die zugestellte füllt sie bereits aus.
    expect(await rerollTodayAutoKontrollenForUser("u1", wide(1), MIDNIGHT, TZ)).toBe(0);
    expect(prismaMock.kontrollAnforderung.createMany).not.toHaveBeenCalled();
  });

  it("plant den Rest an der zugestellten Kontrolle vorbei", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const delivered = { wirksamAb: at(600), deadline: at(630) };
    prismaMock.kontrollAnforderung.findMany.mockResolvedValue([delivered]);

    await rerollTodayAutoKontrollenForUser("u1", wide(2), MIDNIGHT, TZ);

    const created = createdRows();
    expect(created).toHaveLength(1); // 2 gewürfelt − 1 zugestellt
    const all = [...created, delivered].sort((a, b) => a.wirksamAb.getTime() - b.wirksamAb.getTime());
    expect(all[1].wirksamAb.getTime()).toBeGreaterThanOrEqual(all[0].deadline.getTime());
  });

  it("plant den ganzen Tag neu, wenn noch nichts zugestellt wurde", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    await rerollTodayAutoKontrollenForUser("u1", wide(3), MIDNIGHT, TZ);
    expect(createdRows()).toHaveLength(3);
  });

  // Regression: der Neuwurf muss in die REST-Zeit planen. Verteilte er die frisch gewürfelte Anzahl
  // wie ein frischer Tag über das ganze Wach-Fenster, fielen die Vormittags-Slots als „schon vorbei"
  // weg — der Neuwurf hätte die gelöschten Zeilen dann meist ersatzlos verworfen und den Abend leer
  // gelassen, obwohl noch Stunden Zeit waren.
  it("plant bei einer Änderung am Abend in die verbleibenden Stunden", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const abends = dateAtLocalMinutes(MIDNIGHT, 20 * 60, TZ);

    await rerollTodayAutoKontrollenForUser("u1", wide(2), abends, TZ);

    const created = createdRows();
    expect(created).toHaveLength(2);
    for (const s of created) {
      expect(s.wirksamAb.getTime()).toBeGreaterThan(abends.getTime());
      expect(s.deadline.getTime()).toBeLessThan(at(22 * 60).getTime()); // strikt vor dem Schlaf-Beginn
    }
  });

  it("kann auf NULL würfeln — dann bleibt der Tag leer und wird nicht nachgeplant", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const user = userWithMarker();
    const settings = autoKontrolleSettingsFromUser(user);

    expect(await rerollTodayAutoKontrollenForUser("u1", settings, MIDNIGHT, TZ)).toBe(0);
    expect(prismaMock.kontrollAnforderung.createMany).not.toHaveBeenCalled();
    // Der Merker steht — der Poller darf den 0-Tag nicht gleich wieder überwürfeln.
    expect(user.autoInspectionPlannedFor).toEqual(MIDNIGHT);
    expect(await ensureDailyAutoKontrollenForUser(user, tick(1))).toBe(0);
    expect(prismaMock.kontrollAnforderung.count).not.toHaveBeenCalled();
  });

  it("räumt beim Abschalten auf, statt neu zu planen", async () => {
    const user = userWithMarker({ autoKontrolleAktiv: false });
    expect(await rerollTodayAutoKontrollenForUser("u1", autoKontrolleSettingsFromUser(user), MIDNIGHT, TZ)).toBe(0);
    expect(prismaMock.kontrollAnforderung.deleteMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.kontrollAnforderung.createMany).not.toHaveBeenCalled();
  });

  // MIDNIGHT liegt auf einem MONTAG (2026-06-15).
  it("ein Ruhetag räumt den schon gewürfelten Plan ab, statt ihn nur nicht zu ergänzen", async () => {
    // Wer den Montag gerade freigestellt hat, will die Montags-Kontrollen los sein — nicht bloss
    // keine neuen dazubekommen. Deshalb greift der Ruhetag NACH dem Löschen.
    const user = userWithMarker({ autoKontrolleDays: weekdayMaskOf([2, 3, 4, 5, 6, 7]) });
    expect(await rerollTodayAutoKontrollenForUser("u1", autoKontrolleSettingsFromUser(user), MIDNIGHT, TZ)).toBe(0);
    expect(prismaMock.kontrollAnforderung.deleteMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.kontrollAnforderung.createMany).not.toHaveBeenCalled();
  });
});

describe("Ruhetage in der Tagesplanung", () => {
  it("an einem Ruhetag wird nicht geplant — und kein Merker gesetzt", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const user = userWithMarker({ autoKontrolleDays: weekdayMaskOf([2, 3, 4, 5, 6, 7]) });

    expect(await ensureDailyAutoKontrollenForUser(user, MIDNIGHT)).toBe(0);
    expect(prismaMock.kontrollAnforderung.createMany).not.toHaveBeenCalled();
    // Kein Merker: er wäre von einem gewürfelten 0-Tag nicht zu unterscheiden, und ein Ruhetag
    // braucht ihn nicht — die Frage stellt sich am nächsten Tick genauso schnell neu.
    expect(user.autoInspectionPlannedFor).toBeNull();
  });

  it("am Tag darauf plant derselbe Sub wieder", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const user = userWithMarker({ autoKontrolleDays: weekdayMaskOf([2, 3, 4, 5, 6, 7]) });
    const dienstag = new Date(MIDNIGHT.getTime() + 30 * 60 * 60_000); // Dienstagmorgen

    expect(await ensureDailyAutoKontrollenForUser(user, dienstag)).toBeGreaterThan(0);
  });
});
