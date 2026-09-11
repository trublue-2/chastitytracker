import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Der Strafen-Block des Sub-Dashboards — die Frage, welche Strafaufgabe er VERSCHWEIGEN muss.
 *
 * Der Straftext einer Strafaufgabe IST ihr Titel (`punishWithTask`). Solange die Aufgabe für den
 * Träger noch nicht existiert, existiert damit auch ihr Straftext für ihn nicht — und das gilt
 * unabhängig davon, ob sie später noch ausgelöst wird oder vorher zurückgezogen wurde.
 */

vi.mock("@/lib/prisma", () => ({
  prisma: { strafeRecord: { count: vi.fn() }, task: { findMany: vi.fn() } },
}));
vi.mock("next-intl/server", () => ({ getTranslations: vi.fn(async () => (k: string) => k) }));
vi.mock("@/lib/subOffenses", () => ({
  loadSubOffenses: vi.fn(async () => []),
  // Die Auswahl nachgebildet (offene Strafen + gemeldetes Unbeurteiltes) — geprüft wird hier, was der
  // Block lädt und durchlässt; die Auswahl selbst testet `attentionOffenses.test.ts`.
  subAttentionOffensesOf: (o: { refId: string; state: string }[], announced: Set<string>) =>
    o.filter((p) => p.state === "punished" || (p.state === "open" && announced.has(p.refId))),
}));
vi.mock("@/lib/offenseAnnounce", () => ({ announcedOpenRefs: vi.fn(async () => new Set<string>()) }));
vi.mock("@/lib/offenseStatementService", () => ({ loadStatementViews: vi.fn(async () => new Map()) }));
// Die Anzeige ist hier ohne Belang: geprüft wird, was der Block lädt und was er davon durchlässt.
vi.mock("@/app/components/DashboardBlock", () => ({ default: () => null }));
vi.mock("@/app/components/OffenseList", () => ({ default: () => null }));

import OpenPenalties from "./OpenPenalties";
import { SUB_VISIBLE_WHERE } from "@/lib/taskIntervals";
import { prisma } from "@/lib/prisma";
import { loadSubOffenses } from "@/lib/subOffenses";
import { announcedOpenRefs } from "@/lib/offenseAnnounce";
import { loadStatementViews } from "@/lib/offenseStatementService";

const count = prisma.strafeRecord.count as unknown as ReturnType<typeof vi.fn>;
const findMany = prisma.task.findMany as unknown as ReturnType<typeof vi.fn>;
const offenses = loadSubOffenses as unknown as ReturnType<typeof vi.fn>;

const NOW = new Date("2026-08-16T10:00:00Z");
const render = () =>
  OpenPenalties({ userId: "u1", tz: "Europe/Zurich", now: NOW, dashboardTaskIds: new Set<string>() });

beforeEach(() => {
  vi.clearAllMocks();
  count.mockResolvedValue(1);
  findMany.mockResolvedValue([]);
  offenses.mockResolvedValue([]);
});

describe("OpenPenalties — verborgene Strafaufgaben", () => {
  it("fragt nach ALLEN für den Träger unsichtbaren Aufgaben, nicht nur den noch zustellbaren", async () => {
    offenses.mockResolvedValue([{ refId: "r1", state: "punished", taskId: "t1" }]);
    await render();

    // Die Umkehrung der Sichtbarkeits-Regel, wörtlich — damit ein leeres oder verändertes Fragment
    // auffällt. Vorher stand hier `pendingDispatchWhere`, die ZUSTELL-Auswahl des Pollers: sie trägt
    // zusätzlich `withdrawnAt: null` und liess damit ausgerechnet die zurückgezogene, nie
    // ausgelöste Strafaufgabe durch.
    expect(findMany.mock.calls[0][0].where).toEqual({ id: { in: ["t1"] }, userId: "u1", NOT: SUB_VISIBLE_WHERE });
    expect(JSON.stringify(findMany.mock.calls[0][0].where)).not.toContain("withdrawnAt");
  });

  /** Ohne Strafaufgabe gibt es nichts zu prüfen — und der Block soll dafür nicht die ganze
   *  Aufgabenliste des Nutzers laden. Der häufigste Fall auf jedem Dashboard-Aufruf. */
  it("fragt gar nicht, wenn keine offene Strafe an einer Aufgabe hängt", async () => {
    offenses.mockResolvedValue([{ refId: "r1", state: "punished", taskId: null }]);
    await render();
    expect(findMany).not.toHaveBeenCalled();
  });

  it("lässt eine Strafe verschwinden, deren Aufgabe der Träger nicht kennt", async () => {
    findMany.mockResolvedValue([{ id: "t1" }]);
    offenses.mockResolvedValue([{ refId: "r1", state: "punished", taskId: "t1" }]);

    // Kein Block statt eines Blocks mit dem Aufgaben-Titel darin.
    expect(await render()).toBeNull();
  });
});

describe("OpenPenalties — gemeldete, unbeurteilte Vergehen", () => {
  it("ohne jede Strafe und ohne Gemeldetes lädt der Block das Strafbuch gar nicht", async () => {
    count.mockResolvedValue(0);
    expect(await render()).toBeNull();
    expect(offenses).not.toHaveBeenCalled();
  });

  it("zeigt ein gemeldetes Vergehen auch ohne offene Strafe — dort nimmt der Träger Stellung", async () => {
    count.mockResolvedValue(0);
    vi.mocked(announcedOpenRefs).mockResolvedValueOnce(new Set(["r1"]));
    offenses.mockResolvedValue([{ refId: "r1", state: "open", taskId: null }]);
    expect(await render()).not.toBeNull();
    expect(loadStatementViews).toHaveBeenCalledWith(["r1"], { userId: "u1", refIds: ["r1"] });
  });

  it("drei unbeurteilte Vergehen verdrängen die offene Strafe nicht — das Limit gilt je Art", async () => {
    vi.mocked(announcedOpenRefs).mockResolvedValueOnce(new Set(["o1", "o2", "o3"]));
    offenses.mockResolvedValue([
      { refId: "o1", state: "open", taskId: null }, { refId: "o2", state: "open", taskId: null },
      { refId: "o3", state: "open", taskId: null }, { refId: "p1", state: "punished", taskId: null },
    ]);
    await render();
    expect(vi.mocked(loadStatementViews).mock.calls[0][0]).toEqual(["o1", "o2", "o3", "p1"]);
  });
});
