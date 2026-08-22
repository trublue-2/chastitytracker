import { describe, it, expect } from "vitest";
import path from "node:path";
import {
  DURATION_FORMATS, PERCENT_FORMATS,
  DURATION_ASSEMBLY_EXCEPTIONS, PERCENT_MATH_EXCEPTIONS,
  type DisplayFormatException,
} from "@/lib/displayFormatRegistry";
import { readDurationAssemblies, readPercentMath, type SourceHit } from "@/lib/displayFormatSurfaces";

const ROOT = path.resolve(__dirname, "../..");

const covered = (hit: SourceHit, exceptions: readonly DisplayFormatException[]) =>
  exceptions.some((e) => e.file === hit.file && hit.text.includes(e.contains));

const report = (hits: SourceHit[], headline: string, remedy: string) =>
  `\n${headline}\n${hits.map((h) => `  ${h.file}:${h.line}\n    ${h.text}`).join("\n")}\n\n${remedy}\n`;

/**
 * Das Gate gegen die Rückkehr der acht Dauer-Formate und der sechs Prozent-Rechnungen.
 *
 * Warum ein Test und nicht eine Konvention: die Formate sind nicht aus Nachlässigkeit entstanden,
 * sondern aus dem Normalfall — jemand braucht eine Dauer, schreibt zwei Zeilen, und niemand sieht,
 * dass es die Funktion schon gibt. Genau das fängt hier auf.
 */
describe("Zahlen-Darstellung — Register gegen Quelltext", () => {
  it("keine Dauer wird ausserhalb der Formatierer zusammengesetzt", () => {
    const strays = readDurationAssemblies(ROOT).filter((h) => !covered(h, DURATION_ASSEMBLY_EXCEPTIONS));
    expect(strays, report(strays, "Selbstgebaute Dauer-Darstellung:",
      "Nimm formatDurationMs / formatDurationHours / formatDurationBetween aus @/lib/utils.\n" +
      "Ist es KEINE Dauer (ISO-Zeitstempel, Fliesstext), trag die Stelle mit Begründung in\n" +
      "DURATION_ASSEMBLY_EXCEPTIONS ein.")).toEqual([]);
  });

  it("kein Prozent wird ausserhalb von percent.ts gerechnet", () => {
    const strays = readPercentMath(ROOT).filter((h) => !covered(h, PERCENT_MATH_EXCEPTIONS));
    expect(strays, report(strays, "Eigene Prozent-Rechnung:",
      "Nimm goalPct / coveragePct / sharePct / ratioPct aus @/lib/percent — welche, entscheidet\n" +
      "der NENNER. Steht die Zahl ohne ihren Nenner auf dem Schirm, braucht sie ausserdem eine\n" +
      "Beschriftung (Vorbild: stats.percentLocked).")).toEqual([]);
  });

  /**
   * Die Gegenrichtung. Ohne sie bliebe eine Ausnahme stehen, nachdem ihre Zeile längst weg ist —
   * und deckte danach klaglos etwas Neues, das zufällig denselben Ausschnitt enthält.
   */
  it("jede Ausnahme deckt noch eine echte Fundstelle", () => {
    const check = (exceptions: readonly DisplayFormatException[], hits: SourceHit[], label: string) => {
      const dead = exceptions.filter((e) => !hits.some((h) => h.file === e.file && h.text.includes(e.contains)));
      const msg = `\nVeraltete ${label}-Ausnahme(n) — die beschriebene Zeile gibt es nicht mehr:\n` +
        dead.map((d) => `  ${d.file} — "${d.contains}"`).join("\n") + "\n";
      expect(dead, msg).toEqual([]);
    };
    check(DURATION_ASSEMBLY_EXCEPTIONS, readDurationAssemblies(ROOT), "Dauer");
    check(PERCENT_MATH_EXCEPTIONS, readPercentMath(ROOT), "Prozent");
  });

  it("das Register nennt jede Formatierer-Familie vollständig und ohne Dubletten", () => {
    const names = [...DURATION_FORMATS, ...PERCENT_FORMATS].map((f) => f.name);
    expect(new Set(names).size).toBe(names.length);
    // Die vier Prozent-Arten sind die Exporte von percent.ts — wer eine fünfte anlegt, trägt sie hier ein.
    expect(PERCENT_FORMATS.map((f) => f.name).sort())
      .toEqual(["coveragePct", "goalPct", "ratioPct", "sharePct"]);
  });
});
