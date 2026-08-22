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
    expect(log).toContain("greeting:x");
    expect(log).toHaveLength(SUB_DASHBOARD_BLOCKS.length - 2);
    expect(out.map((b) => b.id)).not.toContain("sessionList");
  });

  it("rendert in der wirksamen Reihenfolge, nicht in der des Registers", async () => {
    const log: string[] = [];
    const layout = resolveLayout({ subDashboard: { order: ["taskList", "greeting"] } }, "subDashboard");

    const out = await renderStack(layout, { marke: "x" }, spyTable(log));

    expect(out[0].id).toBe("taskList");
    expect(out[1].id).toBe("greeting");
    expect(out.map((b) => b.node)).toEqual(out.map((b) => b.id));
  });

  it("ein Block ohne eigene Abfrage bekommt den Kontext", async () => {
    const layout = resolveLayout({ subDashboard: { hidden: SUB_DASHBOARD_BLOCKS.map((b) => b.id) } }, "subDashboard");
    const table: Record<SubDashboardBlockId, StackBlock<Ctx>> = {
      ...spyTable([]),
      greeting: async (ctx) => `hallo ${ctx.marke}`,
    };

    const out = await renderStack(layout, { marke: "welt" }, table);

    // `greeting` ist `alwaysOn` — es bleibt als einziger Block stehen.
    expect(out).toEqual([{ id: "greeting", node: "hallo welt" }]);
  });
});

describe("resolveLayout.shows", () => {
  it("beantwortet die Sichtbarkeit eines einzelnen Blocks", () => {
    const layout = resolveLayout({ subDashboard: { hidden: ["runningSession"] } }, "subDashboard");
    expect(layout.shows("runningSession")).toBe(false);
    expect(layout.shows("categoryGoals")).toBe(true);
  });

  it("ein `alwaysOn`-Block bleibt sichtbar, auch wenn er ausgeblendet gespeichert wurde", () => {
    const layout = resolveLayout({ subDashboard: { hidden: ["greeting"] } }, "subDashboard");
    expect(layout.shows("greeting")).toBe(true);
  });
});
