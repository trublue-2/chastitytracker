import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", async () => {
  const { createPrismaMock } = await import("@/test/prismaMock");
  return { prisma: createPrismaMock() };
});
vi.mock("@/lib/keyholder", () => ({ isKeyholderOf: vi.fn(async () => false) }));
vi.mock("@/lib/queries", () => ({ isCodePhotoRevealed: vi.fn(async () => false) }));

import { prisma } from "@/lib/prisma";
import { isKeyholderOf } from "@/lib/keyholder";
import { isCodePhotoRevealed } from "@/lib/queries";
import { uploadAnalyzableBy, uploadReferenced, uploadsLinkable, uploadViewableBy } from "./uploadOwnership";
import type { PrismaMock } from "@/test/prismaMock";

const db = prisma as unknown as PrismaMock;
const URL = "/api/uploads/abc.jpg";
const VICTIM = "victim";
const ATTACKER = "attacker";

beforeEach(() => {
  vi.clearAllMocks();
  // `clearAllMocks` behält gesetzte Rückgaben — jede Quelle ausdrücklich zurück auf „nichts".
  db.upload.findUnique.mockReset().mockResolvedValue(null);
  for (const model of ["entry", "device", "deviceReferenceImage", "taskProof", "weightEntry"]) db[model].findMany.mockResolvedValue([]);
  vi.mocked(isKeyholderOf).mockResolvedValue(false);
  vi.mocked(isCodePhotoRevealed).mockResolvedValue(false);
});

describe("uploadsLinkable — wer darf eine Datei in eine Zeile hängen", () => {
  it("der Hochlader", async () => {
    db.upload.findUnique.mockResolvedValue({ uploaderId: VICTIM });
    expect(await uploadsLinkable([URL], [VICTIM])).toBe(true);
  });

  it("NICHT, wer nur den Dateinamen kennt — der Angriff, den es bis 6.6.0 gab", async () => {
    db.upload.findUnique.mockResolvedValue({ uploaderId: VICTIM });
    db.entry.findMany.mockResolvedValue([{ userId: VICTIM, codeImageUrl: null, startTime: new Date() }]);
    expect(await uploadsLinkable([URL], [ATTACKER])).toBe(false);
  });

  it("Bestandsdatei ohne Upload-Zeile: der Träger, an dessen Zeile sie hängt", async () => {
    db.weightEntry.findMany.mockResolvedValue([{ userId: VICTIM }]);
    expect(await uploadsLinkable([URL], [VICTIM])).toBe(true);
    expect(await uploadsLinkable([URL], [ATTACKER])).toBe(false);
  });

  it("die Keyholderin erfasst für ihren Sub: ihr Upload oder seine Datei", async () => {
    db.upload.findUnique.mockResolvedValue({ uploaderId: "keyholder" });
    expect(await uploadsLinkable([URL], ["sub", "keyholder"])).toBe(true);
  });

  it("eine Datei ohne jeden Besitzer lässt sich von niemandem verknüpfen", async () => {
    expect(await uploadsLinkable([URL], [VICTIM])).toBe(false);
  });

  it("kein Bild ist erlaubt; EINE fremde Datei unter mehreren lässt alles scheitern", async () => {
    expect(await uploadsLinkable([null, undefined, ""], [VICTIM])).toBe(true);
    db.upload.findUnique.mockImplementation(async (args: unknown) =>
      (args as { where: { filename: string } }).where.filename === "mine.jpg" ? { uploaderId: VICTIM } : { uploaderId: "other" });
    expect(await uploadsLinkable(["/api/uploads/mine.jpg", "/api/uploads/theirs.jpg"], [VICTIM])).toBe(false);
  });
});

describe("uploadViewableBy / uploadAnalyzableBy", () => {
  it("Besitzer und globaler Admin ja, Fremder nein, Keyholder nur des Besitzers", async () => {
    db.device.findMany.mockResolvedValue([{ userId: VICTIM }]);
    expect((await uploadViewableBy(URL, { id: VICTIM })).allowed).toBe(true);
    expect((await uploadViewableBy(URL, { id: "root", role: "admin" })).allowed).toBe(true);
    expect((await uploadViewableBy(URL, { id: ATTACKER })).allowed).toBe(false);
    vi.mocked(isKeyholderOf).mockResolvedValue(true);
    expect((await uploadViewableBy(URL, { id: "kh" })).allowed).toBe(true);
    expect(isKeyholderOf).toHaveBeenLastCalledWith("kh", VICTIM);
  });

  it("das eigene, noch versiegelte Code-Foto wird nicht ausgewertet — die Erkennung gäbe die Ziffern zurück", async () => {
    db.entry.findMany.mockResolvedValue([{ userId: VICTIM, codeImageUrl: URL, startTime: new Date() }]);
    expect(await uploadAnalyzableBy(URL, { id: VICTIM })).toBe(false);
    vi.mocked(isCodePhotoRevealed).mockResolvedValue(true);
    expect(await uploadAnalyzableBy(URL, { id: VICTIM })).toBe(true);
  });
});

describe("uploadReferenced — vor dem Löschen von der Platte", () => {
  it("meldet, ob noch eine Zeile auf die Datei verweist", async () => {
    expect(await uploadReferenced(URL)).toBe(false);
    db.taskProof.findMany.mockResolvedValue([{ task: { userId: VICTIM } }]);
    expect(await uploadReferenced(URL)).toBe(true);
  });
});
