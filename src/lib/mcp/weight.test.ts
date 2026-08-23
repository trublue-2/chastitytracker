import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: vi.fn() }, weightEntry: { findUnique: vi.fn(), findMany: vi.fn() } },
}));

import { logWeightDef, setWeightTargetDef, weightHistory } from "./weight";
import { prisma } from "@/lib/prisma";

const userMock = prisma.user.findUnique as unknown as ReturnType<typeof vi.fn>;
const CTX = { targetUserId: "u1" } as never;

/** Der Träger hat sich 84 kg vorgenommen; die Keyholderin führt (noch) kein eigenes Ziel. */
function wearer(over: Record<string, unknown> = {}) {
  userMock.mockResolvedValue({
    id: "u1", username: "trublue", heightCm: 180,
    weightTrackingEnabled: true, timezone: "Europe/Zurich", weighingWindows: null,
    targetWeightKg: 84, targetWeightSetAt: new Date("2026-08-01T00:00:00Z"),
    targetWeightKeyholderKg: null, targetWeightKeyholderSetAt: null,
    ...over,
  });
}

// Das Feature ist opt-in (Default AUS) — ohne diesen Schalter wirft jeder Schreibweg „not enabled",
// und genau das prüft der letzte Fall dieser Datei ausdrücklich.
const ENV_VORHER = process.env.ENABLE_WEIGHT_TRACKING;
beforeEach(() => {
  vi.clearAllMocks();
  process.env.ENABLE_WEIGHT_TRACKING = "true";
});
afterEach(() => {
  if (ENV_VORHER === undefined) delete process.env.ENABLE_WEIGHT_TRACKING;
  else process.env.ENABLE_WEIGHT_TRACKING = ENV_VORHER;
});

describe("set_weight_target — ihr Ziel gilt, seines bleibt stehen", () => {
  it("verlangt überhaupt eine Änderung", () => {
    expect(() => setWeightTargetDef.validate?.({} as never)).toThrow(/Nothing to change/);
  });

  it("weist ein unplausibles Ziel schon in der Prüfung ab", () => {
    expect(() => setWeightTargetDef.validate?.({ targetKg: 4 })).toThrow(/Implausible target/);
  });

  it("lässt ein STRENGERES Ziel zu als seines — die Nur-Weiten-Regel ist gestrichen", async () => {
    wearer();
    const preview = await setWeightTargetDef.preview(CTX, { targetKg: 78 });
    expect(preview.after).toEqual({ targetKg: 78 });
    expect(preview.preview).toMatchObject({ target: { kg: 78, source: "keyholder" }, subTargetKg: 84 });
  });

  it("überschreibt sein Ziel nicht, sondern stellt seines daneben", async () => {
    wearer();
    const preview = await setWeightTargetDef.preview(CTX, { targetKg: 78 });
    expect(preview.preview).toMatchObject({ subTargetKg: 84 });
  });

  it("warnt in der Vorschau, wenn das Ziel ins Untergewicht führt — und setzt es trotzdem", async () => {
    wearer();
    const preview = await setWeightTargetDef.preview(CTX, { targetKg: 55 });
    expect(preview.preview).toMatchObject({ underweightWarning: true });
  });

  it("gibt bei der Rücknahme wieder sein Ziel als wirksames zurück", async () => {
    wearer({ targetWeightKeyholderKg: 80, targetWeightKeyholderSetAt: new Date("2026-08-02T00:00:00Z") });
    const preview = await setWeightTargetDef.preview(CTX, { targetKg: null });
    expect(preview.preview).toMatchObject({ target: { kg: 84, source: "sub" } });
  });

  it("weist ab, solange die Keyholderin das Tracking nicht freigeschaltet hat", async () => {
    wearer({ weightTrackingEnabled: false });
    await expect(setWeightTargetDef.preview(CTX, { targetKg: 80 })).rejects.toThrow(/not enabled/);
  });

  it("weist ab, wenn die INSTANZ das Feature gar nicht führt", async () => {
    // Der zweite Schalter, unabhängig vom ersten: der Träger wäre freigeschaltet, die Instanz nicht.
    wearer();
    delete process.env.ENABLE_WEIGHT_TRACKING;
    await expect(setWeightTargetDef.preview(CTX, { targetKg: 80 })).rejects.toThrow(/not enabled/);
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

describe("weight_history — die Reihe wird per Benutzername gesucht", () => {
  // Der Fehler bis v5.3.3: die Werkzeug-Schicht reicht MCP_USERNAME durch, die Abfrage suchte damit
  // aber in der id-Spalte. Sie fand nie jemanden und meldete `enabled: false` mit leerer Reihe —
  // während das Dashboard dieselben Daten korrekt zeigte. Ein Fehler, der wie ein Datenstand aussieht.
  it("sucht den Träger per username, nicht per id", async () => {
    wearer();
    (prisma.weightEntry.findMany as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const result = await weightHistory("trublue", { days: null });

    expect(userMock.mock.calls[0][0].where).toEqual({ username: "trublue" });
    expect(result.enabled).toBe(true);
  });

  it("wirft bei unbekanntem Träger, statt eine leere Reihe zu melden", async () => {
    userMock.mockResolvedValue(null);
    await expect(weightHistory("gibtsnicht", { days: null })).rejects.toThrow(/User not found/);
  });
});
