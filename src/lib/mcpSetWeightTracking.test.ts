import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * `set_weight_tracking` — die Schreib-Seite der Gewichts-Einstellungen über den MCP.
 *
 * Gepinnt wird, was das Werkzeug ÜBER dem Service leistet: die Übersetzung der Wochentage aus der
 * Agenten-Form (ISO-Liste) in die gespeicherte Bitmaske, die Untergewichts-Warnung VOR dem
 * Schreiben, und dass eine Einstellungs-FAMILIE in einem Werkzeug liegt statt in dreien
 * (CLAUDE.md, „MCP-Vollständigkeit").
 */

vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn() } },
}));
vi.mock("@/lib/weightSettingsService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/weightSettingsService")>();
  return { ...actual, setWeightSettingsKeyholder: vi.fn().mockResolvedValue({ ok: true, data: null }) };
});

import { mcpSetWeightTracking } from "./mcpWrite";
import { prisma } from "@/lib/prisma";
import { setWeightSettingsKeyholder } from "@/lib/weightSettingsService";
import { ALL_WEEKDAYS, weekdayMaskOf } from "./weekdays";

const findUniqueOrThrowMock = prisma.user.findUniqueOrThrow as unknown as ReturnType<typeof vi.fn>;
const setSettingsMock = setWeightSettingsKeyholder as unknown as ReturnType<typeof vi.fn>;

/** Bestand: freigeschaltet, ein Morgen-Fenster, der Träger hat sich 84 kg vorgenommen. */
const BESTAND = {
  weightTrackingEnabled: true,
  weighingWindows: JSON.stringify([{ start: "06:00", durationMin: 120, days: ALL_WEEKDAYS, remind: false }]),
  heightCm: 180,
  targetWeightKg: 84, targetWeightSetAt: new Date("2026-08-01T00:00:00Z"),
  targetWeightKeyholderKg: null, targetWeightKeyholderSetAt: null,
};

/** Was der Service zu schreiben bekommt. */
const gespeichert = () => setSettingsMock.mock.calls[0][1];

const ENV_VORHER = process.env.ENABLE_WEIGHT_TRACKING;
beforeEach(() => {
  vi.clearAllMocks();
  process.env.ENABLE_WEIGHT_TRACKING = "true";
  (prisma.user.findUnique as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "u1" });
  findUniqueOrThrowMock.mockResolvedValue(BESTAND);
  setSettingsMock.mockResolvedValue({ ok: true, data: null });
});
afterEach(() => {
  if (ENV_VORHER === undefined) delete process.env.ENABLE_WEIGHT_TRACKING;
  else process.env.ENABLE_WEIGHT_TRACKING = ENV_VORHER;
});

describe("set_weight_tracking — eine Familie, ein Werkzeug", () => {
  it("verlangt überhaupt ein Feld", async () => {
    await expect(mcpSetWeightTracking("sub", {})).rejects.toThrow(/at least one of/);
  });

  it("schaltet frei, ohne die anderen Felder anzufassen", async () => {
    await mcpSetWeightTracking("sub", { enabled: false });
    expect(gespeichert()).toMatchObject({ enabled: false });
    expect(gespeichert().weighingWindows).toBeUndefined();
    expect(gespeichert().targetWeightKeyholderKg).toBeUndefined();
  });

  it("übersetzt die Wochentage aus der ISO-Liste in die gespeicherte Maske", async () => {
    // Die Agentin denkt in Wochentagen, die Spalte in Bits — die Übersetzung gehört ins Werkzeug.
    await mcpSetWeightTracking("sub", {
      windows: [{ start: "05:00", durationMin: 180, days: [6, 7], remind: true }],
    });
    expect(gespeichert().weighingWindows).toEqual([
      { start: "05:00", durationMin: 180, days: weekdayMaskOf([6, 7]), remind: true },
    ]);
  });

  it("nimmt ein Fenster ohne Wochentage als tägliches an", async () => {
    await mcpSetWeightTracking("sub", { windows: [{ start: "05:00", durationMin: 180 }] });
    expect(gespeichert().weighingWindows[0]).toMatchObject({ days: ALL_WEEKDAYS, remind: false });
  });

  it("weist ein Fenster über Mitternacht ab, bevor der Service es sieht", async () => {
    await expect(mcpSetWeightTracking("sub", { windows: [{ start: "23:00", durationMin: 180 }] }))
      // Mit Position und Inhalt des Fensters — nicht bloss „windows: Invalid time".
      .rejects.toThrow(/windows\[0\] .*23:00/);
    expect(setSettingsMock).not.toHaveBeenCalled();
  });

  it("weist ein Fenster ohne Wochentag ab — eine Regel, die nie gilt", async () => {
    await expect(mcpSetWeightTracking("sub", { windows: [{ start: "05:00", durationMin: 60, days: [] }] }))
      .rejects.toThrow(/windows\[0\]/);
  });

  it("weist ein unplausibles Zielgewicht ab", async () => {
    await expect(mcpSetWeightTracking("sub", { targetKg: 4 })).rejects.toThrow(/targetKg:/);
  });

  it("nimmt die Rücknahme des eigenen Ziels an und sagt, wessen dann gilt", async () => {
    const res = await mcpSetWeightTracking("sub", { targetKg: null }) as { message: string };
    expect(gespeichert().targetWeightKeyholderKg).toBeNull();
    expect(res.message).toMatch(/84 kg applies again/);
  });

  it("weist ab, wenn die INSTANZ das Feature gar nicht führt", async () => {
    delete process.env.ENABLE_WEIGHT_TRACKING;
    await expect(mcpSetWeightTracking("sub", { enabled: true })).rejects.toThrow(/not available on this instance/);
  });
});

describe("set_weight_tracking — dryRun", () => {
  it("zeigt den Stand danach, ohne zu schreiben", async () => {
    const res = await mcpSetWeightTracking("sub", { dryRun: true, targetKg: 80 });
    expect(setSettingsMock).not.toHaveBeenCalled();
    expect(res).toMatchObject({ dryRun: true, wouldSucceed: true });
    expect((res as { preview: Record<string, unknown> }).preview)
      .toMatchObject({ targetKg: 80, effectiveTargetKg: 80, subTargetKg: 84, underweightWarning: false });
  });

  it("nennt wieder SEIN Ziel als wirksames, wenn ihres zurückgenommen wird", async () => {
    const res = await mcpSetWeightTracking("sub", { dryRun: true, targetKg: null });
    expect((res as { preview: Record<string, unknown> }).preview)
      .toMatchObject({ targetKg: null, effectiveTargetKg: 84 });
  });

  it("warnt VOR dem Schreiben, wenn das Ziel ins Untergewicht führt", async () => {
    // Die KI soll den Träger fragen können, bevor sie eine Zahl setzt, die die App selbst als
    // bedenklich anzeigt — hinterher wäre die Warnung wertlos.
    const res = await mcpSetWeightTracking("sub", { dryRun: true, targetKg: 55 });
    expect((res as { preview: Record<string, unknown> }).preview).toMatchObject({ underweightWarning: true });
  });

  it("zeigt die Fenster lesbar, mit Wochentagen und Erinnerung", async () => {
    const res = await mcpSetWeightTracking("sub", {
      dryRun: true,
      windows: [{ start: "05:00", durationMin: 180, days: [6, 7], remind: true }],
    });
    expect((res as { preview: { windows: string[] } }).preview.windows)
      .toEqual(["05:00-08:00 sat,sun (reminder)"]);
  });
});
