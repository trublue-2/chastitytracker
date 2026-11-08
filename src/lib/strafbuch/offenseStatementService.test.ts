import { describe, it, expect } from "vitest";
import { statementBlockedReason, normalizeStatementText, statementView } from "./offenseStatementService";
import type { StatementGate } from "./offenseStatementService";
import { offenseCanonicalFromNameKey, offenseNameKey, OFFENSE_TYPE_I18N_KEYS } from "./offenseLabels";
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

/**
 * Die Zusage, auf der die ANZEIGE aufbaut (`OffenseStatementField`): ein gespeicherter Text wird
 * nie ausgelassen, und ein fehlender Eintrag heisst deshalb „kein Text" — nicht „Text unbekannt".
 *
 * Geprüft, weil das Feld sich darauf verlässt, statt selbst nachzusehen: fällt die Sicht mitten im
 * Tippen weg (jemand urteilt), bleibt es mit dem getippten Text stehen und lässt den Server
 * ablehnen. Kippte diese Zusage, wäre stattdessen ein GESPEICHERTER Text nicht mehr sichtbar, und
 * zwar lautlos.
 */
describe("statementView", () => {
  const open: StatementGate = { allowed: true, judgedBy: null };
  const judged: StatementGate = { allowed: true, judgedBy: "keyholder" };

  it("behält einen gespeicherten Text auch nach dem Urteil — nur nicht mehr änderbar", () => {
    expect(statementView("r1", "mein Einwand", judged)).toEqual({
      refId: "r1", text: "mein Einwand", editable: false,
    });
  });

  it("behält das leere Feld, solange er schreiben darf", () => {
    expect(statementView("r1", null, open)).toEqual({ refId: "r1", text: null, editable: true });
  });

  it("lässt aus, wo weder Text noch Recht vorliegt — genau der Fall, der unter dem Tippen eintritt", () => {
    expect(statementView("r1", null, judged)).toBeNull();
  });

  it("lässt auch ohne Gate aus — die Leser-Sicht der Keyholderin ohne gespeicherten Text", () => {
    expect(statementView("r1", null, undefined)).toBeNull();
  });
});
