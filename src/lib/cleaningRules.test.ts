import { describe, it, expect } from "vitest";
import {
  CLEANING_RULES_EPOCH,
  cleaningSettingsEqual,
  cleaningSettingsFromUser,
  cleaningSettingsResolver,
  type CleaningRuleChangeRow,
} from "./cleaningRules";

const HEUTE = { allowed: true, maxMinutes: 15, maxPerDay: 1, windows: null };

/** Der gemeldete Fall: bis zum 19.08. galten 2 Öffnungen/Tag, seither 1. */
const GESENKT: CleaningRuleChangeRow[] = [
  { allowed: true, maxMinutes: 15, maxPerDay: 2, windows: null, effectiveFrom: CLEANING_RULES_EPOCH },
  { allowed: true, maxMinutes: 15, maxPerDay: 1, windows: null, effectiveFrom: new Date("2026-08-19T07:00:00Z") },
];

describe("cleaningSettingsResolver", () => {
  const resolve = cleaningSettingsResolver(GESENKT, HEUTE);

  it("beantwortet einen Zeitpunkt VOR der Senkung mit dem alten Kontingent", () => {
    expect(resolve(new Date("2026-08-13T07:41:00Z")).maxPerDay).toBe(2);
  });

  it("beantwortet einen Zeitpunkt NACH der Senkung mit dem neuen", () => {
    expect(resolve(new Date("2026-08-19T09:00:00Z")).maxPerDay).toBe(1);
  });

  it("die Fassung gilt ab ihrem eigenen Zeitpunkt, nicht erst danach", () => {
    expect(resolve(new Date("2026-08-19T07:00:00Z")).maxPerDay).toBe(1);
  });

  it("ohne Historie gilt der heutige Stand — es gab nie eine andere Fassung", () => {
    expect(cleaningSettingsResolver([], HEUTE)(new Date("2020-01-01T00:00:00Z"))).toEqual(HEUTE);
  });

  it("sortiert selbst: die Zeilen dürfen in beliebiger Reihenfolge kommen", () => {
    const verdreht = cleaningSettingsResolver([...GESENKT].reverse(), HEUTE);
    expect(verdreht(new Date("2026-08-13T07:41:00Z")).maxPerDay).toBe(2);
  });

  it("liefert die ganze Fassung, nicht nur das Kontingent", () => {
    const changes: CleaningRuleChangeRow[] = [
      { allowed: true, maxMinutes: 30, maxPerDay: 0, windows: '[{"start":"19:00","end":"20:00"}]', effectiveFrom: CLEANING_RULES_EPOCH },
      { allowed: false, maxMinutes: 15, maxPerDay: 0, windows: null, effectiveFrom: new Date("2026-08-19T07:00:00Z") },
    ];
    const damals = cleaningSettingsResolver(changes, HEUTE)(new Date("2026-08-13T07:41:00Z"));
    expect(damals.allowed).toBe(true);
    expect(damals.maxMinutes).toBe(30);
    expect(damals.windows).toBe('[{"start":"19:00","end":"20:00"}]');
  });
});

describe("cleaningSettingsFromUser", () => {
  it("nimmt die Spalten-Defaults, wo nichts gesetzt ist", () => {
    expect(cleaningSettingsFromUser(null)).toEqual({ allowed: false, maxMinutes: 15, maxPerDay: 0, windows: null });
  });

  it("reicht den JSON-String der Fenster durch, wie er in der Spalte steht", () => {
    const windows = '[{"start":"19:00","end":"20:00"}]';
    expect(cleaningSettingsFromUser({ reinigungsFenster: windows }).windows).toBe(windows);
  });

  it("verwandelt eine bereits geparste Liste zurück, statt sie zu verwerfen", () => {
    // In-Memory-Aufrufer und Tests reichen die Fenster als Array — würde das zu `null`, verlöre die
    // Vergangenheit ihre Fenster-Schranke und jede nächtliche Öffnung wäre nachträglich erlaubt.
    expect(cleaningSettingsFromUser({ reinigungsFenster: [{ start: "19:00", end: "20:00" }] }).windows)
      .toBe('[{"start":"19:00","end":"20:00"}]');
  });
});

describe("cleaningSettingsEqual", () => {
  it("erkennt den unveränderten Stand — dafür schreibt der Service keine Zeile", () => {
    expect(cleaningSettingsEqual(HEUTE, { ...HEUTE })).toBe(true);
  });

  it("erkennt jedes der vier Felder", () => {
    expect(cleaningSettingsEqual(HEUTE, { ...HEUTE, allowed: false })).toBe(false);
    expect(cleaningSettingsEqual(HEUTE, { ...HEUTE, maxMinutes: 20 })).toBe(false);
    expect(cleaningSettingsEqual(HEUTE, { ...HEUTE, maxPerDay: 2 })).toBe(false);
    expect(cleaningSettingsEqual(HEUTE, { ...HEUTE, windows: "[]" })).toBe(false);
  });
});
