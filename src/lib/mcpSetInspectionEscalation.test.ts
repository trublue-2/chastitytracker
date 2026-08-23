import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * `set_inspection_escalation` — die zwei Stufen einer überfälligen Kontrolle.
 *
 * Gepinnt wird, was das Werkzeug ÜBER dem Dienst leistet: der Patch auf den Bestand (nicht
 * mitgeschickte Felder bleiben, wie sie sind) und die Vorschau, die den GEKLEMMTEN Wert zeigt —
 * eine Vorschau, die den rohen Wunsch zurückgibt, verschweigt genau die stille Korrektur, die sie
 * aufdecken soll.
 */

vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn() } },
}));
vi.mock("@/lib/inspectionEscalationService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/inspectionEscalationService")>();
  return { ...actual, setInspectionEscalationSettings: vi.fn().mockResolvedValue({ ok: true, data: null }) };
});

import { mcpSetInspectionEscalation } from "./mcpWrite";
import { prisma } from "@/lib/prisma";
import { setInspectionEscalationSettings } from "@/lib/inspectionEscalationService";

const setSettingsMock = setInspectionEscalationSettings as unknown as ReturnType<typeof vi.fn>;

/** Bestand: Mahnung aus, Vermerk aus, Vorgabe-Verzögerungen. */
const BESTAND = {
  inspectionReminderEnabled: false, inspectionReminderDelayMinutes: 5,
  inspectionAutoMarkEnabled: false, inspectionAutoMarkDelayMinutes: 60,
};

beforeEach(() => {
  vi.clearAllMocks();
  (prisma.user.findUnique as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "u1" });
  (prisma.user.findUniqueOrThrow as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(BESTAND);
  setSettingsMock.mockResolvedValue({ ok: true, data: null });
});

describe("set_inspection_escalation", () => {
  it("verlangt überhaupt ein Feld", async () => {
    await expect(mcpSetInspectionEscalation("sub", {})).rejects.toThrow(/at least one of/);
  });

  it("reicht nur die genannten Felder durch", async () => {
    await mcpSetInspectionEscalation("sub", { reminderEnabled: true });
    expect(setSettingsMock.mock.calls[0][1]).toEqual({
      reminderEnabled: true, reminderDelayMinutes: undefined,
      autoMarkEnabled: undefined, autoMarkDelayMinutes: undefined,
    });
  });

  it("zeigt im dryRun den Bestand für alles, was nicht mitkommt", async () => {
    const res = await mcpSetInspectionEscalation("sub", { dryRun: true, autoMarkEnabled: true });
    expect(setSettingsMock).not.toHaveBeenCalled();
    expect((res as { preview: Record<string, unknown> }).preview).toEqual({
      reminderEnabled: false, reminderDelayMinutes: 5,
      autoMarkEnabled: true, autoMarkDelayMinutes: 60,
    });
  });

  it("zeigt im dryRun den GEKLEMMTEN Wert, nicht den rohen Wunsch", async () => {
    // Der Dienst klemmt beim Schreiben identisch — eine Vorschau mit „100000" verspräche eine
    // Verzögerung, die nie eintritt.
    const res = await mcpSetInspectionEscalation("sub", { dryRun: true, reminderDelayMinutes: 100000 });
    expect((res as { preview: { reminderDelayMinutes: number } }).preview.reminderDelayMinutes).toBe(1440);
  });
});
