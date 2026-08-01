import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Das Ziel einer Kontrolle (v5.0.1) — die Regeln, an denen alles andere hängt:
 * Anlegen (`requestKontrolle`), Zustellen (Poller), Erfüllen (entries-Route) und Eskalieren lesen
 * ALLE dieselbe Auflösung. Läuft sie auseinander, zeigt eine Kontrolle auf ein anderes Ziel, als
 * sie erfüllt bekommt.
 */

vi.mock("@/lib/prisma", () => ({
  prisma: {
    device: { findUnique: vi.fn() },
    deviceCategory: { findUnique: vi.fn() },
  },
}));
vi.mock("@/lib/queries", () => ({
  getLatestKgEntry: vi.fn(),
  getActiveWearSessionForCategory: vi.fn(),
}));

import { resolveInspectionTarget, isKgTarget, inspectionTargetWhere } from "./inspectionTarget";
import { prisma } from "@/lib/prisma";
import { getLatestKgEntry, getActiveWearSessionForCategory } from "@/lib/queries";

const deviceMock = prisma.device.findUnique as unknown as ReturnType<typeof vi.fn>;
const categoryMock = prisma.deviceCategory.findUnique as unknown as ReturnType<typeof vi.fn>;
const lockMock = getLatestKgEntry as unknown as ReturnType<typeof vi.fn>;
const wearMock = getActiveWearSessionForCategory as unknown as ReturnType<typeof vi.fn>;

const LOCK_ENTRY = { type: "VERSCHLUSS", startTime: new Date(), kontrollCode: "12345", deviceId: "kg-1", keyInBox: true, oeffnenGrund: null };
const WEAR_SESSION = { categoryId: "cat-plug", categoryName: "Plug", deviceId: "plug-1", deviceName: "njoy", since: new Date(), imageUrl: null };

beforeEach(() => {
  vi.clearAllMocks();
  lockMock.mockResolvedValue(LOCK_ENTRY);
  wearMock.mockResolvedValue(WEAR_SESSION);
});

describe("resolveInspectionTarget — KG ist die Vorgabe", () => {
  it("ohne Angaben: KG, aktiv wenn verschlossen, Gerät + Lock-Eintrag vom Verschluss", async () => {
    const r = await resolveInspectionTarget("u1", {});
    expect(r.ok && r.target).toMatchObject({
      categoryId: null, deviceId: null, active: true, activeDeviceId: "kg-1", lockEntry: LOCK_ENTRY,
    });
    expect(r.ok && isKgTarget(r.target)).toBe(true);
  });

  it("nicht verschlossen: KG-Ziel bleibt, ist aber inaktiv und hat kein Gerät", async () => {
    lockMock.mockResolvedValue({ ...LOCK_ENTRY, type: "OEFFNEN" });
    const r = await resolveInspectionTarget("u1", {});
    expect(r.ok && r.target.active).toBe(false);
    expect(r.ok && r.target.activeDeviceId).toBeNull();
  });

  it("die eingebaute KG-Kategorie wird auf `categoryId: null` normalisiert — EINE Darstellung", async () => {
    // Sonst gäbe es zwei Schreibweisen desselben Ziels, und der „eine je Ziel"-Guard träfe die
    // Bestandszeilen (categoryId: null) nicht mehr.
    categoryMock.mockResolvedValue({ userId: "u1", name: "Keuschheitsgürtel", isBuiltIn: true });
    const r = await resolveInspectionTarget("u1", { categoryId: "cat-kg" });
    expect(r.ok && r.target.categoryId).toBeNull();
    expect(r.ok && r.target.categoryName).toBeNull();
  });
});

describe("resolveInspectionTarget — Trage-Kategorien", () => {
  it("Kategorie: aktiv nur bei laufender Trage-Session, Gerät = das getragene", async () => {
    categoryMock.mockResolvedValue({ userId: "u1", name: "Plug", isBuiltIn: false });
    const r = await resolveInspectionTarget("u1", { categoryId: "cat-plug" });
    expect(r.ok && r.target).toMatchObject({
      categoryId: "cat-plug", categoryName: "Plug", active: true, activeDeviceId: "plug-1", lockEntry: null,
    });
  });

  it("ohne laufende Session: Ziel bleibt gültig, aber inaktiv (der Aufrufer lehnt ab, nicht wir)", async () => {
    categoryMock.mockResolvedValue({ userId: "u1", name: "Plug", isBuiltIn: false });
    wearMock.mockResolvedValue(null);
    const r = await resolveInspectionTarget("u1", { categoryId: "cat-plug" });
    expect(r.ok && r.target.active).toBe(false);
  });

  it("Gerät leitet die Kategorie ab und verengt das Ziel", async () => {
    deviceMock.mockResolvedValue({
      userId: "u1", name: "njoy", archivedAt: null,
      category: { id: "cat-plug", name: "Plug", isBuiltIn: false },
    });
    const r = await resolveInspectionTarget("u1", { deviceId: "plug-1" });
    expect(r.ok && r.target).toMatchObject({ categoryId: "cat-plug", deviceId: "plug-1", deviceName: "njoy" });
  });

  it("ein KG-Gerät bleibt KG-Ziel (categoryId null), verengt aber aufs Gerät", async () => {
    deviceMock.mockResolvedValue({
      userId: "u1", name: "Stahl", archivedAt: null,
      category: { id: "cat-kg", name: "KG", isBuiltIn: true },
    });
    const r = await resolveInspectionTarget("u1", { deviceId: "kg-1" });
    expect(r.ok && r.target.categoryId).toBeNull();
    expect(r.ok && r.target.deviceId).toBe("kg-1");
  });
});

describe("resolveInspectionTarget — fremde/ungültige Ziele", () => {
  it("Gerät eines anderen Subs: INSPECTION_TARGET_INVALID", async () => {
    deviceMock.mockResolvedValue({ userId: "u2", name: "fremd", archivedAt: null, category: null });
    const r = await resolveInspectionTarget("u1", { deviceId: "d-fremd" });
    expect(r.ok).toBe(false);
  });

  it("archiviertes Gerät: INSPECTION_TARGET_INVALID — es ist nicht mehr im Einsatz", async () => {
    deviceMock.mockResolvedValue({
      userId: "u1", name: "alt", archivedAt: new Date(),
      category: { id: "cat-plug", name: "Plug", isBuiltIn: false },
    });
    const r = await resolveInspectionTarget("u1", { deviceId: "d-alt" });
    expect(r.ok).toBe(false);
  });

  it("unbekannte Kategorie: INSPECTION_TARGET_INVALID", async () => {
    categoryMock.mockResolvedValue(null);
    const r = await resolveInspectionTarget("u1", { categoryId: "gibtsnicht" });
    expect(r.ok).toBe(false);
  });
});

describe("inspectionTargetWhere — welches Foto erfüllt welche Kontrolle", () => {
  const kg = { categoryId: null };
  const plug = { categoryId: "cat-plug" };

  it("filtert auf die Kategorie des Ziels: ein Plug-Foto sucht keine KG-Anforderung", () => {
    expect(inspectionTargetWhere(kg, null).categoryId).toBeNull();
    expect(inspectionTargetWhere(plug, "plug-1").categoryId).toBe("cat-plug");
  });

  it("ohne gepinntes Gerät erfüllt jedes Gerät der Kategorie — die Anforderung selbst hat keines", () => {
    // `deviceId: null` an der ANFORDERUNG heisst „egal welches"; das eingereichte Gerät steht
    // trotzdem im OR, damit eine gepinnte Anforderung auf dasselbe Gerät ebenfalls trifft.
    expect(inspectionTargetWhere(plug, "plug-2").AND).toEqual([
      { OR: [{ deviceId: null }, { deviceId: "plug-2" }] },
    ]);
  });

  it("als AND genestet, damit ein OR des Aufrufers (aktiveKontrolleWhere) daneben bestehen bleibt", () => {
    // Beides direkt auf oberster Ebene würde sich gegenseitig überschreiben — die Sichtbarkeits-
    // Bedingung fiele still weg, und ein Foto könnte eine noch gar nicht ausgelöste Kontrolle erfüllen.
    const where = { ...inspectionTargetWhere(plug, "plug-1"), OR: [{ wirksamAb: null }] };
    expect(where.AND).toHaveLength(1);
    expect(where.OR).toEqual([{ wirksamAb: null }]);
  });
});
