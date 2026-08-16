import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Die Semantik der Benachrichtigungs-Schalter — und zwar an EINER Stelle.
 *
 * Zwei Regeln tragen das: eine fehlende Zeile heisst „an" (die Zeilen legt
 * `ensureNotificationPreferences` bei jedem Containerstart an — fehlt eine, ist das eine Anomalie,
 * und dann ist Senden die sichere Richtung), und ein Lesefehler darf den Aufrufer nicht mitreissen,
 * weil `notifyUser` an vielen Stellen NACH der eigentlichen Änderung läuft.
 *
 * Beide Regeln standen zeitweise ein zweites Mal in `entryNotify.ts` — dort mit umgekehrtem
 * Vorzeichen (fehlende Zeile = stumm). Genau deshalb liegen sie jetzt hier und werden hier geprüft.
 */

vi.mock("@/lib/prisma", () => ({
  prisma: { notificationPreference: { findMany: vi.fn(), findUnique: vi.fn() } },
}));

import { getEventChannelsAny, getEventChannels } from "./notificationPrefs";
import { prisma } from "@/lib/prisma";

const findMany = prisma.notificationPreference.findMany as unknown as ReturnType<typeof vi.fn>;
const findUnique = prisma.notificationPreference.findUnique as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => vi.clearAllMocks());

describe("getEventChannelsAny — mehrere Ereignisse, ein Ergebnis", () => {
  /** Der Fall, für den es die Funktion gibt: eine verbotene Öffnung ist auch eine Öffnung. */
  it("es zählt, was MINDESTENS ein Schalter erlaubt", async () => {
    findMany.mockResolvedValue([
      { eventType: "OEFFNUNG_IMMER", mail: false, push: false },
      { eventType: "OEFFNUNG_VERBOTEN", mail: true, push: false },
    ]);

    expect(await getEventChannelsAny("u1", ["OEFFNUNG_IMMER", "OEFFNUNG_VERBOTEN"]))
      .toEqual({ mail: true, push: false });
  });

  it("sind alle Schalter aus, bleibt es aus", async () => {
    findMany.mockResolvedValue([
      { eventType: "OEFFNUNG_IMMER", mail: false, push: false },
      { eventType: "OEFFNUNG_VERBOTEN", mail: false, push: false },
    ]);

    expect(await getEventChannelsAny("u1", ["OEFFNUNG_IMMER", "OEFFNUNG_VERBOTEN"]))
      .toEqual({ mail: false, push: false });
  });

  /** Eine fehlende Zeile ist eine Anomalie, kein Opt-out — und bei einer Meldung, die auf ein Urteil
   *  wartet, ist Senden die sichere Richtung. */
  it("eine fehlende Zeile heisst an, nicht stumm", async () => {
    findMany.mockResolvedValue([{ eventType: "OEFFNUNG_IMMER", mail: false, push: false }]);

    expect(await getEventChannelsAny("u1", ["OEFFNUNG_IMMER", "OEFFNUNG_VERBOTEN"]))
      .toEqual({ mail: true, push: true });
  });

  it("holt alle Typen in EINER Abfrage", async () => {
    findMany.mockResolvedValue([]);
    await getEventChannelsAny("u1", ["OEFFNUNG_IMMER", "OEFFNUNG_VERBOTEN"]);

    expect(findMany).toHaveBeenCalledOnce();
    expect(findMany.mock.calls[0][0].where).toMatchObject({
      userId: "u1",
      eventType: { in: ["OEFFNUNG_IMMER", "OEFFNUNG_VERBOTEN"] },
    });
  });

  /** Ein Lesefehler darf den Aufrufer nicht mit einem 500 beenden, obwohl sein Datensatz längst
   *  geschrieben ist — im Zweifel wird gesendet. */
  it("fällt die Abfrage aus, wird gesendet", async () => {
    findMany.mockRejectedValue(new Error("db weg"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    expect(await getEventChannelsAny("u1", ["VERSCHLUSS"])).toEqual({ mail: true, push: true });
  });

  /** Ohne Ereignis gibt es nichts, was etwas erlauben könnte. Die Aufrufer prüfen das vorher. */
  it("eine leere Liste ergibt beides aus", async () => {
    findMany.mockResolvedValue([]);
    expect(await getEventChannelsAny("u1", [])).toEqual({ mail: false, push: false });
  });
});

describe("getEventChannels — dieselbe Regel für ein einzelnes Ereignis", () => {
  it("eine fehlende Zeile heisst auch hier an", async () => {
    findUnique.mockResolvedValue(null);
    expect(await getEventChannels("u1", "TASK_PROOF_LATE")).toEqual({ mail: true, push: true });
  });

  it("die gespeicherte Zeile gewinnt", async () => {
    findUnique.mockResolvedValue({ mail: false, push: true });
    expect(await getEventChannels("u1", "TASK_PROOF_LATE")).toEqual({ mail: false, push: true });
  });
});
