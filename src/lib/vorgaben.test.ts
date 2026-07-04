import { describe, it, expect, vi, beforeEach } from "vitest";

// reorderVorgabenDates nutzt nur prisma.trainingVorgabe.findMany + update — beides mocken.
vi.mock("@/lib/prisma", () => ({
  prisma: { trainingVorgabe: { findMany: vi.fn(), update: vi.fn() } },
}));

import { reorderVorgabenDates } from "./vorgaben";
import { prisma } from "@/lib/prisma";

const findManyMock = prisma.trainingVorgabe.findMany as unknown as ReturnType<typeof vi.fn>;
const updateMock = prisma.trainingVorgabe.update as unknown as ReturnType<typeof vi.fn>;

type Row = {
  id: string;
  categoryId: string | null;
  gueltigAb: Date;
  gueltigBis: Date | null;
  gueltigBisManuell: boolean;
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
  it("einzige Vorgabe mit gueltigBisManuell behält ihr Enddatum (kein Update)", async () => {
    // Regression: einzige Vorgabe galt als „neueste" → wurde zwangsweise auf offen (null) gesetzt.
    setRows([{ id: "a", categoryId: "c1", gueltigAb: AB1, gueltigBis: MANUAL_END, gueltigBisManuell: true }]);
    await reorderVorgabenDates("u1");
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("manuelles Ende bleibt auch mit späterer Vorgabe unangetastet", async () => {
    setRows([
      { id: "a", categoryId: "c1", gueltigAb: AB1, gueltigBis: MANUAL_END, gueltigBisManuell: true },
      { id: "b", categoryId: "c1", gueltigAb: AB2, gueltigBis: null, gueltigBisManuell: false },
    ]);
    await reorderVorgabenDates("u1");
    // a wird übersprungen (manuell), b ist letzte & bereits offen → gar kein Update.
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("nicht-manuelle Vorgaben werden weiterhin verkettet (Vorgänger endet am Start der nächsten)", async () => {
    setRows([
      { id: "a", categoryId: "c1", gueltigAb: AB1, gueltigBis: null, gueltigBisManuell: false },
      { id: "b", categoryId: "c1", gueltigAb: AB2, gueltigBis: null, gueltigBisManuell: false },
    ]);
    await reorderVorgabenDates("u1");
    const updated = updatedBisById();
    expect(updated.a).toEqual(AB2); // a endet am Start von b
    expect(updated.b).toBeUndefined(); // b letzte & schon offen → kein Update
  });

  it("nach Löschen der Folge-Vorgabe geht eine nicht-manuelle Vorgabe wieder auf", async () => {
    // a hatte via Verkettung ein Enddatum (manuell=false); b existiert nicht mehr → a muss offen werden.
    setRows([{ id: "a", categoryId: "c1", gueltigAb: AB1, gueltigBis: AB2, gueltigBisManuell: false }]);
    await reorderVorgabenDates("u1");
    expect(updatedBisById().a).toBeNull();
  });
});
