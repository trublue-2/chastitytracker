import { describe, it, expect } from "vitest";
import {
  parseWeekdayGoalRules, weekdayGoalRulesProblem, weekdayGoalRuleTooHigh, weekdayGoalRulesHaveTarget,
  resolveDayTarget, tagesSollFuer, WEEKDAY_GOAL_RULES_MAX, type WeekdayGoalRule,
} from "./weekdayGoal";
import { weekdayMaskOf } from "./weekdays";

// ISO: Mo=1 … So=7. Masken über weekdayMaskOf, damit die Bit-Reihenfolge nicht von Hand stimmen muss.
const SAT_SUN = weekdayMaskOf([6, 7]);
const MON = weekdayMaskOf([1]);

describe("resolveDayTarget", () => {
  const rules: WeekdayGoalRule[] = [{ days: SAT_SUN, hours: 16 }];

  it("kein Treffer → Basiswert", () => {
    expect(resolveDayTarget(6, rules, 1)).toBe(6); // Montag
    expect(resolveDayTarget(6, rules, 5)).toBe(6); // Freitag
  });

  it("Treffer → Ausnahme ersetzt den Basiswert", () => {
    expect(resolveDayTarget(6, rules, 6)).toBe(16); // Samstag
    expect(resolveDayTarget(6, rules, 7)).toBe(16); // Sonntag
  });

  it("hours: 0 ist ein GESETZTER Ruhetag, kein „nicht gesetzt“", () => {
    expect(resolveDayTarget(6, [{ days: MON, hours: 0 }], 1)).toBe(0); // Montag = Ruhetag
    expect(resolveDayTarget(6, [{ days: MON, hours: 0 }], 2)).toBe(6); // Dienstag = Basis
  });

  it("ohne Basiswert liefert ein nicht getroffener Tag null", () => {
    expect(resolveDayTarget(null, rules, 1)).toBeNull();
    expect(resolveDayTarget(null, rules, 6)).toBe(16); // Ausnahme greift trotzdem
  });

  it("die ERSTE passende Regel gewinnt (Rangfolge = Reihenfolge)", () => {
    const ordered: WeekdayGoalRule[] = [{ days: MON, hours: 3 }, { days: weekdayMaskOf([1, 2, 3]), hours: 9 }];
    expect(resolveDayTarget(6, ordered, 1)).toBe(3); // Montag: spezielle Regel zuerst
    expect(resolveDayTarget(6, ordered, 2)).toBe(9); // Dienstag: allgemeine Regel
  });
});

describe("tagesSollFuer (Wochentag in der Zeitzone des Trägers)", () => {
  const v = { minProTagH: 6, minProTagWochentage: JSON.stringify([{ days: MON, hours: 12 }]) };

  it("löst den Wochentag lokal auf, nicht in UTC", () => {
    // 2026-09-06 23:30Z ist in Europe/Zurich Montag 01:30 (ISO 1), in UTC noch Sonntag (ISO 7).
    const at = new Date("2026-09-06T23:30:00Z");
    expect(tagesSollFuer(v, at, "Europe/Zurich")).toBe(12); // lokaler Montag → Ausnahme
    expect(tagesSollFuer(v, at, "UTC")).toBe(6);             // UTC-Sonntag → Basis
  });

  it("rückwärtskompatibel: keine Ausnahmen (null) → immer der Basiswert", () => {
    const plain = { minProTagH: 8, minProTagWochentage: null };
    for (const iso of ["2026-09-06T12:00:00Z", "2026-09-07T12:00:00Z", "2026-09-08T12:00:00Z"]) {
      expect(tagesSollFuer(plain, new Date(iso), "Europe/Zurich")).toBe(8);
    }
  });

  it("fehlendes Feld (undefined) verhält sich wie keine Ausnahme", () => {
    expect(tagesSollFuer({ minProTagH: 5 }, new Date("2026-09-06T12:00:00Z"), "UTC")).toBe(5);
  });
});

describe("parseWeekdayGoalRules (tolerant)", () => {
  it("liest JSON-String UND Array", () => {
    const arr = [{ days: SAT_SUN, hours: 16 }];
    expect(parseWeekdayGoalRules(JSON.stringify(arr))).toEqual(arr);
    expect(parseWeekdayGoalRules(arr)).toEqual(arr);
  });

  it("null/leer/Murks → leere Liste", () => {
    expect(parseWeekdayGoalRules(null)).toEqual([]);
    expect(parseWeekdayGoalRules(undefined)).toEqual([]);
    expect(parseWeekdayGoalRules("{kaputt")).toEqual([]);
    expect(parseWeekdayGoalRules([{ hours: "viel" }, { hours: -1 }])).toEqual([]); // beide verworfen
  });

  it("fehlende days fallen auf alle Wochentage zurück", () => {
    expect(parseWeekdayGoalRules([{ hours: 4 }])).toEqual([{ days: 0b111_1111, hours: 4 }]);
  });
});

describe("weekdayGoalRulesProblem (Schreib-Wache, Struktur)", () => {
  it("gültige Liste → null", () => {
    expect(weekdayGoalRulesProblem([{ days: SAT_SUN, hours: 16 }, { days: MON, hours: 0 }])).toBeNull();
  });

  it("kein Array → GOAL_WEEKDAY_RULE_INVALID", () => {
    expect(weekdayGoalRulesProblem("nope")?.code).toBe("GOAL_WEEKDAY_RULE_INVALID");
  });

  it("zu viele → GOAL_WEEKDAY_RULES_TOO_MANY", () => {
    const many = Array.from({ length: WEEKDAY_GOAL_RULES_MAX + 1 }, () => ({ days: MON, hours: 1 }));
    expect(weekdayGoalRulesProblem(many)?.code).toBe("GOAL_WEEKDAY_RULES_TOO_MANY");
  });

  it("ungültige Stunden / Null-Maske → GOAL_WEEKDAY_RULE_INVALID mit Position", () => {
    expect(weekdayGoalRulesProblem([{ days: MON, hours: 6 }, { days: MON, hours: -2 }]))
      .toEqual({ code: "GOAL_WEEKDAY_RULE_INVALID", index: 1 });
    expect(weekdayGoalRulesProblem([{ days: 0, hours: 6 }]))
      .toEqual({ code: "GOAL_WEEKDAY_RULE_INVALID", index: 0 });
  });

  it("den 24-h-Cap prüft NICHT die Struktur (das macht checkGoalPlausibility)", () => {
    expect(weekdayGoalRulesProblem([{ days: MON, hours: 30 }])).toBeNull();
  });
});

describe("weekdayGoalRuleTooHigh / weekdayGoalRulesHaveTarget", () => {
  it("Cap greift ab > 24 h", () => {
    expect(weekdayGoalRuleTooHigh([{ days: MON, hours: 24 }])).toBe(false);
    expect(weekdayGoalRuleTooHigh([{ days: MON, hours: 25 }])).toBe(true);
  });

  it("ein reiner Ruhetag zählt NICHT als Ziel, eine Ausnahme > 0 schon", () => {
    expect(weekdayGoalRulesHaveTarget([{ days: MON, hours: 0 }])).toBe(false);
    expect(weekdayGoalRulesHaveTarget([{ days: SAT_SUN, hours: 16 }])).toBe(true);
    expect(weekdayGoalRulesHaveTarget([])).toBe(false);
  });
});
