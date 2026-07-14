import { describe, it, expect } from "vitest";
import { boxCommandForEntry } from "./boxCommand";

/**
 * Die Box folgt dem Eintrag — ausser sie würde damit etwas Falsches behaupten.
 *
 * Der Verschluss-Fall ist ein gemeldeter Bug (11.07.2026): das Formular verlangte den Schalter
 * „Schlüssel ist in der Box" auf JA, sonst liess sich der Eintrag nicht speichern. Wer mit dem
 * Schlüssel verreiste, musste also lügen, um sich überhaupt eintragen zu können — und die leere Box
 * verriegelte daraufhin und meldete einen Hardware-Hold, den es nicht gab.
 */
describe("boxCommandForEntry", () => {
  it("VERSCHLUSS mit Schlüssel in der Box → verriegeln", () => {
    expect(boxCommandForEntry({ type: "VERSCHLUSS", keyInBox: true, brokeSperrzeit: false })).toBe("lock");
  });

  it("KERN-BUG 11.07.: VERSCHLUSS OHNE Schlüssel in der Box → die Box rührt sich NICHT", () => {
    // Der Eintrag wird trotzdem gespeichert — er ist wahr. Nur die leere Box spielt keinen Riegel.
    expect(boxCommandForEntry({ type: "VERSCHLUSS", keyInBox: false, brokeSperrzeit: false })).toBeNull();
  });

  it("fehlendes keyInBox → verriegeln wie bisher (keine Box, Admin-Pfad, Alt-Client)", () => {
    expect(boxCommandForEntry({ type: "VERSCHLUSS", brokeSperrzeit: false })).toBe("lock");
  });

  it("erlaubtes OEFFNEN → öffnen", () => {
    expect(boxCommandForEntry({ type: "OEFFNEN", brokeSperrzeit: false })).toBe("open");
  });

  it("VERBOTENES OEFFNEN (Sperrzeit gebrochen) → die Box bleibt zu", () => {
    // Sonst vollstreckte das Dokumentieren des Verstosses den Verstoss.
    expect(boxCommandForEntry({ type: "OEFFNEN", brokeSperrzeit: true })).toBeNull();
  });

  it("keyInBox gilt NUR für VERSCHLUSS — ein Öffnen bleibt ein Öffnen", () => {
    expect(boxCommandForEntry({ type: "OEFFNEN", keyInBox: false, brokeSperrzeit: false })).toBe("open");
  });

  it("andere Eintragstypen lassen die Box in Ruhe", () => {
    for (const type of ["PRUEFUNG", "ORGASMUS", "WEAR_BEGIN", "WEAR_END"]) {
      expect(boxCommandForEntry({ type, brokeSperrzeit: false })).toBeNull();
    }
  });
});
