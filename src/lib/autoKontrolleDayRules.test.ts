import { describe, it, expect } from "vitest";
import {
  AUTO_INSPECTION_DAY_RULES_MAX, autoInspectionDayRulesProblem, dayRuleFor,
  formatAutoInspectionDayRule, parseAutoInspectionDayRules, timesForDay,
} from "./autoKontrolleDayRules";
import { ALL_WEEKDAYS, weekdayMaskOf } from "./weekdays";

const MO = weekdayMaskOf([1]), DI = weekdayMaskOf([2]);
const WERKTAGS = weekdayMaskOf([1, 2, 3, 4, 5]);

/** Der Grundstand, von dem eine Ausnahme abweicht. */
const BASE = { ruheVon: "22:00", ruheBis: "06:00", fensterVon: "", fensterBis: "" };
const regel = (over: Partial<ReturnType<typeof mkRegel>> = {}) => ({ ...mkRegel(), ...over });
function mkRegel() {
  return { days: DI, ruheVon: "19:00", ruheBis: "06:00", fensterVon: "", fensterBis: "" };
}

describe("parseAutoInspectionDayRules", () => {
  it("liest den gespeicherten JSON-String und das rohe Array", () => {
    const rules = [regel()];
    expect(parseAutoInspectionDayRules(JSON.stringify(rules))).toEqual(rules);
    expect(parseAutoInspectionDayRules(rules)).toEqual(rules);
  });

  it("null / Murks / kaputtes JSON ergeben eine leere Liste, keinen Wurf", () => {
    expect(parseAutoInspectionDayRules(null)).toEqual([]);
    expect(parseAutoInspectionDayRules("{kaputt")).toEqual([]);
    expect(parseAutoInspectionDayRules(42)).toEqual([]);
  });

  it("fehlende Wochentage heissen alle Tage, nicht keiner", () => {
    expect(parseAutoInspectionDayRules([{ ruheVon: "22:00", ruheBis: "06:00" }])[0].days).toBe(ALL_WEEKDAYS);
  });

  it("verwirft eine Zeile mit kaputter Uhrzeit, behält die übrigen", () => {
    const gemischt = [{ ruheVon: "99:00", ruheBis: "06:00" }, regel()];
    expect(parseAutoInspectionDayRules(gemischt)).toEqual([regel()]);
  });
});

describe("autoInspectionDayRulesProblem — die Schreib-Regel", () => {
  it("lässt eine gültige Liste durch", () => {
    expect(autoInspectionDayRulesProblem([regel()])).toBeNull();
    expect(autoInspectionDayRulesProblem([])).toBeNull();
  });

  it("nennt die STELLE der schuldigen Zeile", () => {
    expect(autoInspectionDayRulesProblem([regel(), regel({ ruheVon: "25:00" })]))
      .toEqual({ code: "invalidTime", index: 1 });
  });

  it("ein halbes Auslöse-Fenster wird abgelehnt statt still als keins gelesen", () => {
    // Der Planer liest ein halbes Fenster als „gar keins" und verteilt über den ganzen Tag — das
    // Gegenteil dessen, was hier eingestellt wurde.
    expect(autoInspectionDayRulesProblem([regel({ fensterVon: "08:00" })]))
      .toEqual({ code: "invalidTime", index: 0 });
  });

  it("eine Maske, die nie gilt, wird abgelehnt — eine Ausnahme ohne Tag ist keine", () => {
    expect(autoInspectionDayRulesProblem([regel({ days: 0 })])).toEqual({ code: "invalidTime", index: 0 });
  });

  it("mehr Regeln als die Woche Tage hat", () => {
    const zuViele = Array.from({ length: AUTO_INSPECTION_DAY_RULES_MAX + 1 }, () => regel());
    expect(autoInspectionDayRulesProblem(zuViele)).toEqual({ code: "INSPECTION_DAY_RULES_TOO_MANY" });
    expect(autoInspectionDayRulesProblem(zuViele.slice(1))).toBeNull();
  });

  it("was kein Array ist, löscht NICHT still alle Ausnahmen", () => {
    expect(autoInspectionDayRulesProblem(null)).toEqual({ code: "invalidTime" });
    expect(autoInspectionDayRulesProblem("mon")).toEqual({ code: "invalidTime" });
  });
});

describe("dayRuleFor — die erste passende gewinnt", () => {
  const spezifisch = regel({ days: DI, ruheVon: "19:00" });
  const allgemein = regel({ days: WERKTAGS, ruheVon: "23:00" });

  it("nimmt bei Überschneidung die frühere Regel — die Reihenfolge IST die Rangfolge", () => {
    expect(dayRuleFor([spezifisch, allgemein], 2)?.ruheVon).toBe("19:00");
    expect(dayRuleFor([allgemein, spezifisch], 2)?.ruheVon).toBe("23:00");
  });

  it("ohne Treffer null — dann gilt der Grundstand", () => {
    expect(dayRuleFor([spezifisch], 3)).toBeNull();
    expect(dayRuleFor([], 2)).toBeNull();
  });
});

describe("timesForDay", () => {
  it("ersetzt BEIDE Fenster-Paare, lässt alles andere stehen", () => {
    const base = { ...BASE, perDayMin: 3, aktiv: true };
    const out = timesForDay(base, [regel({ fensterVon: "08:00", fensterBis: "12:00" })], 2);
    expect(out).toEqual({ ...base, ruheVon: "19:00", ruheBis: "06:00", fensterVon: "08:00", fensterBis: "12:00" });
  });

  it("eine Ausnahme OHNE Fenster löscht das Fenster des Grundstands", () => {
    // Sie ersetzt den Tag als Ganzes. Das Auslöse-Fenster des Normaltags stehen zu lassen hiesse,
    // ein Fenster mit einem Schlaf-Fenster zu kombinieren, das niemand zusammen eingestellt hat.
    const base = { ...BASE, fensterVon: "10:00", fensterBis: "18:00" };
    expect(timesForDay(base, [regel()], 2)).toMatchObject({ fensterVon: "", fensterBis: "" });
  });

  it("ohne passende Regel bleibt der Grundstand unangetastet — dasselbe Objekt", () => {
    const base = { ...BASE };
    expect(timesForDay(base, [regel({ days: MO })], 2)).toBe(base);
    expect(timesForDay(base, null, 2)).toBe(base);
  });
});

describe("formatAutoInspectionDayRule", () => {
  it("eine Zeile je Ausnahme, das Fenster nur wenn es eines gibt", () => {
    expect(formatAutoInspectionDayRule(regel())).toBe("tue quiet 19:00-06:00");
    expect(formatAutoInspectionDayRule(regel({ fensterVon: "08:00", fensterBis: "12:00" })))
      .toBe("tue quiet 19:00-06:00 window 08:00-12:00");
    expect(formatAutoInspectionDayRule(regel({ days: ALL_WEEKDAYS }))).toBe("daily quiet 19:00-06:00");
  });
});
