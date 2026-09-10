import { describe, it, expect } from "vitest";
import { statementBlockedReason, normalizeStatementText } from "./offenseStatementService";
import { offenseCanonicalFromNameKey, offenseCanonicalOrNull, offenseNameKey, OFFENSE_TYPE_I18N_KEYS } from "./offenseLabels";
import type { OffenseCanonicalType } from "./offenseTypes";

const OFFENSE_TYPES_FOR_TEST = Object.keys(OFFENSE_TYPE_I18N_KEYS) as OffenseCanonicalType[];

/**
 * Die Schranke der Stellungnahme — wann der Träger schreiben darf und wann nicht.
 *
 * Rein geprüft, ohne Datenbank: dieselbe Funktion beantwortet die Frage für die Anzeige (gibt es ein
 * Feld?) und für den Schreibweg (wird angenommen?). Liefen die beiden auseinander, verspräche die
 * Oberfläche ein Feld, das der Server ablehnt.
 */
describe("statementBlockedReason", () => {
  it("erlaubt, solange niemand geurteilt hat", () => {
    expect(statementBlockedReason({ allowed: true, judgedBy: null })).toBeNull();
  });

  it("sperrt, sobald ein Mensch geurteilt hat", () => {
    expect(statementBlockedReason({ allowed: true, judgedBy: "admin" })).toBe("STATEMENT_JUDGED");
  });

  it("sperrt auch nach einem Urteil der KI — sie ist die zweite Keyholderin, nicht die Mechanik", () => {
    expect(statementBlockedReason({ allowed: true, judgedBy: "ai" })).toBe("STATEMENT_JUDGED");
  });

  /**
   * Der Fall, an dem eine Schranke auf „es gibt ein Urteil" gescheitert wäre.
   *
   * `punishWrongDevice` schreibt sofort einen `StrafeRecord` mit `judgedBy: "system"` und gesetztem
   * `erledigtAt` — ohne Urteilsschritt, damit die Ahndung nicht im Urteilsloop hängt. Der Träger
   * bekommt darüber nur eine Meldung. Wäre das eine Sperre, könnte er sich ausgerechnet zu dem
   * einen Vergehen nie äussern, das die App im Alleingang ahndet.
   */
  it("sperrt NICHT bei der automatischen Ahndung", () => {
    expect(statementBlockedReason({ allowed: true, judgedBy: "system" })).toBeNull();
  });

  it("sperrt, wo die Keyholderin Stellungnahmen abgeschaltet hat", () => {
    expect(statementBlockedReason({ allowed: false, judgedBy: null })).toBe("STATEMENT_NOT_ALLOWED");
  });

  // Die Reihenfolge ist eine Aussage: wer gar nicht schreiben darf, bekommt nicht die Auskunft, dass
  // sein Vergehen inzwischen beurteilt wurde — das wäre eine Information aus einem Bereich, der für
  // ihn nicht offensteht.
  it("nennt zuerst die fehlende Freischaltung, nicht das Urteil", () => {
    expect(statementBlockedReason({ allowed: false, judgedBy: "admin" })).toBe("STATEMENT_NOT_ALLOWED");
  });
});

describe("normalizeStatementText", () => {
  it("trimmt", () => {
    expect(normalizeStatementText("  war im Zug  ")).toBe("war im Zug");
  });

  it("leer heisst zurücknehmen — nicht eine leere Stellungnahme", () => {
    expect(normalizeStatementText("   ")).toBeNull();
    expect(normalizeStatementText("")).toBeNull();
  });
});

/**
 * Die Rückrechnung der Art aus dem Namens-Schlüssel — der Weg, auf dem der Posteingang erfährt,
 * WORUNTER eine Stellungnahme gespeichert wird.
 *
 * Ohne sie bekommt eine Vergehens-Meldung kein Feld. Die automatische Geräte-Ahndung trug den
 * Schlüssel zunächst nicht mit; damit war ausgerechnet das Vergehen ohne Urteilsschritt das
 * einzige, zu dem sich der Träger nie äussern konnte — obwohl die Schranke es ausdrücklich erlaubt.
 */
describe("offenseCanonicalFromNameKey", () => {
  it("liest jede Art aus ihrem eigenen Schlüssel zurück", () => {
    for (const type of OFFENSE_TYPES_FOR_TEST) {
      expect(offenseCanonicalFromNameKey(offenseNameKey(type))).toBe(type);
    }
  });

  it("gibt null für Unbekanntes statt einen rohen Pfad durchzureichen", () => {
    expect(offenseCanonicalFromNameKey(undefined)).toBeNull();
    expect(offenseCanonicalFromNameKey("erfunden.name")).toBeNull();
  });
});

describe("offenseCanonicalOrNull", () => {
  it("nimmt eine gültige Art an und weist alles andere ab", () => {
    expect(offenseCanonicalOrNull("late_control")).toBe("late_control");
    expect(offenseCanonicalOrNull("lateControl")).toBeNull();
    expect(offenseCanonicalOrNull(42)).toBeNull();
    expect(offenseCanonicalOrNull(undefined)).toBeNull();
  });
});
