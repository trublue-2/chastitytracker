import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Die Ketten-Frage beim Löschen und der Öffnungsgrund beim Korrigieren — die zwei Nähte, die der
 * Lösch- und Änderungs-Pfad seit der MCP-Öffnung teilen.
 *
 * Beide sind Regeln, die still versagen können: eine falsch beantwortete Ketten-Frage schlägt vor,
 * den ECHTEN Verschluss einer abgeschlossenen Session mitzulöschen, und ein ungeprüfter Grund
 * hinterlässt einen Code, für den die Anzeige kein Wort hat.
 */

vi.mock("@/lib/prisma", () => ({
  prisma: { device: { findUnique: vi.fn() }, user: { findUnique: vi.fn() } },
}));
vi.mock("@/lib/queries", () => ({ getEntryNeighbors: vi.fn() }));

import { chainBreakPartner } from "./entryCorrection";
import { getEntryNeighbors } from "@/lib/queries";

const neighbours = getEntryNeighbors as unknown as ReturnType<typeof vi.fn>;

const OEFFNEN = {
  id: "o1", userId: "u1", type: "OEFFNEN", startTime: new Date("2026-09-01T12:00:00Z"),
  deviceId: null, boltConfirmedAt: new Date("2026-09-01T12:00:00Z"),
};
const nachbar = (id: string, type: string) => ({ id, type, startTime: new Date("2026-09-01T10:00:00Z") });

beforeEach(() => vi.clearAllMocks());

describe("chainBreakPartner", () => {
  it("zwei gleichartige Nachbarn: das Entfernen bräche die Kette", async () => {
    neighbours.mockResolvedValue({ prev: nachbar("v1", "VERSCHLUSS"), next: nachbar("v2", "VERSCHLUSS") });
    // Beim Öffnen ist der Partner der VORGÄNGER — der Verschluss, den es schliesst.
    expect(await chainBreakPartner(OEFFNEN)).toMatchObject({ id: "v1", type: "VERSCHLUSS" });
  });

  it("ungleiche Nachbarn: die Kette bleibt heil", async () => {
    neighbours.mockResolvedValue({ prev: nachbar("v1", "VERSCHLUSS"), next: nachbar("o2", "OEFFNEN") });
    expect(await chainBreakPartner(OEFFNEN)).toBeNull();
  });

  it("am Rand der Historie gibt es nichts zu brechen", async () => {
    neighbours.mockResolvedValue({ prev: null, next: nachbar("v2", "VERSCHLUSS") });
    expect(await chainBreakPartner(OEFFNEN)).toBeNull();
  });

  /**
   * REGRESSION: ein SCHWEBENDER Verschluss-Aufruf (Riegel noch nicht gemeldet) steht per Definition
   * nicht in der Kette — `effectiveEntryWhere` blendet ihn überall aus. Wer ihn selbst nachliest,
   * sieht ihn trotzdem und meldet einen Bruch, den es nicht gibt: die Absage schlüge dann vor, den
   * echten Verschluss der abgeschlossenen Session mitzulöschen.
   *
   * Der Test hält fest, dass die Frage über `getEntryNeighbors` läuft — die EINE Stelle, an der die
   * Ausblendung steckt.
   */
  it("fragt über getEntryNeighbors, damit der schwebende Aufruf ausgeblendet bleibt", async () => {
    neighbours.mockResolvedValue({ prev: null, next: null });
    await chainBreakPartner(OEFFNEN);
    expect(neighbours).toHaveBeenCalledTimes(1);
    const [userId, at, types] = neighbours.mock.calls[0];
    expect(userId).toBe("u1");
    expect(at).toEqual(OEFFNEN.startTime);
    expect(types).toEqual(["VERSCHLUSS", "OEFFNEN"]);
    // Die eigene Zeile darf sich nicht selbst im Weg stehen.
    expect(neighbours.mock.calls[0][4]).toMatchObject({ excludeId: "o1" });
  });

  /** Der schwebende Aufruf SELBST: sein Löschen kann die Kette nicht brechen, er steht nicht darin. */
  it("ein schwebender Verschluss-Aufruf hat keinen Partner", async () => {
    const schwebend = { ...OEFFNEN, id: "v9", type: "VERSCHLUSS", boltConfirmedAt: null };
    expect(await chainBreakPartner(schwebend)).toBeNull();
    expect(neighbours).not.toHaveBeenCalled();
  });

  it("ungepaarte Arten stellen die Frage gar nicht", async () => {
    expect(await chainBreakPartner({ ...OEFFNEN, type: "ORGASMUS" })).toBeNull();
    expect(neighbours).not.toHaveBeenCalled();
  });
});
