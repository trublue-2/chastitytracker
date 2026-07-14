import { describe, it, expect } from "vitest";
import {
  buildDailyData, tzYearMonth, buildMonthStats, isActive,
  buildCalendarMonths, buildYearHeatmaps, buildWeekdayLabels,
  type Entry, type CompletedPair, type Vorgabe,
} from "./statsBuilders";
import { WEAR_LEVEL_BG } from "./wearIntensity";

const TZ = "Europe/Zurich";
const D = (iso: string) => new Date(iso);

/** Tages-Key wie ihn `buildDailyData` bildet: `<jahr>-<monat0>-<tag>`. */
const key = (y: number, m1: number, d: number) => `${y}-${m1 - 1}-${d}`;

const noGoal: Vorgabe = {
  gueltigAb: D("2020-01-01T00:00:00Z"), gueltigBis: null,
  minProTagH: null, minProWocheH: null, minProMonatH: null, minProJahrH: null, notiz: null,
};

/** Laufende Vorgabe mit echten Zielen — deckt den ganzen Juli 2026 ab. */
const monatsziel100: Vorgabe = {
  ...noGoal, gueltigAb: D("2026-01-01T00:00:00Z"),
  minProTagH: 12, minProWocheH: 84, minProMonatH: 100,
};

const entry = (id: string, type: string, iso: string): Entry => ({
  id, type, startTime: D(iso), imageUrl: null, note: null,
});

describe("buildDailyData", () => {
  it("teilt ein Paar über Mitternacht anteilig auf beide lokalen Tage auf", () => {
    // 22:00 → 02:00 Ortszeit (CEST = UTC+2): 2 h auf den 9., 2 h auf den 10. Juli.
    const pairs = [{ start: D("2026-07-09T20:00:00Z"), end: D("2026-07-10T00:00:00Z") }];
    const m = buildDailyData(pairs, new Set(), TZ);
    expect(m.get(key(2026, 7, 9))?.hours).toBeCloseTo(2, 6);
    expect(m.get(key(2026, 7, 10))?.hours).toBeCloseTo(2, 6);
  });

  it("der Frühjahrs-Umstellungstag hat nur 23 Stunden — ein volles Tages-Paar zählt 23 h", () => {
    // 2026-03-29: lokale Mitternacht → lokale Mitternacht des Folgetags.
    const pairs = [{ start: D("2026-03-28T23:00:00Z"), end: D("2026-03-29T22:00:00Z") }];
    const m = buildDailyData(pairs, new Set(), TZ);
    expect(m.get(key(2026, 3, 29))?.hours).toBeCloseTo(23, 6);
  });

  it("BEKANNTER BUG, hier nur festgehalten: am Herbst-Umstellungstag geht eine Stunde verloren", () => {
    // Der 25.10.2026 hat lokal 25 Stunden. Das Paar deckt ihn vollständig ab, gezählt werden aber
    // nur 24 h. Zwei Ursachen greifen ineinander:
    //   1. `midnightInTZ` misst am Mittags-Anker und trifft an Umstellungstagen die echte lokale
    //      Mitternacht nicht (eigener Fix-Task).
    //   2. Die Schleife läuft in starren 86_400_000-ms-Schritten, die auf einem 25-Stunden-Tag
    //      nicht mehr auf lokalen Mitternachtsgrenzen liegen.
    // Vor der Extraktion nach statsBuilders.ts verhielt sich der Code identisch (differenziell
    // geprüft) — deshalb hier eingefroren statt im Refactor stillschweigend geändert.
    const pairs = [{ start: D("2026-10-24T22:00:00Z"), end: D("2026-10-25T23:00:00Z") }];
    const m = buildDailyData(pairs, new Set(), TZ);
    expect(m.get(key(2026, 10, 25))?.hours).toBeCloseTo(24, 6); // korrekt wären 25
  });

  it("markiert Orgasmus-Tage auch ohne Trage-Zeit", () => {
    const m = buildDailyData([], new Set([key(2026, 7, 4)]), TZ);
    expect(m.get(key(2026, 7, 4))).toEqual({ hours: 0, hasOrgasm: true });
  });

  it("ein Paar innerhalb eines Tages erzeugt genau einen Eintrag", () => {
    const m = buildDailyData([{ start: D("2026-07-09T08:00:00Z"), end: D("2026-07-09T11:00:00Z") }], new Set(), TZ);
    expect([...m.keys()]).toEqual([key(2026, 7, 9)]);
    expect(m.get(key(2026, 7, 9))?.hours).toBeCloseTo(3, 6);
  });
});

describe("tzYearMonth", () => {
  it("bildet den Monat in der Ziel-Zeitzone, nicht in UTC", () => {
    // 31.07. 23:30 UTC = 01:30 Ortszeit am 1. August.
    expect(tzYearMonth(D("2026-07-31T23:30:00Z"), TZ)).toBe("2026-08");
    expect(tzYearMonth(D("2026-07-31T23:30:00Z"), "UTC")).toBe("2026-07");
  });
});

describe("buildMonthStats", () => {
  const pair = (start: string, end: string): CompletedPair => ({
    verschluss: entry("v", "VERSCHLUSS", start),
    oeffnen: entry("o", "OEFFNEN", end),
    durationMs: D(end).getTime() - D(start).getTime(),
  });

  it("aggregiert Anzahl, Summe und längstes Paar pro Monat, neueste zuerst", () => {
    const rows = buildMonthStats(
      [pair("2026-06-01T10:00:00Z", "2026-06-01T12:00:00Z"),
       pair("2026-07-01T10:00:00Z", "2026-07-01T13:00:00Z"),
       pair("2026-07-05T10:00:00Z", "2026-07-05T11:00:00Z")],
      [], [], "de", TZ,
    );
    expect(rows.map(r => r.key)).toEqual(["2026-07", "2026-06"]);
    const juli = rows[0];
    expect(juli.count).toBe(2);
    expect(juli.totalMs).toBe(4 * 3_600_000);
    expect(juli.longestMs).toBe(3 * 3_600_000);
  });

  it("ein Monat mit Trage-Zeit, aber ohne abgeschlossenes Paar, bekommt trotzdem eine Zeile", () => {
    const rows = buildMonthStats([], [{ start: D("2026-05-10T08:00:00Z"), end: D("2026-05-10T10:00:00Z") }], [], "de", TZ);
    expect(rows).toHaveLength(1);
    expect(rows[0].key).toBe("2026-05");
    expect(rows[0].count).toBe(0);
    expect(rows[0].wearHours).toBeCloseTo(2, 6);
  });

  it("ohne passende Vorgabe bleibt targetH null", () => {
    const rows = buildMonthStats([pair("2026-07-01T10:00:00Z", "2026-07-01T12:00:00Z")], [], [], "de", TZ);
    expect(rows[0].targetH).toBeNull();
  });

  it("mit deckender Vorgabe wird das Monatsziel prorata gesetzt", () => {
    const rows = buildMonthStats([], [{ start: D("2026-07-01T00:00:00Z"), end: D("2026-07-08T00:00:00Z") }], [monatsziel100], "de-CH", TZ);
    expect(rows[0].wearHours).toBeCloseTo(168, 6); // 7 volle Tage
    expect(rows[0].targetH).toBe(100);             // Vorgabe deckt den ganzen Juli
  });
});

describe("isActive", () => {
  const now = D("2026-07-10T12:00:00Z");
  it("offenes Ende zählt als aktiv", () => {
    expect(isActive({ gueltigAb: D("2026-01-01T00:00:00Z"), gueltigBis: null }, now)).toBe(true);
  });
  it("noch nicht begonnen oder bereits abgelaufen ist inaktiv", () => {
    expect(isActive({ gueltigAb: D("2026-08-01T00:00:00Z"), gueltigBis: null }, now)).toBe(false);
    expect(isActive({ gueltigAb: D("2026-01-01T00:00:00Z"), gueltigBis: D("2026-07-01T00:00:00Z") }, now)).toBe(false);
  });
});

describe("buildWeekdayLabels", () => {
  it("liefert sieben Namen, beginnend mit Montag", () => {
    const de = buildWeekdayLabels("de-CH");
    expect(de).toHaveLength(7);
    expect(de[0]).toMatch(/^Mo/);
    expect(de[6]).toMatch(/^So/);
    expect(buildWeekdayLabels("en-US")).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
  });

  it("hängt nicht von der Zeitzone ab — der frühere 12:00-UTC-Anker kippte ab +13 h auf Dienstag", () => {
    // Regressionstest: mit `timeZone: "Pacific/Auckland"` begann die Liste früher mit "Tue".
    expect(buildWeekdayLabels("en-US")[0]).toBe("Mon");
  });
});

describe("buildCalendarMonths", () => {
  const now = D("2026-07-10T12:00:00Z");
  const base = { entries: [] as Entry[], wearPairs: [], vorgaben: [] as Vorgabe[], orgasmDateSet: new Set<string>(), now, dl: "de-CH", tz: TZ };

  it("liefert vier Monate, aktueller zuerst", () => {
    const months = buildCalendarMonths(base);
    expect(months).toHaveLength(4);
    expect(months[0].label).toMatch(/Juli 2026/);
    expect(months[3].label).toMatch(/April 2026/);
  });

  it("jede Woche hat sieben Zellen, und der Monat beginnt am richtigen Wochentag", () => {
    const months = buildCalendarMonths(base);
    const juli = months[0];
    for (const week of juli.weeks) expect(week).toHaveLength(7);
    // 1. Juli 2026 ist ein Mittwoch → zwei Leerzellen (Mo, Di) davor.
    expect(juli.weeks[0].slice(0, 2)).toEqual([null, null]);
    expect(juli.weeks[0][2]?.day).toBe(1);
  });

  it("ohne Vorgabe gibt es keine Ziel-Marker", () => {
    const juli = buildCalendarMonths(base)[0];
    expect(juli.monthGoalMet).toBeNull();
    expect(juli.monthGoalPct).toBeNull();
    expect(juli.weekGoalMet.every(x => x === null)).toBe(true);
  });

  it("mit echter Vorgabe entstehen Tages-, Wochen- und Monats-Marker", () => {
    // Durchgehend getragen vom 1. bis 8. Juli = 168 h. Ziele: 12 h/Tag, 84 h/Woche, 100 h/Monat.
    const wearPairs = [{ start: D("2026-07-01T00:00:00Z"), end: D("2026-07-08T00:00:00Z") }];
    const juli = buildCalendarMonths({ ...base, wearPairs, vorgaben: [monatsziel100] })[0];

    expect(juli.monthGoalMet).toBe(true);
    expect(juli.monthGoalPct).toBe(168);

    // Erste Woche voll getragen (140 % des prorata-Ziels), zweite nur teilweise (60 %).
    expect(juli.weekGoalMet[0]).toBe(true);
    expect(juli.weekGoalPct[0]).toBe(140);
    expect(juli.weekGoalMet[1]).toBe(false);
    expect(juli.weekGoalPct[1]).toBe(60);

    const tage = juli.weeks.flat().filter(Boolean);
    // 2. Juli: 24 h getragen → Tagesziel (12 h) erreicht.
    expect(tage.find(d => d!.day === 2)!.dailyGoalMet).toBe(true);
    // 20. Juli: gar nicht getragen → KEIN Eintrag in der Tages-Karte → `null`, nicht `false`.
    expect(tage.find(d => d!.day === 20)!.dailyGoalMet).toBeNull();
  });

  it("ein prorata-Ziel von 0 erzeugt KEINEN erreicht-Marker (sonst wäre ist>=0 trivial wahr)", () => {
    // Vorgabe endet vor dem Kalenderfenster → prorata-Ziel 0 für den aktuellen Monat.
    const abgelaufen: Vorgabe = { ...noGoal, minProMonatH: 100, gueltigAb: D("2026-04-01T00:00:00Z"), gueltigBis: D("2026-04-30T00:00:00Z") };
    const juli = buildCalendarMonths({ ...base, vorgaben: [abgelaufen] })[0];
    expect(juli.monthGoalMet).toBeNull();
  });

  it("die Zellenfarbe nutzt die geteilte Blau-Skala (dieselbe wie die Jahres-Heatmap)", () => {
    const wearPairs = [{ start: D("2026-07-02T00:00:00Z"), end: D("2026-07-03T00:00:00Z") }]; // voller Tag
    const tage = buildCalendarMonths({ ...base, wearPairs }).flatMap(m => m.weeks.flat()).filter(Boolean);
    const voll = tage.find(d => d!.day === 2)!;
    const leer = tage.find(d => d!.day === 20)!;
    expect(voll.colorClass.split(" ")[0]).toBe(WEAR_LEVEL_BG[4]); // 24 h → dunkelste Stufe
    expect(leer.colorClass.split(" ")[0]).toBe(WEAR_LEVEL_BG[0]); // 0 h → Stufe 0
  });

  it("ordnet Einträge dem richtigen lokalen Tag zu", () => {
    // 23:30 UTC am 8. Juli = 01:30 Ortszeit am 9. Juli.
    const months = buildCalendarMonths({ ...base, entries: [entry("e1", "ORGASMUS", "2026-07-08T23:30:00Z")] });
    const tage = months[0].weeks.flat().filter(Boolean);
    expect(tage.find(d => d!.day === 9)!.entries).toHaveLength(1);
    expect(tage.find(d => d!.day === 8)!.entries).toHaveLength(0);
  });
});

describe("buildYearHeatmaps", () => {
  const now = D("2026-07-10T12:00:00Z");

  it("schneidet das laufende Jahr bei heute ab", () => {
    const [heute] = buildYearHeatmaps([], new Set(), now, TZ, "de-CH");
    const tage = heute.weeks.flat().filter(Boolean);
    expect(tage.at(-1)!.key).toBe(key(2026, 7, 10));
  });

  it("legt für jedes Jahr mit Daten eine Heatmap an, neueste zuerst", () => {
    const maps = buildYearHeatmaps([{ start: D("2024-05-01T08:00:00Z"), end: D("2024-05-01T10:00:00Z") }], new Set(), now, TZ, "de-CH");
    expect(maps.map(m => m.year)).toEqual([2026, 2024]);
  });

  it("jede Woche hat sieben Zellen und das Jahr startet am richtigen Wochentag", () => {
    const [y] = buildYearHeatmaps([], new Set(), now, TZ, "de-CH");
    for (const week of y.weeks) expect(week).toHaveLength(7);
    // 1. Januar 2026 ist ein Donnerstag → drei Leerzellen (Mo–Mi).
    expect(y.weeks[0].slice(0, 3)).toEqual([null, null, null]);
    expect(y.weeks[0][3]?.key).toBe(key(2026, 1, 1));
  });

  it("percentLocked ist 0 ohne Trage-Zeit", () => {
    const [y] = buildYearHeatmaps([], new Set(), now, TZ, "de-CH");
    expect(y.percentLocked).toBe(0);
  });
});
