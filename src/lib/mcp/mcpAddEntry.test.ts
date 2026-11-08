import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * `add_entry` — die KI trägt ein Ereignis für den Träger nach.
 *
 * Geprüft wird die NAHT zum geteilten Dienst, nicht dessen Regeln (die stehen in
 * `entryCreateService.ts` und gelten für das Formular genauso): kommt der Aufruf richtig an, und
 * kommt eine Absage in der Sprache an, die eine KEYHOLDERIN lesen muss?
 */

vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: vi.fn() } },
}));
// Nur das SCHREIBEN festnageln. `validateEntryCreate` bleibt echt: die dryRun-Vorschau soll gegen
// die wirkliche Regel prüfen, nicht gegen eine Attrappe — sonst prüfte der Test die Attrappe.
vi.mock("@/lib/entryCreateService", async (orig) => ({
  ...(await orig<object>()),
  createEntryForUser: vi.fn(),
}));
vi.mock("@/lib/queries", async (orig) => ({
  ...(await orig<object>()),
  getUserDeviceOptions: vi.fn(async () => []),
}));

import { mcpAddEntry } from "./mcpWrite";
import { prisma } from "@/lib/prisma";
import { createEntryForUser } from "@/lib/entryCreateService";

const userFind = prisma.user.findUnique as unknown as ReturnType<typeof vi.fn>;
const createMock = createEntryForUser as unknown as ReturnType<typeof vi.fn>;

const SUB = { id: "u1", username: "sub", timezone: "Europe/Zurich" };
const GESTERN = "2026-09-02T18:00:00.000Z";

beforeEach(() => {
  vi.clearAllMocks();
  userFind.mockResolvedValue(SUB);
  createMock.mockResolvedValue({ ok: true, entry: { id: "e1", type: "VERSCHLUSS", startTime: new Date(GESTERN) } });
});

describe("add_entry", () => {
  it("reicht Art und Zeitpunkt an den geteilten Dienst — rückdatiert", async () => {
    const res = await mcpAddEntry("sub", { type: "VERSCHLUSS", at: GESTERN }) as { id: string };
    expect(res.id).toBe("e1");
    const [user, input] = createMock.mock.calls[0];
    expect(user).toBe(SUB);
    expect(input).toMatchObject({ type: "VERSCHLUSS" });
    expect(input.startTime.toISOString()).toBe(GESTERN);
  });

  /**
   * OHNE `actorUserId`, und das ist eine Aussage: die KI ist kein Empfänger von Meldungen, und die
   * menschliche Keyholderin SOLL erfahren, was ihre KI erfasst hat. Stünde hier eine Kennung,
   * verschwände die Meldung an genau die Person, für die sie gedacht ist.
   */
  it("nennt AUSDRÜCKLICH keinen Handelnden — sonst fiele die Keyholderin aus der Meldung", async () => {
    await mcpAddEntry("sub", { type: "PRUEFUNG", at: GESTERN });
    // `null`, nicht `undefined`: der Schlüssel ist Pflicht, damit ein künftiger Aufrufer sich
    // bewusst entscheiden muss — an ihm hängt die Rückdatierungs-Sperre für Eigen-Einträge.
    expect(createMock.mock.calls[0][2].actorUserId).toBeNull();
  });

  /**
   * REGRESSION-Schutz für die Wortwahl: `NOT_LOCKED` ist an den TRÄGER adressiert („Öffnen nur
   * möglich, wenn aktuell verschlossen. Lade die Seite neu …"). Einer Keyholderin, die über ihren
   * Träger urteilt, hilft dieser Satz nicht — für sie führt das Projekt eigene Codes.
   */
  it("übersetzt die Sub-Absagen in die Keyholder-Fassung", async () => {
    createMock.mockResolvedValue({ ok: false, error: "NOT_LOCKED" });
    await expect(mcpAddEntry("sub", { type: "OEFFNEN", at: GESTERN })).rejects.toThrow(/user is not locked/i);

    createMock.mockResolvedValue({ ok: false, error: "ALREADY_LOCKED" });
    await expect(mcpAddEntry("sub", { type: "VERSCHLUSS", at: GESTERN })).rejects.toThrow(/user is already locked/i);
  });

  it("jede andere Absage kommt im Wortlaut des Modells", async () => {
    createMock.mockResolvedValue({ ok: false, error: "WEAR_DEVICE_REQUIRED" });
    await expect(mcpAddEntry("sub", { type: "WEAR_BEGIN", at: GESTERN })).rejects.toThrow(/device/i);
  });

  it("dryRun schreibt nichts und sagt, was es nicht prüfen kann", async () => {
    const res = await mcpAddEntry("sub", { type: "VERSCHLUSS", at: GESTERN, dryRun: true }) as {
      dryRun: boolean; wouldSucceed: boolean; preview: { caveat: string };
    };
    expect(res.dryRun).toBe(true);
    expect(res.wouldSucceed).toBe(true);
    expect(res.preview.caveat).toMatch(/commit time/i);
    expect(createMock).not.toHaveBeenCalled();
  });

  /**
   * Die Vorschau fährt die ECHTE Validierung — sonst verspräche sie Erfolg für einen Aufruf, den
   * der Commit gleich darauf abweist. Ein Öffnen ohne Grund ist der billigste Beleg dafür.
   */
  it("dryRun meldet, was die Validierung schon jetzt weiss", async () => {
    const res = await mcpAddEntry("sub", { type: "OEFFNEN", at: GESTERN, dryRun: true }) as {
      wouldSucceed: boolean; problem?: string;
    };
    expect(res.wouldSucceed).toBe(false);
    expect(res.problem).toBeTruthy();
  });
});
