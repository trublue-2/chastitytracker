import { describe, it, expect } from "vitest";
import de from "../../messages/de.json";
import en from "../../messages/en.json";
import {
  BLOCK_SURFACES, DASHBOARD_BLOCKS, SUB_DASHBOARD_BLOCKS, blocksOf,
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
  it("jede Id kommt je Oberfläche genau einmal vor", () => {
    // Je Oberfläche, nicht global: der gespeicherte Wert ist nach Oberfläche geschlüsselt, und die
    // beiden Statistik-Sichten teilen sich ihre Block-Namen absichtlich.
    for (const surface of BLOCK_SURFACES) {
      const ids = blocksOf(surface).map((b) => b.id);
      const doppelt = ids.filter((id, i) => ids.indexOf(id) !== i);
      expect(doppelt, `Doppelte Block-Id(s) auf ${surface}: ${doppelt.join(", ")}`).toEqual([]);
    }
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

  it("jede der vier Oberflächen ist belegt", () => {
    // Hält die Zahlen fest: ein Block, der beim Umbau verlorenginge, fiele hier auf und nicht
    // erst dem Nutzer.
    //
    // 16 → 15 mit dem Redesign: die Begrüssungszeile ist entfallen. Sie schrieb „Benutzer: <Name>"
    // als Überschrift über einen Bildschirm, auf dem der Name ohnehin in der Kopfzeile steht —
    // eine Zeile, die niemand liest und die den Platz der einen grossen Aussage besetzte. Eine
    // gespeicherte Reihenfolge verträgt das: `mergeOrder` lässt verschwundene Ids weg (Fall 1).
    expect(blocksOf("subDashboard").length).toBe(15);
    expect(blocksOf("subStats").length).toBe(13);
    expect(blocksOf("keyholderStats").length).toBe(13);
    expect(blocksOf("keyholderSub").length).toBe(14);
  });

  it("die beiden Statistik-Oberflächen tragen dieselben Blöcke in derselben Folge", () => {
    // Sie teilen sich `StatsMain`; liefen die Listen auseinander, wäre eine der beiden Seiten
    // unvollständig, ohne dass der Compiler es merkt (der Record-Typ ist für beide derselbe).
    expect(blocksOf("subStats").map((b) => b.id)).toEqual(blocksOf("keyholderStats").map((b) => b.id));
    expect(blocksOf("subStats").every((b) => b.role === "sub")).toBe(true);
    expect(blocksOf("keyholderStats").every((b) => b.role === "keyholder")).toBe(true);
  });
});
