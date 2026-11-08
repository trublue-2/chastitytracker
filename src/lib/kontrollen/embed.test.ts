import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { vectorToBytes, bytesToVector, cosine, embedAvailable, embedModel, embedImages } from "./embed";

vi.mock("@/lib/imageUtils", () => ({ loadUploadedImage: vi.fn() }));
import { loadUploadedImage } from "@/lib/imageUtils";
const loadMock = loadUploadedImage as unknown as ReturnType<typeof vi.fn>;

describe("vectorToBytes / bytesToVector", () => {
  it("roundtrips a vector exactly", () => {
    const v = Float32Array.from([0.5, -0.25, 1, 0, -1]);
    const back = bytesToVector(vectorToBytes(v));
    expect(Array.from(back)).toEqual(Array.from(v));
  });

  it("copies the bytes — a later mutation of a SUBARRAY view must not corrupt the stored buffer", () => {
    // Regression: vectorToBytes darf keinen View auf v.buffer zurückgeben.
    const big = Float32Array.from([9, 9, 0.5, -0.25, 1, 9, 9]);
    const view = big.subarray(2, 5); // byteOffset > 0, eigener Bereich [0.5,-0.25,1]
    const bytes = vectorToBytes(view);
    big.fill(0); // Quelle nachträglich überschreiben
    expect(Array.from(bytesToVector(bytes))).toEqual([0.5, -0.25, 1]);
  });

  it("returns an empty vector for a corrupt blob (length not a multiple of 4)", () => {
    expect(bytesToVector(new Uint8Array(5)).length).toBe(0);
    expect(bytesToVector(new Uint8Array(0)).length).toBe(0);
  });

  it("bytesToVector is offset-safe for Buffer views (non-zero byteOffset)", () => {
    const v = Float32Array.from([1, 2, 3]);
    const raw = Buffer.from(vectorToBytes(v));
    const padded = Buffer.concat([Buffer.from([0, 0, 0, 0]), raw]);
    const view = padded.subarray(4); // byteOffset 4 in den gepufferten Bytes
    expect(Array.from(bytesToVector(view))).toEqual([1, 2, 3]);
  });
});

describe("cosine", () => {
  it("equals the dot product for normalized vectors", () => {
    expect(cosine(Float32Array.from([1, 0]), Float32Array.from([1, 0]))).toBeCloseTo(1);
    expect(cosine(Float32Array.from([1, 0]), Float32Array.from([0, 1]))).toBeCloseTo(0);
    expect(cosine(Float32Array.from([1, 0]), Float32Array.from([-1, 0]))).toBeCloseTo(-1);
  });

  it("uses the shorter length on dimension mismatch (no throw)", () => {
    expect(cosine(Float32Array.from([1, 0, 5]), Float32Array.from([1, 0]))).toBeCloseTo(1);
    expect(cosine(Float32Array.from([]), Float32Array.from([1, 2]))).toBe(0);
  });
});

describe("embedAvailable / embedModel", () => {
  const origUrl = process.env.EMBED_BASE_URL;
  const origModel = process.env.EMBED_MODEL;
  afterEach(() => {
    if (origUrl === undefined) delete process.env.EMBED_BASE_URL; else process.env.EMBED_BASE_URL = origUrl;
    if (origModel === undefined) delete process.env.EMBED_MODEL; else process.env.EMBED_MODEL = origModel;
  });

  it("embedAvailable reflects EMBED_BASE_URL presence", () => {
    delete process.env.EMBED_BASE_URL;
    expect(embedAvailable()).toBe(false);
    process.env.EMBED_BASE_URL = "http://mac:11435";
    expect(embedAvailable()).toBe(true);
  });

  it("embedModel defaults to clip-ViT-L-14, overridable", () => {
    delete process.env.EMBED_MODEL;
    expect(embedModel()).toBe("clip-ViT-L-14");
    process.env.EMBED_MODEL = "clip-ViT-B-32";
    expect(embedModel()).toBe("clip-ViT-B-32");
  });
});

describe("embedImages", () => {
  const origUrl = process.env.EMBED_BASE_URL;
  beforeEach(() => { loadMock.mockReset(); });
  afterEach(() => {
    if (origUrl === undefined) delete process.env.EMBED_BASE_URL; else process.env.EMBED_BASE_URL = origUrl;
    vi.unstubAllGlobals();
  });

  it("returns null when no service is configured", async () => {
    delete process.env.EMBED_BASE_URL;
    expect(await embedImages(["/u/a.jpg"])).toBeNull();
  });

  it("returns [] for empty input", async () => {
    process.env.EMBED_BASE_URL = "http://mac:11435";
    expect(await embedImages([])).toEqual([]);
  });

  it("aligns results to input, with null for images that fail to load", async () => {
    process.env.EMBED_BASE_URL = "http://mac:11435";
    // url[0] lädt, url[1] nicht → nur eines wird eingebettet, Ergebnis bleibt ausgerichtet.
    loadMock.mockImplementation(async (u: string) => (u.includes("good") ? { base64: "B64", mediaType: "image/jpeg" } : null));
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ embeddings: [[0.1, 0.2]] }) });
    vi.stubGlobal("fetch", fetchMock);

    const out = await embedImages(["/u/good.jpg", "/u/bad.jpg"]);
    expect(out).not.toBeNull();
    expect(out!.length).toBe(2);
    expect(Array.from(out![0]!)).toEqual([Math.fround(0.1), Math.fround(0.2)]);
    expect(out![1]).toBeNull();
    // nur das geladene Bild wurde gesendet
    const body = JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body);
    expect(body.images).toEqual(["B64"]);
  });

  it("returns null on a non-ok response", async () => {
    process.env.EMBED_BASE_URL = "http://mac:11435";
    loadMock.mockResolvedValue({ base64: "B64", mediaType: "image/jpeg" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    expect(await embedImages(["/u/a.jpg"])).toBeNull();
  });

  it("returns null when the response count doesn't match the request", async () => {
    process.env.EMBED_BASE_URL = "http://mac:11435";
    loadMock.mockResolvedValue({ base64: "B64", mediaType: "image/jpeg" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ embeddings: [] }) }));
    expect(await embedImages(["/u/a.jpg"])).toBeNull();
  });

  it("returns all-null (not null) when every image fails to load", async () => {
    process.env.EMBED_BASE_URL = "http://mac:11435";
    loadMock.mockResolvedValue(null);
    const out = await embedImages(["/u/a.jpg", "/u/b.jpg"]);
    expect(out).toEqual([null, null]);
  });
});
