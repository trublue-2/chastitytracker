import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => {
  const tx = {
    user: { findUnique: vi.fn() },
    weightEntry: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  };
  return {
    prisma: {
      ...tx,
      $transaction: vi.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
      __tx: tx,
    },
  };
});

vi.mock("@/lib/weightReleaseService", () => ({ applyWeightRelease: vi.fn().mockResolvedValue(null) }));

import { recordWeight, updateWeightEntry } from "./weightService";
import { applyWeightRelease } from "@/lib/weightReleaseService";
import { prisma } from "@/lib/prisma";

const tx = (prisma as unknown as { __tx: {
  user: { findUnique: ReturnType<typeof vi.fn> };
  weightEntry: {
    findUnique: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>; updateMany: ReturnType<typeof vi.fn>;
  };
} }).__tx;

const NOW = new Date("2026-08-22T09:00:00Z");

/** Ein Träger mit eingeschaltetem Tracking; Zeitzone und Fenster je Test. */
function user(over: Partial<{ weightTrackingEnabled: boolean; timezone: string; weighingWindows: string | null }> = {}) {
  tx.user.findUnique.mockResolvedValue({
    weightTrackingEnabled: true, timezone: "Europe/Zurich", weighingWindows: null, ...over,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  tx.weightEntry.findUnique.mockResolvedValue(null);
  tx.weightEntry.create.mockResolvedValue({ id: "w1" });
  tx.weightEntry.update.mockResolvedValue({ id: "w1" });
});

describe("recordWeight", () => {
  it("schreibt den Tagesschlüssel in der Zeitzone DES TRÄGERS", async () => {
    user({ timezone: "Europe/Zurich" });
    // 23:50 Zürich am 22.08. = 21:50 UTC. UTC zählt denselben Tag, aber die Probe ist die Absicht:
    // gewogen wurde an dem Tag, an dem er auf der Waage stand.
    const res = await recordWeight("u1", {
      weightKg: 80, measuredAt: new Date("2026-08-22T21:50:00Z"), source: "keyholder", now: new Date("2026-08-22T22:00:00Z"),
    });
    expect(res.ok && res.data.dayKey).toBe("2026-08-22");
  });

  it("zählt kurz nach Mitternacht Ortszeit schon den neuen Tag", async () => {
    user({ timezone: "Europe/Zurich" });
    // 00:30 Zürich am 23.08. = 22:30 UTC am 22.08. — UTC läge noch beim Vortag.
    const res = await recordWeight("u1", {
      weightKg: 80, measuredAt: new Date("2026-08-22T22:30:00Z"), source: "keyholder", now: new Date("2026-08-22T23:00:00Z"),
    });
    expect(res.ok && res.data.dayKey).toBe("2026-08-23");
  });

  it("markiert einen Wert ausserhalb des Fensters, nimmt ihn aber an", async () => {
    user({ weighingWindows: JSON.stringify([{ start: "06:00", end: "08:00" }]) });
    // 11:00 Zürich — ausserhalb.
    const res = await recordWeight("u1", {
      weightKg: 80, measuredAt: new Date("2026-08-22T09:00:00Z"), source: "keyholder", now: NOW,
    });
    expect(res.ok).toBe(true);
    expect(res.ok && res.data.inWindow).toBe(false);
    expect(tx.weightEntry.create).toHaveBeenCalled();
  });

  it("ist ohne Fenster immer im Fenster", async () => {
    user({ weighingWindows: null });
    const res = await recordWeight("u1", {
      weightKg: 80, measuredAt: NOW, source: "keyholder", now: NOW,
    });
    expect(res.ok && res.data.inWindow).toBe(true);
  });

  it("ersetzt den Wert desselben Tages, statt eine zweite Zeile anzulegen", async () => {
    user();
    tx.weightEntry.findUnique.mockResolvedValue({ id: "alt" });
    const res = await recordWeight("u1", {
      weightKg: 79.4, measuredAt: NOW, source: "user", imageUrl: "/api/uploads/a.jpg", now: NOW,
    });
    expect(res.ok && res.data.replaced).toBe(true);
    expect(tx.weightEntry.create).not.toHaveBeenCalled();
    // Die Fassung wird hochgezählt — daran hängt die OCC der MCP-Schreibwege.
    expect(tx.weightEntry.update.mock.calls[0][0].data.version).toEqual({ increment: 1 });
  });

  /**
   * Die „wichtigste Regel" der Vorlage (docs/gewicht-freigabe-konzept.md, Abschnitt 6): kein
   * Nachwiegen, um das Ergebnis zu erzwingen. Ohne diese Sperre könnte der Träger so lange wiegen,
   * bis das Mittel unter der Schwelle liegt — und sich die Freigabe damit selbst ausstellen.
   */
  it("prüft die Freigabe-Vorgabe nur bei der ERSTEN Messung des Tages", async () => {
    user();
    await recordWeight("u1", {
      weightKg: 79.4, measuredAt: NOW, source: "user", imageUrl: "/api/uploads/a.jpg", now: NOW,
    });
    expect(applyWeightRelease).toHaveBeenCalledOnce();

    vi.clearAllMocks();
    tx.weightEntry.findUnique.mockResolvedValue({ id: "alt" });
    tx.weightEntry.update.mockResolvedValue({ id: "w1" });
    user();
    await recordWeight("u1", {
      weightKg: 74.0, measuredAt: NOW, source: "user", imageUrl: "/api/uploads/b.jpg", now: NOW,
    });
    expect(applyWeightRelease).not.toHaveBeenCalled();
  });

  it("verlangt vom Träger einen Beleg — Foto ODER Notiz", async () => {
    user();
    const ohne = await recordWeight("u1", { weightKg: 80, measuredAt: NOW, source: "user", now: NOW });
    expect(ohne.ok === false && ohne.error).toBe("WEIGHT_PROOF_REQUIRED");

    const mitNotiz = await recordWeight("u1", {
      weightKg: 80, measuredAt: NOW, source: "user", note: "Waage im Hotel ohne Licht", now: NOW,
    });
    expect(mitNotiz.ok).toBe(true);
  });

  it("verlangt von der Keyholderin und der KI keinen Beleg", async () => {
    user();
    for (const source of ["keyholder", "agent"] as const) {
      const res = await recordWeight("u1", { weightKg: 80, measuredAt: NOW, source, now: NOW });
      expect(res.ok, source).toBe(true);
    }
  });

  it("weist ab, solange die Keyholderin das Tracking nicht freigeschaltet hat", async () => {
    user({ weightTrackingEnabled: false });
    const res = await recordWeight("u1", { weightKg: 80, measuredAt: NOW, source: "keyholder", now: NOW });
    expect(res.ok === false && res.error).toBe("WEIGHT_TRACKING_DISABLED");
    expect(tx.weightEntry.create).not.toHaveBeenCalled();
  });

  it("weist unplausible Gewichte ab, bevor es die Datenbank anfasst", async () => {
    user();
    const res = await recordWeight("u1", { weightKg: 4, measuredAt: NOW, source: "keyholder", now: NOW });
    expect(res.ok === false && res.error).toBe("WEIGHT_OUT_OF_RANGE");
    expect(tx.user.findUnique).not.toHaveBeenCalled();
  });

  it("weist eine Messzeit in der Zukunft ab, lässt der Handy-Uhr aber ein paar Minuten Luft", async () => {
    user();
    const knapp = await recordWeight("u1", {
      weightKg: 80, measuredAt: new Date(NOW.getTime() + 2 * 60_000), source: "keyholder", now: NOW,
    });
    expect(knapp.ok).toBe(true);

    const weit = await recordWeight("u1", {
      weightKg: 80, measuredAt: new Date(NOW.getTime() + 3 * 3_600_000), source: "keyholder", now: NOW,
    });
    expect(weit.ok === false && weit.error).toBe("WEIGHT_IN_FUTURE");
  });

  it("lehnt einen fremden Bild-Pfad ab", async () => {
    user();
    const res = await recordWeight("u1", {
      weightKg: 80, measuredAt: NOW, source: "user", imageUrl: "https://example.com/x.jpg", now: NOW,
    });
    expect(res.ok === false && res.error).toBe("INVALID_IMAGE_URL");
  });
});

/**
 * Die Korrektur ist ein eigener Weg, und der Grund ist der Beleg: `recordWeight` schreibt die Zeile
 * NEU und setzt dabei Foto, EXIF-Zeit und den gelesenen Wert auf null. Beim Nachtragen ist das
 * richtig — bei einer Wertkorrektur verlöre ein Zahlendreher den Nachweis.
 */
describe("updateWeightEntry", () => {
  it("ändert nur, was angegeben wurde — Foto und Erkennung bleiben unberührt", async () => {
    tx.weightEntry.updateMany.mockResolvedValue({ count: 1 });
    const res = await updateWeightEntry("w1", { weightKg: 74.2 });
    expect(res.ok).toBe(true);
    const data = tx.weightEntry.updateMany.mock.calls[0][0].data;
    expect(data).toEqual({ weightKg: 74.2, version: { increment: 1 } });
    expect(data).not.toHaveProperty("imageUrl");
    expect(data).not.toHaveProperty("detectedKg");
    expect(data).not.toHaveProperty("measuredAt");
  });

  it("weist ein unplausibles Gewicht ab, bevor es die Datenbank anfasst", async () => {
    const res = await updateWeightEntry("w1", { weightKg: 4 });
    expect(res.ok === false && res.error).toBe("WEIGHT_OUT_OF_RANGE");
    expect(tx.weightEntry.updateMany).not.toHaveBeenCalled();
  });

  it("eine leere Notiz wird zu null, nicht zu einer leeren Zeichenkette", async () => {
    tx.weightEntry.updateMany.mockResolvedValue({ count: 1 });
    await updateWeightEntry("w1", { note: "   " });
    expect(tx.weightEntry.updateMany.mock.calls[0][0].data.note).toBeNull();
  });

  it("ein leerer Patch tut nichts — und ist trotzdem kein Fehler", async () => {
    const res = await updateWeightEntry("w1", {});
    expect(res.ok).toBe(true);
    expect(tx.weightEntry.updateMany).not.toHaveBeenCalled();
  });

  it("eine inzwischen gelöschte Zeile ist 404, kein 500", async () => {
    tx.weightEntry.updateMany.mockResolvedValue({ count: 0 });
    const res = await updateWeightEntry("weg", { weightKg: 74.2 });
    expect(res.ok === false && res.status).toBe(404);
  });
});
