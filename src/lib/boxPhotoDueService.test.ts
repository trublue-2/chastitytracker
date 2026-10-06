import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Das Box-Foto kommt NACH „Riegel zu": wann es fällig wird (einmal je Verschluss, nie nachträglich für
 * einen alten), wie es nachgereicht und wie es erlassen wird.
 */
vi.mock("@/lib/prisma", async () => {
  const { createPrismaMock } = await import("@/test/prismaMock");
  return { prisma: createPrismaMock() };
});
vi.mock("@/lib/queries", () => ({ getLatestKgEntry: vi.fn() }));
vi.mock("@/lib/verifyCode", () => ({ detectKeyInBox: vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/boxCommandNotify", () => ({ announceBoxPhotoDue: vi.fn() }));

import { markBoxPhotoDue, markBoxPhotoDueIfBoxLocked, submitBoxPhoto, waiveBoxPhoto } from "./boxPhotoDueService";
import { prisma } from "@/lib/prisma";
import { getLatestKgEntry } from "@/lib/queries";
import { detectKeyInBox } from "@/lib/verifyCode";
import { announceBoxPhotoDue } from "@/lib/boxCommandNotify";
import type { PrismaMock } from "@/test/prismaMock";

const db = prisma as unknown as PrismaMock;
const latest = vi.mocked(getLatestKgEntry);
const NOW = new Date("2026-10-06T12:00:00Z");
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000);

type Lock = Awaited<ReturnType<typeof getLatestKgEntry>>;
const lock = (over: Record<string, unknown> = {}) => ({
  id: "e1", type: "VERSCHLUSS", keyInBox: true,
  boxImageUrl: null, boxPhotoDueAt: null, boxPhotoWaivedAt: null, ...over,
}) as unknown as Lock;
const DUE_LOCK = () => lock({ boxPhotoDueAt: minutesAgo(1) });

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  db.entry.updateMany.mockResolvedValue({ count: 1 });
});

describe("markBoxPhotoDue", () => {
  it("stellt das Foto des laufenden Verschlusses fällig und sagt es dem Träger an", async () => {
    latest.mockResolvedValue(lock());
    expect(await markBoxPhotoDue("u1")).toBe(true);
    expect(db.entry.updateMany).toHaveBeenCalledWith({ where: { id: "e1", boxPhotoDueAt: null }, data: { boxPhotoDueAt: NOW } });
    expect(announceBoxPhotoDue).toHaveBeenCalledWith("u1");
  });

  it.each([
    ["Reise: Schlüssel nicht in der Box", { keyInBox: false }],
    ["nichts erklärt", { keyInBox: null }],
    ["Bild schon da", { boxImageUrl: "/api/uploads/x.jpg" }],
    ["schon fällig gestellt — nur EINMAL je Verschluss", { boxPhotoDueAt: minutesAgo(30) }],
    ["kein Verschluss (offen)", { type: "OEFFNEN" }],
  ])("schreibt nichts: %s", async (_name, over) => {
    latest.mockResolvedValue(lock(over));
    expect(await markBoxPhotoDue("u1")).toBe(false);
    expect(db.entry.updateMany).not.toHaveBeenCalled();
    expect(announceBoxPhotoDue).not.toHaveBeenCalled();
  });

  it("schreibt nichts ohne Verschluss", async () => {
    latest.mockResolvedValue(null);
    expect(await markBoxPhotoDue("u1")).toBe(false);
  });

  it("wirft nie — die Box-Eingänge brauchen ihre Antwort in jedem Fall", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    latest.mockRejectedValue(new Error("db down"));
    expect(await markBoxPhotoDue("u1")).toBe(false);
    db.boxStatus.findMany.mockRejectedValue(new Error("db down"));
    expect(await markBoxPhotoDueIfBoxLocked("u1")).toBe(false);
  });

  it("meldet nichts, wenn eine gleichzeitige Meldung schneller war", async () => {
    latest.mockResolvedValue(lock());
    db.entry.updateMany.mockResolvedValue({ count: 0 });
    expect(await markBoxPhotoDue("u1")).toBe(false);
    expect(announceBoxPhotoDue).not.toHaveBeenCalled();
  });
});

describe("markBoxPhotoDueIfBoxLocked", () => {
  it("stellt fällig, wenn die Box den Riegel jetzt schon frisch zu meldet", async () => {
    db.boxStatus.findMany.mockResolvedValue([{ reportedLocked: true, lastSyncAt: minutesAgo(1) }]);
    latest.mockResolvedValue(lock());
    expect(await markBoxPhotoDueIfBoxLocked("u1")).toBe(true);
  });

  it("wartet auf die Meldung, wenn die Box offen steht oder schweigt", async () => {
    latest.mockResolvedValue(lock());
    db.boxStatus.findMany.mockResolvedValue([{ reportedLocked: false, lastSyncAt: minutesAgo(1) }]);
    expect(await markBoxPhotoDueIfBoxLocked("u1")).toBe(false);
    db.boxStatus.findMany.mockResolvedValue([{ reportedLocked: true, lastSyncAt: minutesAgo(120) }]);
    expect(await markBoxPhotoDueIfBoxLocked("u1")).toBe(false);
    expect(db.entry.updateMany).not.toHaveBeenCalled();
  });
});

describe("submitBoxPhoto", () => {
  const URL_OK = "/api/uploads/box-1.jpg";
  beforeEach(() => {
    db.entry.findFirst.mockResolvedValue({ id: "e1" });
    latest.mockResolvedValue(DUE_LOCK());
  });

  it("markiert ein Foto von VOR „Riegel zu\" — angenommen wird es trotzdem", async () => {
    latest.mockResolvedValue(DUE_LOCK());
    db.entry.findFirst.mockResolvedValueOnce({ id: "e1" }).mockResolvedValueOnce(null);
    const taken = minutesAgo(60).toISOString();
    expect(await submitBoxPhoto("u1", "e1", { boxImageUrl: URL_OK, boxImageExifTime: taken })).toMatchObject({ ok: true });
    expect(db.entry.updateMany).toHaveBeenCalledWith({
      where: { id: "e1", userId: "u1", boxImageUrl: null },
      data: { boxImageUrl: URL_OK, boxImageBeforeBolt: true },
    });
  });

  it("markiert ein Foto nach „Riegel zu\" nicht", async () => {
    db.entry.findFirst.mockResolvedValueOnce({ id: "e1" }).mockResolvedValueOnce(null);
    const taken = new Date(NOW.getTime() - 30_000).toISOString();
    await submitBoxPhoto("u1", "e1", { boxImageUrl: URL_OK, boxImageExifTime: taken });
    expect(db.entry.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ boxImageBeforeBolt: false }) }));
  });

  it.each([
    ["fehlt", undefined],
    ["ist Unsinn", "gestern"],
    ["liegt in der Zukunft (Geräteuhr falsch)", new Date(NOW.getTime() + 3_600_000).toISOString()],
  ])("behandelt eine Aufnahmezeit, die %s, als unbekannt — nicht als „davor\"", async (_name, value) => {
    db.entry.findFirst.mockResolvedValueOnce({ id: "e1" }).mockResolvedValueOnce(null);
    await submitBoxPhoto("u1", "e1", { boxImageUrl: URL_OK, boxImageExifTime: value });
    expect(db.entry.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ boxImageBeforeBolt: false }) }));
  });

  it("hängt das Bild an den Verschluss und lässt den Schlüssel server-seitig erkennen", async () => {
    // findFirst: erst Besitz (gefunden), dann Replay-Prüfung (nichts gefunden)
    db.entry.findFirst.mockResolvedValueOnce({ id: "e1" }).mockResolvedValueOnce(null);
    expect(await submitBoxPhoto("u1", "e1", { boxImageUrl: URL_OK, boxImageRotation: 90 })).toEqual({ ok: true, data: { entryId: "e1" } });
    expect(db.entry.updateMany).toHaveBeenCalledWith({
      where: { id: "e1", userId: "u1", boxImageUrl: null },
      data: { boxImageUrl: URL_OK, boxImageBeforeBolt: false },
    });
    await vi.waitFor(() => expect(detectKeyInBox).toHaveBeenCalledWith(URL_OK, 90));
  });

  it("lehnt eine fremde URL ab (SSRF-Hebel) und ein fehlendes Bild", async () => {
    expect(await submitBoxPhoto("u1", "e1", { boxImageUrl: "https://evil.example/x.jpg" })).toMatchObject({ ok: false, error: "INVALID_IMAGE_URL" });
    expect(await submitBoxPhoto("u1", "e1", { boxImageUrl: undefined })).toMatchObject({ ok: false, error: "INVALID_IMAGE_URL" });
  });

  it("lehnt einen fremden oder unbekannten Eintrag ab", async () => {
    db.entry.findFirst.mockResolvedValueOnce(null);
    expect(await submitBoxPhoto("u1", "e1", { boxImageUrl: URL_OK })).toMatchObject({ ok: false, status: 404, error: "NOT_FOUND" });
  });

  it("lehnt ab, wenn nichts fällig ist oder der Eintrag nicht der laufende Verschluss ist", async () => {
    latest.mockResolvedValue(lock());
    expect(await submitBoxPhoto("u1", "e1", { boxImageUrl: URL_OK })).toMatchObject({ ok: false, status: 409, error: "BOX_PHOTO_NOT_DUE" });
    latest.mockResolvedValue(lock({ id: "anderer", boxPhotoDueAt: minutesAgo(1) }));
    expect(await submitBoxPhoto("u1", "e1", { boxImageUrl: URL_OK })).toMatchObject({ ok: false, error: "BOX_PHOTO_NOT_DUE" });
  });

  it("lehnt eine wiederverwendete Aufnahme ab", async () => {
    db.entry.findFirst.mockResolvedValueOnce({ id: "e1" }).mockResolvedValueOnce({ id: "alt" });
    expect(await submitBoxPhoto("u1", "e1", { boxImageUrl: URL_OK })).toMatchObject({ ok: false, error: "BOX_PHOTO_REUSED" });
    expect(db.entry.updateMany).not.toHaveBeenCalled();
  });

  it("überschreibt kein Bild, das ein gleichzeitiger Aufruf schon abgegeben hat", async () => {
    db.entry.findFirst.mockResolvedValueOnce({ id: "e1" }).mockResolvedValueOnce(null);
    db.entry.updateMany.mockResolvedValue({ count: 0 });
    expect(await submitBoxPhoto("u1", "e1", { boxImageUrl: URL_OK })).toMatchObject({ ok: false, error: "BOX_PHOTO_NOT_DUE" });
    expect(detectKeyInBox).not.toHaveBeenCalled();
  });
});

describe("waiveBoxPhoto", () => {
  it("erlässt das fällige Foto, ohne den Verschluss anzufassen", async () => {
    latest.mockResolvedValue(DUE_LOCK());
    expect(await waiveBoxPhoto("u1")).toEqual({ ok: true, data: { entryId: "e1" } });
    expect(db.entry.update).toHaveBeenCalledWith({ where: { id: "e1" }, data: { boxPhotoWaivedAt: NOW } });
  });

  it("lehnt ab, wenn nichts fällig ist", async () => {
    latest.mockResolvedValue(lock());
    expect(await waiveBoxPhoto("u1")).toMatchObject({ ok: false, status: 409, error: "BOX_PHOTO_NOT_DUE" });
    expect(db.entry.update).not.toHaveBeenCalled();
  });
});
