/**
 * Die Schranke der drei Kategorie-REGELN (`trackingEnabled`, `requirePhoto`, `allowVorgaben`).
 *
 * Sie ist sicherheitsrelevant und war es vorher nicht: bis dahin konnte ein Träger `allowVorgaben`
 * abschalten und der Keyholderin damit das Trainingsziel auf dieser Kategorie aus der Hand nehmen —
 * oder mit `trackingEnabled` die Messung, an der ein bestehendes Ziel hängt.
 *
 * Der zweite Fall, den diese Tests festhalten, ist der umgekehrte: die Schranke darf NICHT auf
 * „Feld im Body vorhanden" prüfen. Formulare schicken ihren ganzen Zustand mit, und die App auf dem
 * Gerät ist eine eigene, ältere Fassung — eine Anwesenheits-Prüfung nähme dem Träger das blosse
 * Umbenennen seiner Kategorie.
 */
import { describe, it, expect } from "vitest";
import {
  resolveCategoryRuleChanges, CATEGORY_RULE_DEFAULTS, CATEGORY_RULE_FIELDS,
} from "./deviceCategoryService";

const current = { trackingEnabled: true, requirePhoto: false, allowVorgaben: true };
const own = { isBuiltIn: false, elevated: false };
const keyholder = { isBuiltIn: false, elevated: true };

describe("Kategorie-Regeln: wer darf umlegen", () => {
  it("lässt den Träger die unveränderten Werte mitschicken", () => {
    const r = resolveCategoryRuleChanges({ ...current, name: "Plugs" }, current, own);
    expect(r).toEqual({ ok: true, data: {} });
  });

  it("weist den Träger ab, sobald er einen Wert umlegt", () => {
    const r = resolveCategoryRuleChanges({ allowVorgaben: false }, current, own);
    expect(r).toEqual({ ok: false, status: 403, code: "CATEGORY_RULE_FORBIDDEN" });
  });

  it("weist ihn bei jedem der drei Felder ab", () => {
    for (const field of CATEGORY_RULE_FIELDS) {
      const r = resolveCategoryRuleChanges({ [field]: !current[field] }, current, own);
      expect(r, field).toEqual({ ok: false, status: 403, code: "CATEGORY_RULE_FORBIDDEN" });
    }
  });

  it("lässt den Keyholder umlegen und gibt nur die geänderten Felder zurück", () => {
    const r = resolveCategoryRuleChanges({ ...current, allowVorgaben: false }, current, keyholder);
    expect(r).toEqual({ ok: true, data: { allowVorgaben: false } });
  });

  it("ignoriert Werte, die keine Wahrheitswerte sind", () => {
    // Ein Client, der "false" als Zeichenkette schickt, darf weder durchkommen noch abgewiesen
    // werden — er hat schlicht nichts gesetzt.
    const r = resolveCategoryRuleChanges({ allowVorgaben: "false" }, current, own);
    expect(r).toEqual({ ok: true, data: {} });
  });
});

describe("Kategorie-Regeln: die eingebaute Kategorie", () => {
  it("lehnt jede Änderung ab, auch vom Keyholder", () => {
    // `isBuiltIn` schlägt `elevated`. Zwei der drei Regeln wären dort ohnehin wirkungslos; eine
    // wirkungslose Einstellung anzunehmen sähe danach gesetzt aus.
    const r = resolveCategoryRuleChanges({ trackingEnabled: false }, current, { isBuiltIn: true, elevated: true });
    expect(r).toEqual({ ok: false, status: 400, code: "CATEGORY_BUILTIN_RULE_IMMUTABLE" });
  });

  it("lässt unveränderte Werte auch dort durch", () => {
    const r = resolveCategoryRuleChanges(current, current, { isBuiltIn: true, elevated: false });
    expect(r).toEqual({ ok: true, data: {} });
  });
});

describe("Kategorie-Regeln: beim Anlegen", () => {
  it("lässt den Träger die Vorgabewerte anlegen", () => {
    const r = resolveCategoryRuleChanges({ ...CATEGORY_RULE_DEFAULTS }, CATEGORY_RULE_DEFAULTS, own);
    expect(r).toEqual({ ok: true, data: {} });
  });

  it("verhindert, dass er die Schranke durch Anlegen umgeht", () => {
    // Ohne diese Prüfung wäre die PATCH-Schranke wertlos: man legt die Kategorie gleich mit
    // abgeschalteter Zeiterfassung an.
    const r = resolveCategoryRuleChanges({ trackingEnabled: false }, CATEGORY_RULE_DEFAULTS, own);
    expect(r).toEqual({ ok: false, status: 403, code: "CATEGORY_RULE_FORBIDDEN" });
  });
});
