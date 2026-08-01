import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", async () => {
  const { createPrismaMock } = await import("@/test/prismaMock");
  return { prisma: createPrismaMock() };
});

vi.mock("@/lib/imageUtils", () => ({
  loadUploadedImage: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(),
}));

import { loadMcpImage } from "./entryImage";
import { loadUploadedImage } from "@/lib/imageUtils";
import { checkRateLimit } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";
import { type PrismaMock } from "@/test/prismaMock";

const db = prisma as unknown as PrismaMock;
const load = loadUploadedImage as unknown as ReturnType<typeof vi.fn>;
const rateLimit = checkRateLimit as unknown as ReturnType<typeof vi.fn>;

const entry = (over: Record<string, unknown> = {}) => ({
  type: "PRUEFUNG",
  startTime: new Date("2026-08-01T18:59:00Z"),
  imageUrl: "/api/uploads/a.jpg",
  boxImageUrl: null,
  imageExifTime: new Date("2026-08-01T18:57:00Z"),
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  db.user.findUnique.mockResolvedValue({ id: "u1", username: "sub", timezone: "Europe/Zurich" });
  load.mockResolvedValue({ base64: "AAAA", mediaType: "image/jpeg" });
  rateLimit.mockResolvedValue({ limited: false });
});

describe("loadMcpImage — Adressierung", () => {
  it("liefert das Haupt-Foto samt Bildunterschrift", async () => {
    db.entry.findFirst.mockResolvedValue(entry());
    const img = await loadMcpImage("sub", { source: "entry", entryId: "e1" });

    expect(img.base64).toBe("AAAA");
    expect(img.mediaType).toBe("image/jpeg");
    expect(img.caption).toContain("PRUEFUNG");
  });

  it("liefert das Box-Foto, wenn danach gefragt wird", async () => {
    db.entry.findFirst.mockResolvedValue(entry({ boxImageUrl: "/api/uploads/box.jpg" }));
    const img = await loadMcpImage("sub", { source: "box", entryId: "e1" });

    expect(load).toHaveBeenCalledWith("/api/uploads/box.jpg", expect.anything());
    expect(img.caption).toContain("Key-box");
  });

  it("holt den Nachweis über taskId + 1-basierten Index — dieselbe Adresse wie review_task_proof", async () => {
    db.task.findFirst.mockResolvedValue({
      id: "t1", title: "Staubsaugen", withdrawnAt: null,
      proofs: [
        { description: "Vorher", imageUrl: "/api/uploads/v.jpg", imageExifTime: null },
        { description: "Nachher", imageUrl: "/api/uploads/n.jpg", imageExifTime: null },
      ],
    });
    const img = await loadMcpImage("sub", { source: "task_proof", taskId: "t1", proofIndex: 2 });

    expect(load).toHaveBeenCalledWith("/api/uploads/n.jpg", expect.anything());
    expect(img.caption).toContain("Nachher");
  });
});

describe("loadMcpImage — Eigentum und Grenzen", () => {
  it("filtert JEDE Abfrage auf die aufgelöste userId", async () => {
    db.entry.findFirst.mockResolvedValue(entry());
    await loadMcpImage("sub", { source: "entry", entryId: "e1" });

    expect(db.entry.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "e1", userId: "u1" } }),
    );
  });

  it("ein fremder Eintrag löst nicht auf", async () => {
    db.entry.findFirst.mockResolvedValue(null);
    await expect(loadMcpImage("sub", { source: "entry", entryId: "fremd" })).rejects.toThrow("Entry not found");
  });

  it("verlangt die passende Adresse zur Quelle", async () => {
    await expect(loadMcpImage("sub", { source: "entry" })).rejects.toThrow("requires entryId");
    await expect(loadMcpImage("sub", { source: "task_proof", taskId: "t1" })).rejects.toThrow("requires taskId and proofIndex");
  });

  it("unterscheidet ein fehlendes Foto von einem noch nicht eingereichten Nachweis", async () => {
    db.entry.findFirst.mockResolvedValue(entry({ imageUrl: null }));
    await expect(loadMcpImage("sub", { source: "entry", entryId: "e1" })).rejects.toThrow("has no photo");

    db.task.findFirst.mockResolvedValue({ id: "t1", title: "T", withdrawnAt: null, proofs: [{ description: "d", imageUrl: null, imageExifTime: null }] });
    await expect(loadMcpImage("sub", { source: "task_proof", taskId: "t1", proofIndex: 1 })).rejects.toThrow("not been submitted");
  });

  it("meldet einen Index ausserhalb der Liste mit der tatsächlichen Anzahl", async () => {
    db.task.findFirst.mockResolvedValue({ id: "t1", title: "T", withdrawnAt: null, proofs: [{ description: "d", imageUrl: "/api/uploads/a.jpg", imageExifTime: null }] });
    await expect(loadMcpImage("sub", { source: "task_proof", taskId: "t1", proofIndex: 5 }))
      .rejects.toThrow("has 1 proof(s); index 5 does not exist");
  });

  it("eine unlesbare Datei ist ein Fehler, kein leeres Bild", async () => {
    db.entry.findFirst.mockResolvedValue(entry());
    load.mockResolvedValue(null);
    await expect(loadMcpImage("sub", { source: "entry", entryId: "e1" })).rejects.toThrow("could not be read");
  });
});

describe("loadMcpImage — der Bildersafe bleibt versiegelt", () => {
  it("fragt codeImageUrl gar nicht erst ab", async () => {
    db.entry.findFirst.mockResolvedValue(entry());
    await loadMcpImage("sub", { source: "entry", entryId: "e1" });

    // Das versiegelte Code-Foto darf nicht einmal selektiert werden — was nicht geladen wird, kann
    // auch nicht versehentlich ausgeliefert werden.
    const select = db.entry.findFirst.mock.calls[0][0].select as Record<string, unknown>;
    expect(select).not.toHaveProperty("codeImageUrl");
  });

  it("kennt keine Quelle, die zum Bildersafe führt", async () => {
    // @ts-expect-error — "code" ist bewusst kein McpImageSource. Der Test hält fest, dass eine
    // unbekannte Quelle scheitert, statt stillschweigend auf das Haupt-Foto zu fallen.
    await expect(loadMcpImage("sub", { source: "code", entryId: "e1" })).rejects.toThrow("Unknown source");
  });
});

describe("loadMcpImage — auf Abruf, nicht im Strom", () => {
  it("bremst über dieselbe Schicht wie die anderen Bild-Routen", async () => {
    db.entry.findFirst.mockResolvedValue(entry());
    await loadMcpImage("sub", { source: "entry", entryId: "e1" });

    expect(rateLimit).toHaveBeenCalledWith("mcp-image:u1", expect.any(Number), 60_000);
  });

  it("lädt gar nichts erst, wenn das Limit greift", async () => {
    rateLimit.mockResolvedValue({ limited: true, retryAfter: 42 });
    db.entry.findFirst.mockResolvedValue(entry());

    await expect(loadMcpImage("sub", { source: "entry", entryId: "e1" })).rejects.toThrow("wait 42s");
    expect(load).not.toHaveBeenCalled();
    expect(db.entry.findFirst).not.toHaveBeenCalled();
  });
});
