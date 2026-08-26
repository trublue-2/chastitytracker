import { describe, it, expect } from "vitest";
import { block, renderStack, type StackBlock } from "@/lib/blockStack";
import { resolveLayout } from "@/lib/dashboardLayout";
import { SUB_DASHBOARD_BLOCKS, type SubDashboardBlockId } from "@/lib/dashboardBlockRegistry";

/**
 * Die Zusage von Etappe B lautet: **ein ausgeblendeter Block kostet keine Abfrage.** Der Compiler
 * kann das nicht prüfen — er sieht, DASS jeder Block einen Loader hat, nicht dass die versteckten
 * ungerufen bleiben. Genau dafür sind diese Tests da.
 *
 * Die Blöcke sind hier Attrappen: der Loader schreibt seine Id in eine Liste, mehr nicht. Geprüft
 * wird die Maschinerie, nicht der Inhalt einer Oberfläche.
 */

type Ctx = { marke: string };

/** Eine vollständige Tabelle über das Träger-Dashboard, deren Loader nur protokollieren. */
function spyTable(log: string[]): Record<SubDashboardBlockId, StackBlock<Ctx>> {
  return Object.fromEntries(
    SUB_DASHBOARD_BLOCKS.map((b) => [
      b.id,
      block({
        load: async (ctx: Ctx) => { log.push(`${b.id}:${ctx.marke}`); return b.id; },
        render: (id) => id,
      }),
    ]),
  ) as Record<SubDashboardBlockId, StackBlock<Ctx>>;
}

describe("renderStack", () => {
  it("ruft die Loader der ausgeblendeten Blöcke gar nicht", async () => {
    const log: string[] = [];
    const layout = resolveLayout({ subDashboard: { hidden: ["sessionList", "taskList"] } }, "subDashboard");

    const out = await renderStack(layout, { marke: "x" }, spyTable(log));

    expect(log).not.toContain("sessionList:x");
    expect(log).not.toContain("taskList:x");
    expect(log).toContain("alerts:x");
    expect(log).toHaveLength(SUB_DASHBOARD_BLOCKS.length - 2);
    expect(out.map((b) => b.id)).not.toContain("sessionList");
  });

  it("rendert in der wirksamen Reihenfolge, nicht in der des Registers", async () => {
    const log: string[] = [];
    const layout = resolveLayout({ subDashboard: { order: ["taskList", "alerts"] } }, "subDashboard");

    const out = await renderStack(layout, { marke: "x" }, spyTable(log));

    expect(out[0].id).toBe("taskList");
    expect(out[1].id).toBe("alerts");
    expect(out.map((b) => b.node)).toEqual(out.map((b) => b.id));
  });

  it("ein Block ohne eigene Abfrage bekommt den Kontext", async () => {
    // Alles ausser EINEM ausblenden. Vorher stand hier `alwaysOn`, was den Test unbemerkt an
    // einen bestimmten Block band — fiel der weg, fiel der Test mit, obwohl er die Maschinerie
    // prüft und keinen Inhalt. Aus demselben Grund wird hier nicht auf die GANZE Liste geprüft:
    // `alwaysOn`-Blöcke lassen sich nicht wegschalten und stehen deshalb mit da.
    const alleAusserEinem = SUB_DASHBOARD_BLOCKS.map((b) => b.id).filter((id) => id !== "runningSession");
    const layout = resolveLayout({ subDashboard: { hidden: alleAusserEinem } }, "subDashboard");
    const table: Record<SubDashboardBlockId, StackBlock<Ctx>> = {
      ...spyTable([]),
      runningSession: async (ctx) => `hallo ${ctx.marke}`,
    };

    const out = await renderStack(layout, { marke: "welt" }, table);

    expect(out.find((b) => b.id === "runningSession")).toEqual({ id: "runningSession", node: "hallo welt" });
  });
});

describe("resolveLayout.shows", () => {
  it("beantwortet die Sichtbarkeit eines einzelnen Blocks", () => {
    // Nicht `runningSession`: der trägt seit #100 beide Zustände samt Reinigungs-Frist und ist
    // deshalb `alwaysOn` — er kann gar nicht mehr verborgen sein und taugte hier nur, solange er
    // es konnte.
    const layout = resolveLayout({ subDashboard: { hidden: ["categoryGoals"] } }, "subDashboard");
    expect(layout.shows("categoryGoals")).toBe(false);
    expect(layout.shows("sessionList")).toBe(true);
  });

  it("ein `alwaysOn`-Block bleibt sichtbar, auch wenn er ausgeblendet gespeichert wurde", () => {
    // Die Statistik-Überschrift trägt das Flag, weil sie Gerüst ist: eine Auswertung ohne Titel
    // liesse den Bildschirm ohne Anfang beginnen.
    const layout = resolveLayout({ subStats: { hidden: ["heading"] } }, "subStats");
    expect(layout.shows("heading")).toBe(true);
  });
});
