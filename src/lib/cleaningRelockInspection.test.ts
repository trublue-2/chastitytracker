import { describe, it, expect, vi, beforeEach } from "vitest";
import { createPrismaMock, type PrismaMock } from "@/test/prismaMock";

/**
 * Die Kontrolle nach einem Wiederverschluss, der eine Reinigungspause beendet
 * (`scheduleCleaningRelockInspection`). Gepinnt werden die vier Regeln der Anforderung:
 * Verzögerung 15–45 min, Ersetzen EINER geplanten Kontrolle, trotzdem auslösen wenn keine mehr
 * geplant war, und der Schlaf-Fenster-Fall (5–15 min + keine Eskalationsstufe 2).
 */

const prismaMock: PrismaMock = createPrismaMock();
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const { scheduleCleaningRelockInspection, isSleepingAt, autoKontrolleSettingsFromUser } = await import("./autoKontrolleService");

const TZ = "Europe/Zurich";
/** 2026-06-15T12:00Z = 14:00 Zürcher Ortszeit — mitten im Wach-Fenster. */
const TAGS = new Date("2026-06-15T12:00:00Z");
/** 2026-06-15T22:30Z = 00:30 Zürcher Ortszeit — mitten im Schlaf-Fenster (22:00–06:00). */
const NACHTS = new Date("2026-06-15T22:30:00Z");

const USER = {
  id: "u1", timezone: TZ, autoKontrolleAktiv: true,
  autoKontrollePerDayMin: 4, autoKontrollePerDayMax: 4,
  autoKontrolleRuheVon: "22:00", autoKontrolleRuheBis: "06:00",
  autoKontrolleFristVon: 15, autoKontrolleFristBis: 60,
  autoKontrolleFensterVon: "", autoKontrolleFensterBis: "",
  autoKontrolleNurBeiSperre: false,
};

/** Die eine Zeile, die die Funktion anlegt (über `createAutoKontrollen` → `createMany`). */
function createdRow(): Record<string, unknown> {
  expect(prismaMock.kontrollAnforderung.createMany).toHaveBeenCalledTimes(1);
  const { data } = prismaMock.kontrollAnforderung.createMany.mock.calls[0][0] as { data: Record<string, unknown>[] };
  expect(data).toHaveLength(1);
  return data[0];
}

const verzoegerungMin = (row: Record<string, unknown>, now: Date) =>
  Math.round(((row.wirksamAb as Date).getTime() - now.getTime()) / 60_000);

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.user.findUnique.mockResolvedValue(USER);
  prismaMock.kontrollAnforderung.findFirst.mockResolvedValue(null); // Default: nichts mehr geplant
  prismaMock.kontrollAnforderung.deleteMany.mockResolvedValue({ count: 1 });
  prismaMock.kontrollAnforderung.createMany.mockResolvedValue({ count: 1 });
});

describe("scheduleCleaningRelockInspection — tagsüber", () => {
  it("löst 15–45 min nach dem Wiederverschluss aus, mit Frist aus [fristVon, fristBis]", async () => {
    const plan = (await scheduleCleaningRelockInspection("u1", TAGS))!;
    expect(plan.imSchlaf).toBe(false);
    const verzoegerung = verzoegerungMin(createdRow(), TAGS);
    expect(verzoegerung).toBeGreaterThanOrEqual(15);
    expect(verzoegerung).toBeLessThanOrEqual(45);
    const frist = Math.round((plan.deadline.getTime() - plan.wirksamAb.getTime()) / 60_000);
    expect(frist).toBeGreaterThanOrEqual(15);
    expect(frist).toBeLessThanOrEqual(60);
  });

  it("ersetzt die nächste noch NICHT zugestellte geplante Kontrolle", async () => {
    prismaMock.kontrollAnforderung.findFirst.mockResolvedValue({ id: "geplant-1" });
    const plan = (await scheduleCleaningRelockInspection("u1", TAGS))!;

    expect(plan.ersetzteId).toBe("geplant-1");
    // Nur unzugestellte Plan-Zeilen kommen in Frage — eine bereits verschickte kann dem Sub nicht
    // mehr weggenommen werden, und die eigene Ereignis-Zeile ist kein Plan.
    expect(prismaMock.kontrollAnforderung.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ userId: "u1", auto: true, cleaningRelock: false, benachrichtigtAt: null }),
      orderBy: { wirksamAb: "asc" },
    }));
    // Der Zustell-Filter steht auch im delete (Rennen mit dem Minuten-Poller).
    expect(prismaMock.kontrollAnforderung.deleteMany).toHaveBeenCalledWith({
      where: { id: "geplant-1", benachrichtigtAt: null, withdrawnAt: null },
    });
    expect(prismaMock.kontrollAnforderung.createMany).toHaveBeenCalledTimes(1); // eine rein, eine raus
  });

  it("hat der Poller die Zeile zwischenzeitlich zugestellt, gilt sie als NICHT ersetzt", async () => {
    prismaMock.kontrollAnforderung.findFirst.mockResolvedValue({ id: "geplant-1" });
    prismaMock.kontrollAnforderung.deleteMany.mockResolvedValue({ count: 0 });
    const plan = (await scheduleCleaningRelockInspection("u1", TAGS))!;
    expect(plan.ersetzteId).toBeNull();
    expect(prismaMock.kontrollAnforderung.createMany).toHaveBeenCalledTimes(1); // trotzdem angelegt
  });

  it("ohne geplante Kontrolle wird trotzdem eine ausgelöst", async () => {
    const plan = (await scheduleCleaningRelockInspection("u1", TAGS))!;
    expect(plan.ersetzteId).toBeNull();
    expect(prismaMock.kontrollAnforderung.deleteMany).not.toHaveBeenCalled();
    expect(createdRow()).toMatchObject({ auto: true, cleaningRelock: true });
  });

  it("die Zeile trägt einen frischen Code und ist noch nicht zugestellt (der Poller verschickt sie)", async () => {
    await scheduleCleaningRelockInspection("u1", TAGS);
    const row = createdRow();
    expect(row.code).toMatch(/^\d{5}$/);
    expect(row.benachrichtigtAt).toBeNull();
  });
});

describe("scheduleCleaningRelockInspection — im Schlaf-Fenster", () => {
  it("löst 5–15 min nach dem Wiederverschluss aus und schliesst Eskalationsstufe 2 aus", async () => {
    const plan = (await scheduleCleaningRelockInspection("u1", NACHTS))!;
    expect(plan.imSchlaf).toBe(true);
    const verzoegerung = verzoegerungMin(createdRow(), NACHTS);
    expect(verzoegerung).toBeGreaterThanOrEqual(5);
    expect(verzoegerung).toBeLessThanOrEqual(15);
    // Die Nacht-Regel steckt NICHT in der Zeile: dass Stufe 2 ausfällt, leitet der Poller beim
    // Eskalieren aus dem Schlaf-Fenster ab (siehe unten) — ein verschobenes Fenster gilt sofort.
    expect(createdRow()).not.toHaveProperty("skipAutoMark");
    expect(isSleepingAt(autoKontrolleSettingsFromUser(USER), createdRow().wirksamAb as Date, TZ)).toBe(true);
  });

  it("auch wenn erst die AUSLÖSUNG in den Schlaf fällt, nicht schon der Verschluss", async () => {
    // 21:50 Ortszeit: der Verschluss liegt vor 22:00, die 15–45-Minuten-Auslösung aber dahinter.
    const kurzVorSchlaf = new Date("2026-06-15T19:50:00Z");
    const plan = (await scheduleCleaningRelockInspection("u1", kurzVorSchlaf))!;
    expect(plan.imSchlaf).toBe(true);
    expect(verzoegerungMin(createdRow(), kurzVorSchlaf)).toBeLessThanOrEqual(15);
  });

  it("die Sub-Zeitzone entscheidet, nicht die des Servers", async () => {
    // Dieselbe Instant, New Yorker Sub: 18:30 Ortszeit — hellwach.
    prismaMock.user.findUnique.mockResolvedValue({ ...USER, timezone: "America/New_York" });
    const plan = (await scheduleCleaningRelockInspection("u1", NACHTS))!;
    expect(plan.imSchlaf).toBe(false);
  });
});

describe("scheduleCleaningRelockInspection — Voraussetzungen", () => {
  it("abgeschaltete Automatik ⇒ keine Kontrolle", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ ...USER, autoKontrolleAktiv: false });
    expect(await scheduleCleaningRelockInspection("u1", TAGS)).toBeNull();
    expect(prismaMock.kontrollAnforderung.createMany).not.toHaveBeenCalled();
  });

  it("„nur während Sperrzeit\" verhindert die Planung NICHT — der Anlass ist die Reinigung", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ ...USER, autoKontrolleNurBeiSperre: true });
    expect(await scheduleCleaningRelockInspection("u1", TAGS)).not.toBeNull();
    expect(createdRow()).toMatchObject({ cleaningRelock: true });
  });

  it("unbekannter User ⇒ nichts (der Aufrufer ist fire-and-forget)", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    expect(await scheduleCleaningRelockInspection("u1", TAGS)).toBeNull();
  });
});

/**
 * Die Nacht-Regel selbst: „nur Mahnung, kein Session-Abbruch" hängt an `isSleepingAt` — der Poller
 * fragt sie beim Eskalieren (kontrollePoller.ts), NICHT an einer beim Anlegen gesetzten Spalte.
 * Damit gilt sofort das aktuelle Schlaf-Fenster, auch wenn es nach dem Anlegen verschoben wurde.
 */
describe("isSleepingAt — die Frage, an der Eskalationsstufe 2 hängt", () => {
  const settings = autoKontrolleSettingsFromUser(USER); // 22:00–06:00

  it("erkennt das über Mitternacht laufende Fenster", () => {
    expect(isSleepingAt(settings, NACHTS, TZ)).toBe(true);                              // 00:30
    expect(isSleepingAt(settings, new Date("2026-06-15T20:30:00Z"), TZ)).toBe(true);    // 22:30
    expect(isSleepingAt(settings, TAGS, TZ)).toBe(false);                               // 14:00
    expect(isSleepingAt(settings, new Date("2026-06-15T04:00:00Z"), TZ)).toBe(false);   // 06:00, Ende exklusiv
  });

  it("ein verschobenes Schlaf-Fenster wirkt sofort auf dieselbe Zeile", () => {
    const spaeterSchlaf = autoKontrolleSettingsFromUser({ ...USER, autoKontrolleRuheVon: "01:00" });
    expect(isSleepingAt(settings, new Date("2026-06-15T20:30:00Z"), TZ)).toBe(true);       // 22:30 im alten Fenster
    expect(isSleepingAt(spaeterSchlaf, new Date("2026-06-15T20:30:00Z"), TZ)).toBe(false); // im neuen nicht mehr
  });

  it("die Wanduhr folgt der Sub-Zeitzone", () => {
    expect(isSleepingAt(settings, NACHTS, "America/New_York")).toBe(false); // dort 18:30
  });
});
