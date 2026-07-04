import { describe, it, expect, vi, beforeEach } from "vitest";

// mcpEditTrainingGoal soll ein PARTIAL-Update sein: weggelassene Argumente behalten den Bestand.
// prisma + der Service-Layer werden gemockt, um genau zu prüfen, was an updateVorgabe übergeben wird.
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    trainingVorgabe: { findUnique: vi.fn() },
  },
}));
vi.mock("@/lib/vorgabeService", () => ({
  createVorgabe: vi.fn(),
  updateVorgabe: vi.fn(),
  deleteVorgabe: vi.fn(),
  listVorgaben: vi.fn(),
}));

import { mcpEditTrainingGoal } from "./mcpWrite";
import { prisma } from "@/lib/prisma";
import { updateVorgabe } from "@/lib/vorgabeService";

const userFind = prisma.user.findUnique as unknown as ReturnType<typeof vi.fn>;
const vorgabeFind = prisma.trainingVorgabe.findUnique as unknown as ReturnType<typeof vi.fn>;
const updateMock = updateVorgabe as unknown as ReturnType<typeof vi.fn>;

const AB = new Date("2026-06-01T00:00:00Z");
const MANUAL_END = new Date("2026-07-04T00:00:00Z");

beforeEach(() => {
  userFind.mockReset().mockResolvedValue({ id: "u1" });
  vorgabeFind.mockReset();
  updateMock.mockReset().mockResolvedValue({ ok: true, data: { id: "g1", userId: "u1" } });
});

describe("mcpEditTrainingGoal — echter Teil-Edit", () => {
  it("nur Stunden ändern: Startdatum, manuelles Ende, übrige Stunden & Notiz bleiben erhalten", async () => {
    // Regression: früher setzte ein Teil-Edit gueltigAb=now(), gueltigBis=null (Ende weg) und
    // die nicht genannten Stundenziele auf null.
    vorgabeFind.mockResolvedValue({
      userId: "u1", gueltigAb: AB, gueltigBis: MANUAL_END, gueltigBisManuell: true,
      minProTagH: 6, minProWocheH: null, minProMonatH: null, notiz: "Stufe 2",
    });
    await mcpEditTrainingGoal("kg", { id: "g1", minPerDayHours: 8 });
    expect(updateMock).toHaveBeenCalledWith("g1", expect.objectContaining({
      gueltigAb: AB,
      gueltigBis: MANUAL_END,
      gueltigBisManuell: true,
      minProTagH: 8,
      minProWocheH: null,
      minProMonatH: null,
      notiz: "Stufe 2",
    }));
  });

  it("validUntil setzen markiert das Ende als manuell", async () => {
    vorgabeFind.mockResolvedValue({
      userId: "u1", gueltigAb: AB, gueltigBis: null, gueltigBisManuell: false,
      minProTagH: 6, minProWocheH: null, minProMonatH: null, notiz: null,
    });
    await mcpEditTrainingGoal("kg", { id: "g1", validUntil: "2026-08-01" });
    const arg = updateMock.mock.calls[0][1];
    expect(arg.gueltigBisManuell).toBe(true);
    expect(arg.gueltigBis).toEqual(new Date("2026-08-01"));
  });

  it("validUntil weglassen behält ein abgeleitetes Ende abgeleitet (manuell bleibt false)", async () => {
    vorgabeFind.mockResolvedValue({
      userId: "u1", gueltigAb: AB, gueltigBis: MANUAL_END, gueltigBisManuell: false,
      minProTagH: 6, minProWocheH: null, minProMonatH: null, notiz: null,
    });
    await mcpEditTrainingGoal("kg", { id: "g1", minPerDayHours: 8 });
    const arg = updateMock.mock.calls[0][1];
    expect(arg.gueltigBis).toEqual(MANUAL_END);
    expect(arg.gueltigBisManuell).toBe(false);
  });

  it("validUntil='' wird als „nicht angegeben\" behandelt (kein Parse-Fehler, Bestand bleibt)", async () => {
    vorgabeFind.mockResolvedValue({
      userId: "u1", gueltigAb: AB, gueltigBis: MANUAL_END, gueltigBisManuell: true,
      minProTagH: 6, minProWocheH: null, minProMonatH: null, notiz: null,
    });
    await mcpEditTrainingGoal("kg", { id: "g1", validUntil: "", minPerDayHours: 8 });
    const arg = updateMock.mock.calls[0][1];
    expect(arg.gueltigBis).toEqual(MANUAL_END);
    expect(arg.gueltigBisManuell).toBe(true);
  });

  it("reiner Notiz-/Stunden-Edit wirft nicht, wenn Bestands-Ende == Start (verkettet, gleicher Tag)", async () => {
    // Regression: der Datums-Guard lief auch ohne Datums-Argument und warf bei gueltigBis == gueltigAb.
    vorgabeFind.mockResolvedValue({
      userId: "u1", gueltigAb: AB, gueltigBis: AB, gueltigBisManuell: false,
      minProTagH: 6, minProWocheH: null, minProMonatH: null, notiz: null,
    });
    await expect(mcpEditTrainingGoal("kg", { id: "g1", minPerDayHours: 8 })).resolves.toMatchObject({ ok: true });
    expect(updateMock).toHaveBeenCalled();
  });

  it("wirft bei fremder/fehlender Vorgabe und schreibt nicht", async () => {
    vorgabeFind.mockResolvedValue(null);
    await expect(mcpEditTrainingGoal("kg", { id: "x", minPerDayHours: 8 })).rejects.toThrow(/not found/);
    expect(updateMock).not.toHaveBeenCalled();
  });
});
