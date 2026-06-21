import { describe, it, expect, vi, beforeEach } from "vitest";

// prisma komplett mocken; echte Vektor-Mathematik aus embed.ts behalten, nur I/O mocken.
vi.mock("@/lib/prisma", () => ({
  prisma: { device: { findMany: vi.fn() }, deviceReferenceImage: { update: vi.fn() } },
}));
vi.mock("@/lib/embed", async (importActual) => {
  const actual = await importActual<typeof import("./embed")>();
  return { ...actual, embedAvailable: vi.fn(() => true), embedModel: vi.fn(() => "test-model"), embedImages: vi.fn() };
});

import { detectDeviceByEmbedding } from "./deviceEmbedding";
import { prisma } from "@/lib/prisma";
import { embedAvailable, embedImages, vectorToBytes } from "@/lib/embed";

const findMany = prisma.device.findMany as unknown as ReturnType<typeof vi.fn>;
const updateRef = prisma.deviceReferenceImage.update as unknown as ReturnType<typeof vi.fn>;
const availableMock = embedAvailable as unknown as ReturnType<typeof vi.fn>;
const embedMock = embedImages as unknown as ReturnType<typeof vi.fn>;

type RefRow = { id: string; imageUrl: string; embedding: Buffer | null; embeddingModel: string | null };
const vec = (...xs: number[]) => Float32Array.from(xs);
/** Referenzbild mit bereits gespeichertem Embedding (Modell "test-model"). */
const ref = (id: string, v: Float32Array): RefRow => ({ id, imageUrl: `/u/${id}.jpg`, embedding: vectorToBytes(v), embeddingModel: "test-model" });
const device = (id: string, name: string, refs: RefRow[]) => ({ id, name, referenceImages: refs });

beforeEach(() => {
  findMany.mockReset();
  updateRef.mockReset().mockResolvedValue({});
  availableMock.mockReset().mockReturnValue(true);
  embedMock.mockReset();
});

describe("detectDeviceByEmbedding", () => {
  it("returns null when no embed service is configured", async () => {
    availableMock.mockReturnValue(false);
    expect(await detectDeviceByEmbedding("/u/q.jpg", "user1")).toBeNull();
    expect(findMany).not.toHaveBeenCalled();
  });

  it("returns null when no device has reference images", async () => {
    findMany.mockResolvedValue([device("a", "A", []), device("b", "B", [])]);
    expect(await detectDeviceByEmbedding("/u/q.jpg", "user1")).toBeNull();
  });

  it("short-circuits ONLY when exactly one device exists (no query embedding needed)", async () => {
    findMany.mockResolvedValue([device("a", "A", [ref("a1", vec(1, 0))])]);
    const r = await detectDeviceByEmbedding("/u/q.jpg", "user1");
    expect(r).toEqual({ deviceId: "a", deviceName: "A" });
    expect(embedMock).not.toHaveBeenCalled(); // kein blindes Einbetten
  });

  it("does NOT short-circuit when a second device exists without refs — it embeds the query", async () => {
    // Regression (Review-Fix): früher gab withRefs.length===1 hier blind „A" zurück.
    findMany.mockResolvedValue([device("a", "A", [ref("a1", vec(1, 0))]), device("b", "B", [])]);
    embedMock.mockResolvedValue([vec(1, 0)]); // Query-Embedding
    const r = await detectDeviceByEmbedding("/u/q.jpg", "user1");
    expect(embedMock).toHaveBeenCalledWith(["/u/q.jpg"]); // Query WURDE eingebettet
    expect(r).toEqual({ deviceId: "a", deviceName: "A" });
  });

  it("picks the nearest device when the margin is clear", async () => {
    findMany.mockResolvedValue([
      device("a", "A", [ref("a1", vec(1, 0))]),
      device("b", "B", [ref("b1", vec(0, 1))]),
    ]);
    embedMock.mockResolvedValue([vec(1, 0)]); // nahe A
    expect(await detectDeviceByEmbedding("/u/q.jpg", "user1")).toEqual({ deviceId: "a", deviceName: "A" });
  });

  it("returns null when two devices are too close (below the margin)", async () => {
    findMany.mockResolvedValue([
      device("a", "A", [ref("a1", vec(1, 0))]),
      device("b", "B", [ref("b1", vec(0.999, 0.0447))]),
    ]);
    embedMock.mockResolvedValue([vec(1, 0)]); // cosA=1.0, cosB≈0.999 → margin≈0.001 < 0.01
    expect(await detectDeviceByEmbedding("/u/q.jpg", "user1")).toBeNull();
  });

  it("lazily computes + persists a missing reference embedding, then scores with it", async () => {
    findMany.mockResolvedValue([
      device("a", "A", [{ id: "a1", imageUrl: "/u/a1.jpg", embedding: null, embeddingModel: null }]),
      device("b", "B", [ref("b1", vec(0, 1))]),
    ]);
    embedMock
      .mockResolvedValueOnce([vec(1, 0)])  // Lazy: A's fehlendes Referenz-Embedding
      .mockResolvedValueOnce([vec(1, 0)]); // Query
    const r = await detectDeviceByEmbedding("/u/q.jpg", "user1");
    expect(updateRef).toHaveBeenCalledTimes(1); // Embedding wurde persistiert
    expect(updateRef.mock.calls[0][0].where).toEqual({ id: "a1" });
    expect(r).toEqual({ deviceId: "a", deviceName: "A" });
  });

  it("returns null when the query image cannot be embedded", async () => {
    findMany.mockResolvedValue([
      device("a", "A", [ref("a1", vec(1, 0))]),
      device("b", "B", [ref("b1", vec(0, 1))]),
    ]);
    embedMock.mockResolvedValue([null]); // Query-Embedding fehlgeschlagen
    expect(await detectDeviceByEmbedding("/u/q.jpg", "user1")).toBeNull();
  });
});
