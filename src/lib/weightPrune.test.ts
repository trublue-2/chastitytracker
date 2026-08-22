import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    weightEntry: { findMany: vi.fn(), updateMany: vi.fn() },
  },
}));
vi.mock("@/lib/imageUtils", () => ({ deleteUploadedFiles: vi.fn() }));

import { pruneWeightPhotos, weightPhotoRetentionDays } from "./weightService";
import { prisma } from "@/lib/prisma";
import { deleteUploadedFiles } from "@/lib/imageUtils";

const findMany = prisma.weightEntry.findMany as unknown as ReturnType<typeof vi.fn>;
const updateMany = prisma.weightEntry.updateMany as unknown as ReturnType<typeof vi.fn>;
const deleteFiles = deleteUploadedFiles as unknown as ReturnType<typeof vi.fn>;

const NOW = new Date("2026-08-22T12:00:00Z");

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.WEIGHT_PHOTO_RETENTION_DAYS;
  findMany.mockResolvedValue([]);
  updateMany.mockResolvedValue({ count: 0 });
});

describe("weightPhotoRetentionDays", () => {
  it("hat eine Vorgabe und nimmt eine gesetzte Zahl", () => {
    expect(weightPhotoRetentionDays()).toBe(60);
    process.env.WEIGHT_PHOTO_RETENTION_DAYS = "30";
    expect(weightPhotoRetentionDays()).toBe(30);
  });

  it("fällt bei Unsinn auf die Vorgabe zurück, statt einen ungültigen Stichtag zu bauen", () => {
    process.env.WEIGHT_PHOTO_RETENTION_DAYS = "bald";
    expect(weightPhotoRetentionDays()).toBe(60);
  });
});

describe("pruneWeightPhotos", () => {
  it("schaltet sich mit 0 ganz ab — ohne die Datenbank zu fragen", async () => {
    process.env.WEIGHT_PHOTO_RETENTION_DAYS = "0";
    expect(await pruneWeightPhotos(NOW)).toBe(0);
    expect(findMany).not.toHaveBeenCalled();
  });

  it("sucht nur abgelaufene Zeilen, die überhaupt ein Foto haben", async () => {
    await pruneWeightPhotos(NOW);
    const where = findMany.mock.calls[0][0].where;
    expect(where.imageUrl).toEqual({ not: null });
    expect(where.imagePrunedAt).toBeNull();
    expect(where.measuredAt.lt.toISOString()).toBe("2026-06-23T12:00:00.000Z");
  });

  it("leert die Spalte VOR dem Löschen der Datei", async () => {
    findMany.mockResolvedValue([{ id: "w1", imageUrl: "/api/uploads/a.jpg" }]);
    const reihenfolge: string[] = [];
    updateMany.mockImplementation(async () => { reihenfolge.push("db"); return { count: 1 }; });
    deleteFiles.mockImplementation(async () => { reihenfolge.push("datei"); });

    expect(await pruneWeightPhotos(NOW)).toBe(1);
    // Andersherum zeigte die Oberfläche auf ein Bild, das es nicht mehr gibt.
    expect(reihenfolge).toEqual(["db", "datei"]);
  });

  it("hält fest, DASS ein Foto abgelaufen ist — nicht nur, dass keines da ist", async () => {
    findMany.mockResolvedValue([{ id: "w1", imageUrl: "/api/uploads/a.jpg" }]);
    await pruneWeightPhotos(NOW);
    expect(updateMany.mock.calls[0][0].data).toEqual({ imageUrl: null, imagePrunedAt: NOW });
  });

  it("lässt die Messung selbst unangetastet", async () => {
    findMany.mockResolvedValue([{ id: "w1", imageUrl: "/api/uploads/a.jpg" }]);
    await pruneWeightPhotos(NOW);
    const data = updateMany.mock.calls[0][0].data;
    expect(data).not.toHaveProperty("weightKg");
    expect(data).not.toHaveProperty("measuredAt");
  });
});
