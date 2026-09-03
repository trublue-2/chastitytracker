import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", async () => {
  const { createPrismaMock } = await import("@/test/prismaMock");
  return { prisma: createPrismaMock() };
});

import { listInspections } from "./inspections";
import { prisma } from "@/lib/prisma";
import { TEST_USER, type PrismaMock } from "@/test/prismaMock";

const db = prisma as unknown as PrismaMock;

/**
 * Der Kontroll-Verlauf für die KI — die Lücke `inspection-list` aus dem Funktionsmodell.
 *
 * Geprüft wird die NAHT, nicht die Zustands-Rechnung: die kommt aus `buildKontrolleRows` und ist
 * dort getestet. Hier zählt, dass dieses Werkzeug sie wirklich benutzt (statt eine zweite Wahrheit
 * aufzubauen), dass die Keyholder-Sichtbarkeit gilt und dass Filter und Deckel tun, was sie sagen.
 */
const NOW = new Date();
const vorEinerStunde = new Date(NOW.getTime() - 3_600_000);
const inEinerStunde = new Date(NOW.getTime() + 3_600_000);

/** Eine offene Anforderung: gestellt, Frist läuft, noch nichts eingereicht. */
const offeneAnforderung = {
  id: "k1", userId: "u1", code: "12345", kommentar: "Zeig mir den Käfig",
  createdAt: vorEinerStunde, deadline: inEinerStunde,
  fulfilledAt: null, withdrawnAt: null, wirksamAb: null, entryId: null, entry: null,
  user: { username: "sub", timezone: "Europe/Zurich" },
  targetCategory: null, targetDevice: null,
};

/** Eine freiwillige Prüfung — es gibt keine Anforderung dazu. */
const freiwilligePruefung = {
  id: "e1", userId: "u1", type: "PRUEFUNG", startTime: vorEinerStunde,
  imageUrl: "/api/uploads/x.jpg", boxImageUrl: null, note: null, kontrollCode: null,
  verifikationStatus: null, verifikationReason: null, verifikationReasonDetected: null,
  deviceCheck: null, deviceCheckNote: null, deviceCheckExpected: null,
  user: { username: "sub", timezone: "Europe/Zurich" },
  device: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  db.user.findUnique.mockResolvedValue(TEST_USER);
  db.entry.findMany.mockResolvedValue([]);
  db.kontrollAnforderung.findMany.mockResolvedValue([]);
});

describe("list_inspections", () => {
  it("nennt die offene Anforderung mit Ziel, Frist und Anweisung", async () => {
    db.kontrollAnforderung.findMany.mockResolvedValue([offeneAnforderung]);
    const res = await listInspections("sub");
    expect(res.inspections).toHaveLength(1);
    expect(res.inspections[0]).toMatchObject({ id: "k1", status: "open", comment: "Zeig mir den Käfig" });
    expect(res.inspections[0].deadline).not.toBeNull();
  });

  /** `null` ist für eine Maschine kein Zustand, sondern eine fehlende Angabe — die freiwillige
   *  Prüfung bekommt deshalb einen Namen, statt die KI raten zu lassen. */
  it("eine Prüfung ohne Anforderung heisst `selfcontrol`", async () => {
    db.entry.findMany.mockResolvedValue([freiwilligePruefung]);
    const res = await listInspections("sub");
    expect(res.inspections[0]).toMatchObject({ id: null, status: "selfcontrol" });
  });

  it("filtert nach Zustand und meldet die Gesamtzahl der Auswahl", async () => {
    db.kontrollAnforderung.findMany.mockResolvedValue([offeneAnforderung]);
    db.entry.findMany.mockResolvedValue([freiwilligePruefung]);
    const alle = await listInspections("sub");
    expect(alle.total).toBe(2);

    const nurOffene = await listInspections("sub", { status: ["open"] });
    expect(nurOffene.total).toBe(1);
    expect(nurOffene.inspections.map((i) => i.status)).toEqual(["open"]);
  });

  /** `total` zählt die AUSWAHL, nicht die gelieferten Zeilen — sonst sähe ein abgeschnittener Blick
   *  wie Vollständigkeit aus, und die KI schlösse aus einer halben Liste auf ein Muster. */
  it("der Deckel schneidet ab, ohne die Gesamtzahl zu beschönigen", async () => {
    db.kontrollAnforderung.findMany.mockResolvedValue([offeneAnforderung, { ...offeneAnforderung, id: "k2" }]);
    const res = await listInspections("sub", { limit: 1 });
    expect(res.inspections).toHaveLength(1);
    expect(res.total).toBe(2);
  });

  /**
   * Die zufällig geplanten Auto-Kontrollen bleiben verborgen, solange sie nicht ausgelöst haben.
   * Über `keyholderVisibleKontrolleWhere` — dieselbe Bedingung wie in der Oberfläche: verriete diese
   * Liste den Zeitpunkt, wäre die Unvorhersehbarkeit dahin, um die es bei ihnen geht.
   */
  it("fragt mit der Keyholder-Sichtbarkeit, nicht roh", async () => {
    await listInspections("sub");
    const where = db.kontrollAnforderung.findMany.mock.calls[0][0].where;
    expect(JSON.stringify(where)).not.toBe("{\"userId\":\"u1\"}");
    expect(where.userId).toBe("u1");
  });

  it("unbekannter Benutzer: klare Absage statt leerer Liste", async () => {
    db.user.findUnique.mockResolvedValue(null);
    await expect(listInspections("niemand")).rejects.toThrow(/not found/i);
  });
});
