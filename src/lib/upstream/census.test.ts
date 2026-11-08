import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Was eine Instanz beim Update-Check meldet (Issue #15): Image-Herkunft, Nutzung, Funktionen — und
 * dass ein Fehler beim Sammeln den Update-Check nie mitreisst.
 */
vi.mock("@/lib/prisma", async () => {
  const { createPrismaMock } = await import("@/test/prismaMock");
  return { prisma: createPrismaMock() };
});
vi.mock("@/lib/vision/config", () => ({
  currentVisionConfig: vi.fn(async () => ({ provider: "off" })),
  visionSpec: vi.fn(() => ({ external: true })),
}));

import { prisma } from "@/lib/prisma";
import { currentVisionConfig, visionSpec } from "@/lib/vision/config";
import { censusEnabled, censusHeaders, censusInstanceId, clearCensusPublicIdMemo, clearCensusStatsMemo, publicIdentity, collectCensusStats, imageOrigin, imageOriginLabel } from "./census";
import type { PrismaMock } from "@/test/prismaMock";

const db = prisma as unknown as PrismaMock;
const NOW = new Date("2026-10-17T12:00:00Z");
const h = (iso: string) => new Date(iso);
// Ein vollzogener Verschluss trägt `boltConfirmedAt` (`lockPending.ts`) — ohne zählt er nicht.
const kg = (userId: string, type: string, at: string) =>
  ({ userId, type, startTime: h(at), boltConfirmedAt: type === "VERSCHLUSS" ? h(at) : null, openAwaitsBolt: false });

beforeEach(() => {
  vi.clearAllMocks();
  clearCensusStatsMemo();
  clearCensusPublicIdMemo();
  db.appMeta.findUnique.mockResolvedValue({ value: "0123456789abcdef" });
  db.entry.groupBy.mockResolvedValue([]);
  db.adminUserRelationship.groupBy.mockResolvedValue([]);
  db.user.groupBy.mockResolvedValue([]);
  db.boxStatus.groupBy.mockResolvedValue([]);
});

describe("imageOrigin", () => {
  it("erkennt das offizielle Image samt Commit", () => {
    expect(imageOrigin({ IMAGE_SOURCE_REPO: "trublue-2/chastitytracker", IMAGE_REVISION: "7D5E42A4ABCDEF0123" }))
      .toEqual({ origin: "official", revision: "7d5e42a4abcd" });
  });

  it("nennt einen Fork mit Repo-Namen", () => {
    expect(imageOrigin({ IMAGE_SOURCE_REPO: "someone/chastitytracker" }))
      .toEqual({ origin: "fork", repo: "someone/chastitytracker", revision: null });
  });

  it("ohne oder mit unbrauchbarem Wert: selbst gebaut", () => {
    expect(imageOrigin({})).toEqual({ origin: "custom" });
    expect(imageOrigin({ IMAGE_SOURCE_REPO: "kein repo; rm -rf" })).toEqual({ origin: "custom" });
  });

  it("als eine Zeile", () => {
    expect(imageOriginLabel({ origin: "fork", repo: "a/b", revision: null })).toBe("fork:a/b");
    expect(imageOriginLabel({ origin: "custom" })).toBe("custom");
  });
});

describe("censusInstanceId", () => {
  it("ist stabil, 16 Hex-Zeichen und ohne Secret null", () => {
    const id = censusInstanceId("geheim");
    expect(id).toMatch(/^[0-9a-f]{16}$/);
    expect(censusInstanceId("geheim")).toBe(id);
    expect(censusInstanceId("")).toBeNull();
  });
});

describe("publicIdentity", () => {
  it("ist zufällig gespeichert, nicht aus dem Secret abgeleitet — und fehlt bei abgeschaltetem Census", async () => {
    db.appMeta.findUnique.mockResolvedValue(null);
    db.appMeta.upsert.mockImplementation(async ({ create }: { create: { value: string } }) => create);
    const env = { NEXTAUTH_SECRET: "geheim", IMAGE_SOURCE_REPO: "trublue-2/chastitytracker" };
    const id = await publicIdentity(env);
    expect(id.image).toBe("official");
    expect(id.publicId).toMatch(/^[0-9a-f]{16}$/);
    expect(id.publicId).not.toBe(censusInstanceId("geheim"));
    // Einmal erzeugt, danach aus dem Speicher.
    expect((await publicIdentity(env)).publicId).toBe(id.publicId);
    expect(db.appMeta.upsert).toHaveBeenCalledTimes(1);
    expect((await publicIdentity({ ...env, DISABLE_UPDATE_CENSUS: "true" })).publicId).toBeNull();
    expect(censusEnabled({ UPSTREAM_CHANGELOG_URL: "https://x" })).toBe(false);
  });
});

describe("collectCensusStats", () => {
  it("zählt Nutzung, Tragestunden und laufende Verschlüsse exakt", async () => {
    db.user.count.mockResolvedValueOnce(3).mockResolvedValueOnce(1);
    db.entry.groupBy.mockResolvedValueOnce([{ userId: "a" }, { userId: "b" }]).mockResolvedValueOnce([{ userId: "a" }]);
    db.adminUserRelationship.groupBy.mockResolvedValue([{ adminId: "k" }]);
    db.user.groupBy.mockResolvedValue([{ locale: "de", _count: { _all: 2 } }, { locale: "en", _count: { _all: 1 } }]);
    db.boxStatus.groupBy.mockResolvedValue([{ kind: "heimdall", _count: { _all: 1 } }]);
    db.entry.findMany.mockResolvedValue([
      // a: 10 h abgeschlossen
      kg("a", "VERSCHLUSS", "2026-10-16T00:00:00Z"), kg("a", "OEFFNEN", "2026-10-16T10:00:00Z"),
      // b: seit 2 h verschlossen
      kg("b", "VERSCHLUSS", "2026-10-17T10:00:00Z"),
    ]);

    const s = await collectCensusStats(NOW, { PORTAL_SHARED_SECRET: "x", ENABLE_MCP: "true", IMAGE_SOURCE_REPO: "trublue-2/chastitytracker" });

    expect(s).toMatchObject({
      v: 1, publicId: "0123456789abcdef", portal: true, image: { origin: "official" },
      users: 3, wearers: 2, active7d: 1, lockedNow: 1, keyholders: 1, wearHours: 12,
      locales: { de: 2, en: 1 },
      features: { boxes: { heimdall: 1 }, vision: "off", mcp: true, telegram: false, weight: 1 },
    });
    expect(db.entry.groupBy.mock.calls[1][0].where.createdAt.gte).toEqual(new Date("2026-10-10T12:00:00Z"));
  });

  it("unterscheidet eigene und externe Foto-Prüfung", async () => {
    vi.mocked(currentVisionConfig).mockResolvedValue({ provider: "ownServer" } as never);
    vi.mocked(visionSpec).mockReturnValue({ external: false } as never);
    expect((await collectCensusStats(NOW, {})).features.vision).toBe("local");
  });
});

describe("censusHeaders", () => {
  it("schickt ohne Nutzlast, wenn das Sammeln scheitert", async () => {
    db.user.count.mockRejectedValue(new Error("db down"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const headers = await censusHeaders("6.4.4");
    expect(headers["X-Instance-Version"]).toBe("6.4.4");
    expect(headers["X-Instance-Stats"]).toBeUndefined();
    spy.mockRestore();
  });

  it("sammelt höchstens einmal am Tag", async () => {
    db.user.count.mockResolvedValue(0);
    await censusHeaders("6.4.4");
    await censusHeaders("6.4.4");
    expect(db.user.count).toHaveBeenCalledTimes(2); // ein Lauf = zwei count-Abfragen
  });
});
