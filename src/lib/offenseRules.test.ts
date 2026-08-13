import { describe, it, expect, vi } from "vitest";
import {
  OFFENSE_RULE_DEFAULT,
  OFFENSE_RULE_MODES,
  currentOffenseRules,
  isValidOffenseMode,
  offenseRuleResolver,
  type OffenseRuleChangeRow,
} from "@/lib/offenseRules";

const at = (iso: string) => new Date(iso);
const change = (offenseType: string, mode: string, iso: string): OffenseRuleChangeRow =>
  ({ offenseType, mode, effectiveFrom: at(iso) });

describe("offenseRuleResolver", () => {
  it("ohne jede Zeile gilt der Default — Bestandsnutzer verhalten sich unverändert", () => {
    const resolve = offenseRuleResolver([]);
    expect(resolve("unauthorized_opening", at("2026-08-11T12:00:00Z"))).toBe("on");
    // Der neue Orgasmus-Schalter ist AUS: ein Update darf niemandem ein Vergehen anhängen.
    expect(resolve("unauthorized_orgasm", at("2026-08-11T12:00:00Z"))).toBe("off");
  });

  it("eine Änderung wirkt erst AB ihrem Zeitpunkt — davor gilt die alte Fassung", () => {
    const resolve = offenseRuleResolver([change("late_control", "off", "2026-08-10T00:00:00Z")]);
    expect(resolve("late_control", at("2026-08-09T23:59:00Z"))).toBe("on");
    expect(resolve("late_control", at("2026-08-10T00:00:00Z"))).toBe("off");
  });

  it("mehrere Änderungen: es gilt die jüngste, die nicht in der Zukunft der Tat liegt", () => {
    const resolve = offenseRuleResolver([
      change("unauthorized_orgasm", "always", "2026-01-01T00:00:00Z"),
      change("unauthorized_orgasm", "off", "2026-03-01T00:00:00Z"),
      change("unauthorized_orgasm", "lockedOnly", "2026-06-01T00:00:00Z"),
    ]);
    expect(resolve("unauthorized_orgasm", at("2025-12-31T00:00:00Z"))).toBe("off"); // Default davor
    expect(resolve("unauthorized_orgasm", at("2026-02-01T00:00:00Z"))).toBe("always");
    expect(resolve("unauthorized_orgasm", at("2026-04-01T00:00:00Z"))).toBe("off");
    expect(resolve("unauthorized_orgasm", at("2026-07-01T00:00:00Z"))).toBe("lockedOnly");
  });

  it("unsortierte Zeilen ändern nichts — der Resolver ordnet selbst", () => {
    const resolve = offenseRuleResolver([
      change("wrong_device", "on", "2026-06-01T00:00:00Z"),
      change("wrong_device", "off", "2026-02-01T00:00:00Z"),
    ]);
    expect(resolve("wrong_device", at("2026-03-01T00:00:00Z"))).toBe("off");
    expect(resolve("wrong_device", at("2026-07-01T00:00:00Z"))).toBe("on");
  });

  it("eine Zeile mit unbekanntem Modus wird verworfen statt still zu einem falschen Ja/Nein", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    // "lockedOnly" gibt es nur für unauthorized_orgasm — bei einer binären Art ist es Unsinn.
    const resolve = offenseRuleResolver([change("late_lock", "lockedOnly", "2026-01-01T00:00:00Z")]);
    expect(resolve("late_lock", at("2026-08-01T00:00:00Z"))).toBe("on");
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });

  it("Zeilen fremder Arten wirken nicht auf die abgefragte", () => {
    const resolve = offenseRuleResolver([change("late_control", "off", "2026-01-01T00:00:00Z")]);
    expect(resolve("rejected_control", at("2026-08-01T00:00:00Z"))).toBe("on");
  });
});

describe("Modi-Tabelle", () => {
  it("jede Art hat ihren Default unter den zulässigen Modi", () => {
    for (const [type, modes] of Object.entries(OFFENSE_RULE_MODES)) {
      expect(modes as readonly string[]).toContain(OFFENSE_RULE_DEFAULT[type as keyof typeof OFFENSE_RULE_DEFAULT]);
    }
  });

  it("nur unauthorized_orgasm ist mehr als ein An/Aus", () => {
    const mehrstufig = Object.entries(OFFENSE_RULE_MODES).filter(([, m]) => m.length > 2).map(([t]) => t);
    expect(mehrstufig).toEqual(["unauthorized_orgasm"]);
  });

  it("isValidOffenseMode weist einen Modus ab, den die Art nicht kennt", () => {
    expect(isValidOffenseMode("unauthorized_orgasm", "lockedOnly")).toBe(true);
    expect(isValidOffenseMode("cleaning_limit", "lockedOnly")).toBe(false);
    expect(isValidOffenseMode("cleaning_limit", "on")).toBe(true);
  });
});

describe("currentOffenseRules", () => {
  it("liefert für JEDE schaltbare Art einen Wert, auch ohne Zeile", () => {
    const rules = currentOffenseRules([change("cleaning_limit", "off", "2026-01-01T00:00:00Z")], at("2026-08-11T00:00:00Z"));
    expect(Object.keys(rules).sort()).toEqual(Object.keys(OFFENSE_RULE_MODES).sort());
    expect(rules.cleaning_limit).toBe("off");
    expect(rules.unauthorized_opening).toBe("on");
  });

  it("eine erst künftig wirksame Änderung zählt jetzt noch nicht", () => {
    const rules = currentOffenseRules([change("late_lock", "off", "2026-12-01T00:00:00Z")], at("2026-08-11T00:00:00Z"));
    expect(rules.late_lock).toBe("on");
  });
});
