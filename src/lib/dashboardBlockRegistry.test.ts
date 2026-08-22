import { describe, it, expect } from "vitest";
import de from "../../messages/de.json";
import en from "../../messages/en.json";
import {
  BLOCK_SURFACES, DASHBOARD_BLOCKS, SUB_DASHBOARD_BLOCKS, blocksOf, orderedBlocks,
  type SubDashboardBlockId,
} from "@/lib/dashboardBlockRegistry";

/**
 * Was der Compiler NICHT abdeckt.
 *
 * Die Vollständigkeit des Registers gegenüber der Seite erzwingt der Typ
 * `Record<SubDashboardBlockId, ReactNode>` — ein vergessener oder erfundener Block ist dort ein
 * Compile-Fehler. Hier steht nur, was ein Typ nicht sehen kann: doppelte Ids, fehlende
 * Beschriftungen, und dass die Reihenfolge wirklich aus dem Register kommt.
 */
describe("Dashboard-Block-Register", () => {
  it("jede Id kommt genau einmal vor", () => {
    const ids = DASHBOARD_BLOCKS.map((b) => b.id);
    const doppelt = ids.filter((id, i) => ids.indexOf(id) !== i);
    expect(doppelt, `Doppelte Block-Id(s): ${doppelt.join(", ")}`).toEqual([]);
  });

  it("jeder Block hat eine Beschriftung in beiden Sprachen", () => {
    // Ohne diesen Test fällt eine fehlende Beschriftung erst im Bearbeiten-Modus auf — und dort
    // als roher Schlüsselname, nicht als Fehler.
    for (const [lang, messages] of [["de", de], ["en", en]] as const) {
      const namespace = messages.dashboard as Record<string, string>;
      const fehlt = DASHBOARD_BLOCKS.filter((b) => !namespace[b.labelKey]).map((b) => b.labelKey);
      expect(fehlt, `\nFehlende Beschriftung in messages/${lang}.json (Namespace "dashboard"):\n  ${fehlt.join("\n  ")}\n`).toEqual([]);
    }
  });

  it("blocksOf trennt die Oberflächen sauber", () => {
    const summe = BLOCK_SURFACES.reduce((n, s) => n + blocksOf(s).length, 0);
    expect(summe).toBe(DASHBOARD_BLOCKS.length);
    expect(blocksOf("subDashboard").every((b) => b.surface === "subDashboard")).toBe(true);
  });

  it("orderedBlocks folgt der Reihenfolge des Registers, nicht der des Records", () => {
    // Der Record wird in der Seite in Lese-Reihenfolge geschrieben; verlassen darf sich darauf
    // niemand. Deshalb hier ein Record in ABSICHTLICH falscher Reihenfolge.
    const rueckwaerts = Object.fromEntries(
      [...SUB_DASHBOARD_BLOCKS].reverse().map((b) => [b.id, b.id]),
    ) as Record<SubDashboardBlockId, string>;
    expect(orderedBlocks("subDashboard", rueckwaerts).map((x) => x.id))
      .toEqual(SUB_DASHBOARD_BLOCKS.map((b) => b.id));
  });

  it("die erste Oberfläche ist vollständig belegt", () => {
    // Etappe C1 deckt nur das Träger-Dashboard ab; die drei übrigen kommen in C3 dazu. Der Test
    // hält fest, was heute gilt, damit „subStats ist leer" eine Aussage bleibt und kein Versehen.
    expect(blocksOf("subDashboard").length).toBe(15);
    expect(blocksOf("subStats")).toEqual([]);
    expect(blocksOf("keyholderSub")).toEqual([]);
    expect(blocksOf("keyholderStats")).toEqual([]);
  });
});
