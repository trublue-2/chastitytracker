import { describe, it, expect, vi, beforeEach } from "vitest";

// reorderVorgabenDates nutzt nur prisma.trainingVorgabe.findMany + update — beides mocken.
// Die Kategorie-Zugehörigkeit kommt als Relation an der Zeile mit (`include`), nicht als zweite Query.
vi.mock("@/lib/prisma", () => ({
  prisma: { trainingVorgabe: { findMany: vi.fn(), update: vi.fn() } },
}));

import { reorderVorgabenDates, goalCategoryKey } from "./vorgaben";
import { prisma } from "@/lib/prisma";

const findManyMock = prisma.trainingVorgabe.findMany as unknown as ReturnType<typeof vi.fn>;
const updateMock = prisma.trainingVorgabe.update as unknown as ReturnType<typeof vi.fn>;
/** id der eingebauten KG-Kategorie in diesen Tests. */
const KG_ID = "cat-kg";

type Row = {
  id: string;
  categoryId: string | null;
  gueltigAb: Date;
  gueltigBis: Date | null;
  validUntilManual: boolean;
  /** Wie aus dem `include` der Abfrage — `null` für Zeilen ohne Kategorie. */
  category?: { isBuiltIn: boolean } | null;
};

function setRows(rows: Row[]) {
  // Service sortiert per orderBy gueltigAb asc — hier vorsortiert übergeben.
  findManyMock.mockResolvedValue(rows);
}

/** ids, für die update({ where:{id}, data:{ gueltigBis } }) aufgerufen wurde, → neues gueltigBis. */
function updatedBisById(): Record<string, Date | null> {
  const out: Record<string, Date | null> = {};
  for (const call of updateMock.mock.calls) out[call[0].where.id] = call[0].data.gueltigBis;
  return out;
}

beforeEach(() => {
  findManyMock.mockReset();
  updateMock.mockReset().mockResolvedValue({});
});

const AB1 = new Date("2026-07-02T00:00:00Z");
const AB2 = new Date("2026-07-10T00:00:00Z");
const MANUAL_END = new Date("2026-07-04T00:00:00Z");

describe("reorderVorgabenDates — manuelles Enddatum schützen", () => {
  it("einzige Vorgabe mit validUntilManual behält ihr Enddatum (kein Update)", async () => {
    // Regression: einzige Vorgabe galt als „neueste" → wurde zwangsweise auf offen (null) gesetzt.
    setRows([{ id: "a", categoryId: "c1", category: { isBuiltIn: false }, gueltigAb: AB1, gueltigBis: MANUAL_END, validUntilManual: true }]);
    await reorderVorgabenDates("u1");
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("manuelles Ende bleibt auch mit späterer Vorgabe unangetastet", async () => {
    setRows([
      { id: "a", categoryId: "c1", category: { isBuiltIn: false }, gueltigAb: AB1, gueltigBis: MANUAL_END, validUntilManual: true },
      { id: "b", categoryId: "c1", category: { isBuiltIn: false }, gueltigAb: AB2, gueltigBis: null, validUntilManual: false },
    ]);
    await reorderVorgabenDates("u1");
    // a wird übersprungen (manuell), b ist letzte & bereits offen → gar kein Update.
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("nicht-manuelle Vorgaben werden weiterhin verkettet (Vorgänger endet am Start der nächsten)", async () => {
    setRows([
      { id: "a", categoryId: "c1", category: { isBuiltIn: false }, gueltigAb: AB1, gueltigBis: null, validUntilManual: false },
      { id: "b", categoryId: "c1", category: { isBuiltIn: false }, gueltigAb: AB2, gueltigBis: null, validUntilManual: false },
    ]);
    await reorderVorgabenDates("u1");
    const updated = updatedBisById();
    expect(updated.a).toEqual(AB2); // a endet am Start von b
    expect(updated.b).toBeUndefined(); // b letzte & schon offen → kein Update
  });

  it("nach Löschen der Folge-Vorgabe geht eine nicht-manuelle Vorgabe wieder auf", async () => {
    // a hatte via Verkettung ein Enddatum (manuell=false); b existiert nicht mehr → a muss offen werden.
    setRows([{ id: "a", categoryId: "c1", category: { isBuiltIn: false }, gueltigAb: AB1, gueltigBis: AB2, validUntilManual: false }]);
    await reorderVorgabenDates("u1");
    expect(updatedBisById().a).toBeNull();
  });
});

describe("reorderVorgabenDates — KG ist EINE Kategorie, in beiden Schreibweisen", () => {
  it("ein KG-Ziel mit Kategorie-id beendet ein älteres KG-Ziel ohne categoryId", async () => {
    // Der Vorfall vom 23.08.2026: das alte Ziel entstand über den MCP ohne `category`
    // (categoryId null), das neue über die Oberfläche mit der id der eingebauten Kategorie.
    // Getrennt gruppiert blieben BEIDE offen — list_training_goals zeigte zwei aktive KG-Ziele.
    setRows([
      { id: "alt", categoryId: null, gueltigAb: AB1, gueltigBis: null, validUntilManual: false },
      { id: "neu", categoryId: KG_ID, category: { isBuiltIn: true }, gueltigAb: AB2, gueltigBis: null, validUntilManual: false },
    ]);
    await reorderVorgabenDates("u1");
    expect(updatedBisById().alt).toEqual(AB2);
  });

  it("und umgekehrt: das ältere Ziel trägt die Kategorie-id, das neue nicht", async () => {
    setRows([
      { id: "alt", categoryId: KG_ID, category: { isBuiltIn: true }, gueltigAb: AB1, gueltigBis: null, validUntilManual: false },
      { id: "neu", categoryId: null, gueltigAb: AB2, gueltigBis: null, validUntilManual: false },
    ]);
    await reorderVorgabenDates("u1");
    expect(updatedBisById().alt).toEqual(AB2);
  });

  it("eine andere Kategorie läuft weiterhin parallel zu KG", async () => {
    // Die Zusammenlegung darf nicht ZU viel greifen: Plug und KG sind verschiedene Ketten.
    setRows([
      { id: "kg", categoryId: null, gueltigAb: AB1, gueltigBis: null, validUntilManual: false },
      { id: "plug", categoryId: "c1", category: { isBuiltIn: false }, gueltigAb: AB2, gueltigBis: null, validUntilManual: false },
    ]);
    await reorderVorgabenDates("u1");
    expect(updateMock).not.toHaveBeenCalled();
  });
});

describe("goalCategoryKey — die kanonische Kategorie-Kennung", () => {
  it("beide KG-Schreibweisen ergeben denselben Schlüssel", () => {
    expect(goalCategoryKey({ categoryId: null })).toBeNull();
    expect(goalCategoryKey({ categoryId: KG_ID, category: { isBuiltIn: true } })).toBeNull();
  });

  it("eine gewöhnliche Kategorie behält ihre id", () => {
    expect(goalCategoryKey({ categoryId: "c1", category: { isBuiltIn: false } })).toBe("c1");
  });

  it("darauf beruht der Filter von list_training_goals", () => {
    // `resolveCategory("KG")` liefert die id der eingebauten Kategorie; ein Vergleich gegen die
    // rohe categoryId hätte das Ziel mit `categoryId: null` lautlos weggelassen.
    const filterKey = goalCategoryKey({ categoryId: KG_ID, category: { isBuiltIn: true } });
    const ziele = [
      { categoryId: null },
      { categoryId: KG_ID, category: { isBuiltIn: true } },
      { categoryId: "c1", category: { isBuiltIn: false } },
    ];
    expect(ziele.filter((g) => goalCategoryKey(g) === filterKey)).toHaveLength(2);
  });
});
