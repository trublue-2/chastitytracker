import { describe, it, expect, vi, beforeEach } from "vitest";

// setAutoKontrolleSettings schreibt via prisma.user.update und plant danach den Tag neu
// (kontrollAnforderung.deleteMany/createMany) — beides mocken.
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { update: vi.fn() },
    kontrollAnforderung: { deleteMany: vi.fn(), createMany: vi.fn() },
  },
}));

import { setAutoKontrolleSettings } from "./autoKontrolleService";
import { serviceResponse } from "./serviceResult";
import { prisma } from "@/lib/prisma";

const updateMock = prisma.user.update as unknown as ReturnType<typeof vi.fn>;
const deleteManyMock = prisma.kontrollAnforderung.deleteMany as unknown as ReturnType<typeof vi.fn>;

const SAVED_USER = {
  id: "u1", timezone: "Europe/Zurich", autoKontrolleAktiv: false,
  autoKontrollePerDayMin: 0, autoKontrollePerDayMax: 0,
  autoKontrolleRuheVon: "22:00", autoKontrolleRuheBis: "06:00",
  autoKontrolleFristVon: 15, autoKontrolleFristBis: 60,
};

beforeEach(() => {
  updateMock.mockReset().mockResolvedValue(SAVED_USER);
  deleteManyMock.mockReset().mockResolvedValue({ count: 0 });
});

describe("setAutoKontrolleSettings — ungültige Uhrzeit", () => {
  it("lehnt eine kaputte HH:MM mit 400/invalidTime ab, statt sie still zu verwerfen", async () => {
    const result = await setAutoKontrolleSettings("u1", { ruheVon: "25:99" });
    expect(result).toEqual({ ok: false, status: 400, error: "invalidTime" });
  });

  it("schreibt bei ungültiger Zeit NICHTS — kein Update, keine Neuplanung", async () => {
    await setAutoKontrolleSettings("u1", { aktiv: true, ruheBis: "" });
    expect(updateMock).not.toHaveBeenCalled();
    expect(deleteManyMock).not.toHaveBeenCalled();
  });

  it("unterscheidet den leeren Patch (noFieldsToUpdate) von der ungültigen Zeit (invalidTime)", async () => {
    expect(await setAutoKontrolleSettings("u1", {})).toMatchObject({ error: "noFieldsToUpdate" });
    expect(await setAutoKontrolleSettings("u1", { ruheVon: "x" })).toMatchObject({ error: "invalidTime" });
  });

  it("speichert eine gültige Zeit", async () => {
    const result = await setAutoKontrolleSettings("u1", { ruheVon: "23:30" });
    expect(result).toEqual({ ok: true, data: null });
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: { autoKontrolleRuheVon: "23:30" } }),
    );
  });
});

describe("serviceResponse — die Route darf das ServiceResult nicht verwerfen", () => {
  it("reicht Status + Fehler-Code eines abgelehnten Patches durch", async () => {
    const res = serviceResponse(await setAutoKontrolleSettings("u1", { ruheVon: "24:00" }));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "invalidTime" });
  });

  it("antwortet nur bei echtem Erfolg mit {ok:true}", async () => {
    const res = serviceResponse(await setAutoKontrolleSettings("u1", { ruheVon: "22:00" }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
  });
});
