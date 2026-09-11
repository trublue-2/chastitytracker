import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Der einzige Schalter, der das Stufen-Modell überlebt hat: die Wiege-Erinnerung.
 *
 * Alles andere folgt der Stufe des Empfängers (`deliveryChannels.ts`). Hier bleiben genau zwei
 * Regeln zu halten: eine fehlende Zeile heisst „an" (die Zeile entsteht erst, wenn jemand den
 * Schalter anfasst), und ein Lesefehler darf den Aufrufer nicht mitreissen — `notifyUser` läuft an
 * vielen Stellen NACH der eigentlichen Änderung, ein 500 von hier verlöre sie.
 */

vi.mock("@/lib/prisma", () => ({
  prisma: { notificationPreference: { findUnique: vi.fn() } },
}));

import { getRecipientChannels } from "./notificationPrefs";
import { prisma } from "@/lib/prisma";

const findUnique = prisma.notificationPreference.findUnique as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => vi.clearAllMocks());

describe("getRecipientChannels", () => {
  it("eine fehlende Zeile heisst an", async () => {
    findUnique.mockResolvedValue(null);
    expect(await getRecipientChannels("u1", "WEIGHT_REMINDER")).toEqual({ mail: true, push: true, telegram: true });
  });

  it("die gespeicherte Zeile gewinnt, je Kanal einzeln", async () => {
    findUnique.mockResolvedValue({ mail: false, push: true, telegram: false });
    expect(await getRecipientChannels("u1", "WEIGHT_REMINDER")).toEqual({ mail: false, push: true, telegram: false });
  });

  it("fällt die Abfrage aus, wird gesendet", async () => {
    findUnique.mockRejectedValue(new Error("db weg"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await getRecipientChannels("u1", "WEIGHT_REMINDER")).toEqual({ mail: true, push: true, telegram: true });
  });
});
