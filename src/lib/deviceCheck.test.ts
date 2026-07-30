import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { effectiveDeviceCheckStatus } from "./deviceCheck";

describe("effectiveDeviceCheckStatus", () => {
  it("entschärft ein 'wrong' ohne erkanntes Gerät zu 'error' (nicht prüfbar)", () => {
    // Alt-Einträge aus der Zeit vor dem Schreibpfad-Fix (Issue #44): ein Nicht-Befund darf sich
    // nicht als Negativbefund lesen.
    expect(effectiveDeviceCheckStatus("wrong", null)).toBe("error");
    expect(effectiveDeviceCheckStatus("wrong", "")).toBe("error");
  });

  it("lässt ein 'wrong' MIT erkanntem Gerät unangetastet — der echte Negativbefund", () => {
    expect(effectiveDeviceCheckStatus("wrong", "Cage B")).toBe("wrong");
  });

  it("reicht alle anderen Stufen unverändert durch", () => {
    for (const s of ["pending", "ok", "missing", "error"]) expect(effectiveDeviceCheckStatus(s, null)).toBe(s);
    expect(effectiveDeviceCheckStatus("ok", "Cage A")).toBe("ok");
    expect(effectiveDeviceCheckStatus(null, null)).toBeNull();
  });

  it("'pending' bleibt 'pending' und wird NICHT mit 'nicht geprüft' verschmolzen", () => {
    // Genau diese Unterscheidung fehlte: kurz nach dem Einreichen las sich „läuft noch" wie
    // „kein Befund", und derselbe Eintrag meldete eine Viertelstunde später etwas anderes.
    expect(effectiveDeviceCheckStatus("pending", null)).toBe("pending");
    expect(effectiveDeviceCheckStatus("pending", null)).not.toBeNull();
  });

  it("unbekannte Rohwerte fallen auf null statt in den Enum zu rutschen", () => {
    expect(effectiveDeviceCheckStatus("weird", null)).toBeNull();
  });

  it("ist importfrei — das Vokabular muss aus Client- wie Server-Modulen erreichbar bleiben", () => {
    const src = readFileSync(new URL("./deviceCheck.ts", import.meta.url), "utf8");
    expect(src).not.toMatch(/^\s*import\s/m);
    expect(src).not.toMatch(/\brequire\(/);
  });
});
