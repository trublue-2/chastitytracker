import { describe, it, expect, vi, beforeEach } from "vitest";
import { createPrismaMock, type PrismaMock } from "@/test/prismaMock";

// setAutoKontrolleSettings liest den Stand vor dem Schreiben (user.findUnique), schreibt via
// prisma.user.update und würfelt bei einer echten Planungs-Änderung den Tag neu
// (kontrollAnforderung.deleteMany/findMany/createMany).
const prismaMock: PrismaMock = createPrismaMock();
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const { setAutoKontrolleSettings } = await import("./autoKontrolleService");
const { serviceResponse } = await import("./serviceResult");

const updateMock = prismaMock.user.update;
const findUniqueMock = prismaMock.user.findUnique;
const deleteManyMock = prismaMock.kontrollAnforderung.deleteMany;

const SAVED_USER = {
  id: "u1", timezone: "Europe/Zurich", autoKontrolleAktiv: false,
  autoKontrollePerDayMin: 0, autoKontrollePerDayMax: 0,
  autoKontrolleRuheVon: "22:00", autoKontrolleRuheBis: "06:00",
  autoKontrolleFristVon: 15, autoKontrolleFristBis: 60,
  autoKontrolleFensterVon: "", autoKontrolleFensterBis: "", autoKontrolleNurBeiSperre: false,
  autoInspectionPlannedFor: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  updateMock.mockResolvedValue(SAVED_USER);
  findUniqueMock.mockResolvedValue(SAVED_USER);
  deleteManyMock.mockResolvedValue({ count: 0 });
  prismaMock.kontrollAnforderung.findMany.mockResolvedValue([]);
  prismaMock.kontrollAnforderung.createMany.mockResolvedValue({ count: 0 });
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

  it("speichert den Nur-bei-Sperre-Schalter", async () => {
    const result = await setAutoKontrolleSettings("u1", { nurBeiSperre: true });
    expect(result).toEqual({ ok: true, data: null });
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: { autoKontrolleNurBeiSperre: true } }),
    );
  });

  it("meldet einen unbekannten User als 404, statt am Update zu zerschellen", async () => {
    findUniqueMock.mockResolvedValue(null);
    expect(await setAutoKontrolleSettings("weg", { ruheVon: "23:00" })).toMatchObject({ status: 404 });
    expect(updateMock).not.toHaveBeenCalled();
  });
});

/** Das Formular schickt bei jedem Speichern ALLE Felder. Neu gewürfelt wird trotzdem nur, wenn sich
 *  ein Planungsfeld wirklich ändert — sonst risse jedes Speichern den laufenden Tag ein. */
describe("setAutoKontrolleSettings — Neuwurf nur bei echter Planungs-Änderung", () => {
  /** Der Neuwurf ist am Aufräum-Delete erkennbar: nur er fasst die heutigen Zeilen an. */
  const wasRerolled = () => deleteManyMock.mock.calls.length > 0;

  it("würfelt neu, wenn sich ein Planungsfeld ändert", async () => {
    await setAutoKontrolleSettings("u1", { ruheVon: "23:30" });
    expect(wasRerolled()).toBe(true);
  });

  it("würfelt NICHT neu, wenn derselbe Wert nochmal gespeichert wird", async () => {
    await setAutoKontrolleSettings("u1", {
      aktiv: false, perDayMin: 0, perDayMax: 0, ruheVon: "22:00", ruheBis: "06:00",
      fristVon: 15, fristBis: 60, fensterVon: "", fensterBis: "",
    });
    expect(wasRerolled()).toBe(false);
  });

  it("würfelt NICHT neu für den Nur-bei-Sperre-Schalter — er plant nichts, er stellt nur zu", async () => {
    await setAutoKontrolleSettings("u1", { nurBeiSperre: true });
    expect(wasRerolled()).toBe(false);
  });

  it("wertet den GEKLEMMTEN Zielwert, nicht die Eingabe: −5 landet auf dem Bestand 0", async () => {
    await setAutoKontrolleSettings("u1", { perDayMin: -5 });
    expect(wasRerolled()).toBe(false);
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
