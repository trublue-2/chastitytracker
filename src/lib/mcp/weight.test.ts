import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: vi.fn() }, weightEntry: { findUnique: vi.fn(), findMany: vi.fn() } },
}));

import { logWeightDef, setWeightLimitsDef } from "./weight";
import { prisma } from "@/lib/prisma";

const userMock = prisma.user.findUnique as unknown as ReturnType<typeof vi.fn>;
const CTX = { targetUserId: "u1" } as never;

/** Der Träger hat sich „höchstens 84" gesetzt — das Beispiel aus der Skizze des Nutzers. */
function wearer(over: Record<string, unknown> = {}) {
  userMock.mockResolvedValue({
    weightTrackingEnabled: true, timezone: "Europe/Zurich", weighingWindows: null,
    targetMinKg: null, targetMaxKg: 84, targetMinKeyholderKg: null, targetMaxKeyholderKg: null,
    ...over,
  });
}

beforeEach(() => vi.clearAllMocks());

describe("set_weight_limits — die Nur-Weiten-Regel gilt auch für die KI", () => {
  it("verlangt überhaupt eine Änderung", () => {
    expect(() => setWeightLimitsDef.validate?.({})).toThrow(/Nothing to change/);
  });

  it("lässt die weitere Obergrenze zu (84 → 87)", async () => {
    wearer();
    const preview = await setWeightLimitsDef.preview(CTX, { maxKg: 87 });
    expect(preview.after).toEqual({ minKg: null, maxKg: 87 });
  });

  it("weist die engere Obergrenze ab (84 → 80) — mit einem Satz, den ein Agent versteht", async () => {
    wearer();
    // Kein Fehler-Code: die KI sieht keinen Namensraum, in dem sie ihn nachschlagen könnte.
    await expect(setWeightLimitsDef.preview(CTX, { maxKg: 80 })).rejects.toThrow(/only WIDEN/);
  });

  it("nennt in der Ablehnung den Bestand, damit die KI weiss, was gilt", async () => {
    wearer();
    await expect(setWeightLimitsDef.preview(CTX, { maxKg: 80 })).rejects.toThrow(/84/);
  });

  it("weist eine Grenze ab, wo der Träger gar keine gesetzt hat", async () => {
    wearer();
    await expect(setWeightLimitsDef.preview(CTX, { minKg: 70 })).rejects.toThrow(/only WIDEN/);
  });

  it("lässt die Rücknahme der eigenen Nachbesserung zu", async () => {
    wearer({ targetMaxKeyholderKg: 87 });
    const preview = await setWeightLimitsDef.preview(CTX, { maxKg: null });
    expect(preview.after).toEqual({ minKg: null, maxKg: null });
  });

  it("weist ab, solange das Tracking nicht freigeschaltet ist", async () => {
    wearer({ weightTrackingEnabled: false });
    await expect(setWeightLimitsDef.preview(CTX, { maxKg: 87 })).rejects.toThrow(/not enabled/);
  });
});

describe("log_weight", () => {
  it("weist ein unplausibles Gewicht schon im Dry-Run ab", () => {
    expect(() => logWeightDef.validate?.({ weightKg: 4 })).toThrow(/Implausible weight/);
    expect(() => logWeightDef.validate?.({ weightKg: 79.4 })).not.toThrow();
  });

  it("nennt in der Vorschau, ob ein bestehender Tageswert ersetzt würde", async () => {
    wearer();
    (prisma.weightEntry.findUnique as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ weightKg: 80 });
    const preview = await logWeightDef.preview(CTX, { weightKg: 79.4, measuredAt: "2026-08-22T07:00:00Z" });
    expect((preview.preview as { action: string; replaces: number }).action).toBe("replace");
    expect((preview.preview as { replaces: number }).replaces).toBe(80);
  });

  it("weist eine unlesbare Messzeit ab, statt sie zu erraten", async () => {
    wearer();
    await expect(logWeightDef.preview(CTX, { weightKg: 79.4, measuredAt: "gestern" }))
      .rejects.toThrow(/not a valid timestamp/);
  });
});
