import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * B-04 (MCP-Befundliste 2026-07-17): list_training_goals blendet soft-gelöschte Ziele standardmässig
 * aus und liefert sie nur mit includeDeleted:true — dann mit status:"deleted" + gesetztem deletedAt.
 */

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
  },
}));
vi.mock("@/lib/vorgabeService", () => ({
  listVorgaben: vi.fn(),
}));

import { mcpListTrainingGoals } from "./mcpWrite";
import { prisma } from "@/lib/prisma";
import { listVorgaben } from "@/lib/vorgabeService";

const userFind = prisma.user.findUnique as unknown as ReturnType<typeof vi.fn>;
const listMock = listVorgaben as unknown as ReturnType<typeof vi.fn>;

const AB = new Date("2026-01-01T00:00:00Z");

beforeEach(() => {
  userFind.mockReset().mockResolvedValue({ id: "u1", timezone: "Europe/Zurich" });
  listMock.mockReset().mockResolvedValue([]);
});

describe("mcpListTrainingGoals — Soft-Delete-Sichtbarkeit (B-04)", () => {
  it("reicht includeDeleted an listVorgaben durch (Default: undefined → nur aktive)", async () => {
    await mcpListTrainingGoals("kg", {});
    expect(listMock).toHaveBeenCalledWith("u1", { includeDeleted: undefined });
  });

  it("includeDeleted:true wird durchgereicht", async () => {
    await mcpListTrainingGoals("kg", { includeDeleted: true });
    expect(listMock).toHaveBeenCalledWith("u1", { includeDeleted: true });
  });

  it("ein soft-gelöschtes Ziel bekommt status:'deleted' und ein gesetztes deletedAt, unabhängig vom Datumsfenster", async () => {
    listMock.mockResolvedValue([{
      id: "g1", categoryId: "c1", category: { name: "KG" },
      gueltigAb: AB, gueltigBis: null, // Datumsfenster spräche für "active"
      minProTagH: 8, minProWocheH: null, minProMonatH: null, minProJahrH: null, notiz: null,
      deletedAt: new Date("2026-07-17T10:00:00Z"),
    }]);
    const res = await mcpListTrainingGoals("kg", { includeDeleted: true });
    expect(res.goals[0].status).toBe("deleted");
    expect(res.goals[0].deletedAt).toBe("2026-07-17T10:00:00.000Z");
  });

  it("ein aktives Ziel hat deletedAt:null und den datumsbasierten Status", async () => {
    listMock.mockResolvedValue([{
      id: "g2", categoryId: "c1", category: { name: "KG" },
      gueltigAb: AB, gueltigBis: null,
      minProTagH: 8, minProWocheH: null, minProMonatH: null, minProJahrH: null, notiz: null,
      deletedAt: null,
    }]);
    const res = await mcpListTrainingGoals("kg", {});
    expect(res.goals[0].status).toBe("active");
    expect(res.goals[0].deletedAt).toBeNull();
  });
});
