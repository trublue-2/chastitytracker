import { describe, it, expect, vi } from "vitest";
import { assertEntryTimeOk, entryPairTypes, entryPersistsDevice } from "./entryCorrection";
import { KG_PAIR, WEAR_PAIR } from "./utils";
import { VALID_TYPES } from "./constants";
import type { Prisma } from "@prisma/client";

/**
 * Die beiden Fragen, an denen eine Korrektur scheitern darf, BEVOR sie die Datenbank anfasst.
 *
 * Sie stehen hier und nicht nur im Dienst, weil beide Schnittstellen sie stellen: der MCP nimmt sie
 * für die dryRun-Vorschau vorweg, damit sie keinen Erfolg verspricht, den der Commit verweigert.
 * Laufen die zwei Antworten auseinander, ist genau das die Folge — und zwar lautlos.
 */
describe("entryPairTypes", () => {
  it("die Verschluss-Kette", () => {
    expect(entryPairTypes("VERSCHLUSS")).toBe(KG_PAIR);
    expect(entryPairTypes("OEFFNEN")).toBe(KG_PAIR);
  });

  it("die Trage-Kette", () => {
    expect(entryPairTypes("WEAR_BEGIN")).toBe(WEAR_PAIR);
    expect(entryPairTypes("WEAR_END")).toBe(WEAR_PAIR);
  });

  /** Prüfung und Orgasmus sind ungepaart — an ihnen hängen Foto und Urteil, und beides fasst die
   *  Korrektur nicht an. Sie werden über die Oberfläche richtiggestellt. */
  it("ungepaarte Arten: keine Kette, also keine Korrektur über diesen Weg", () => {
    expect(entryPairTypes("PRUEFUNG")).toBeNull();
    expect(entryPairTypes("ORGASMUS")).toBeNull();
  });
});

describe("entryPersistsDevice", () => {
  it("Verschluss und beide Trage-Enden tragen ein Gerät", () => {
    expect(entryPersistsDevice("VERSCHLUSS")).toBe(true);
    expect(entryPersistsDevice("WEAR_BEGIN")).toBe(true);
    expect(entryPersistsDevice("WEAR_END")).toBe(true);
  });

  /**
   * Das Öffnen NICHT — das Gerät steht am zugehörigen Verschluss. Ohne diese Unterscheidung nähme
   * der Dienst ein `deviceName` entgegen, schriebe es nirgends hin und meldete Erfolg: die
   * Keyholderin hielte die Korrektur für erledigt, während der falsche Eintrag unverändert steht.
   */
  it("das Öffnen trägt keins", () => {
    expect(entryPersistsDevice("OEFFNEN")).toBe(false);
  });
});

/**
 * DIE NAHT, um derentwillen die Extraktion überhaupt stattfand: die Ketten-Prüfung, die vorher
 * inline in `PATCH /api/entries/[id]` stand und jetzt auch den MCP bedient. Ohne Test hier liesse
 * sie sich an einer der beiden Seiten zurückdrehen, ohne dass etwas rot wird.
 */
describe("assertEntryTimeOk", () => {
  const NOW_ISH = new Date("2026-05-01T11:00:00Z");
  const kgEntry = { id: "e1", userId: "u1", type: "VERSCHLUSS", deviceId: "d1" };

  /** Ein Transaktions-Client, der nur das kann, was die Prüfung fragt. */
  const txWith = (neighbours: unknown[], category: string | null = "cat1") => {
    const findFirst = vi.fn();
    for (const n of neighbours) findFirst.mockResolvedValueOnce(n);
    findFirst.mockResolvedValue(null);
    return {
      tx: {
        entry: { findFirst },
        device: { findUnique: vi.fn().mockResolvedValue({ categoryId: category }) },
      } as unknown as Prisma.TransactionClient,
      findFirst,
    };
  };

  /** Reihenfolge der Wächter: die ungepaarte Art steigt VOR der Zukunftsprüfung aus. Das ist keine
   *  Feinheit, sondern das Verhalten der Route — dort wurde die Zukunft nur für Paare geprüft. */
  it("ungepaarte Art: keine Abfrage, und auch kein TIME_IN_FUTURE", async () => {
    const { tx, findFirst } = txWith([]);
    const morgen = new Date(Date.now() + 86_400_000);
    await expect(assertEntryTimeOk(tx, { ...kgEntry, type: "PRUEFUNG" }, morgen)).resolves.toBeUndefined();
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("ein Zeitpunkt in der Zukunft wird abgelehnt", async () => {
    const { tx } = txWith([]);
    const morgen = new Date(Date.now() + 86_400_000);
    await expect(assertEntryTimeOk(tx, kgEntry, morgen)).rejects.toThrow();
  });

  it("ein Nachbar DERSELBEN Art bricht die Kette", async () => {
    const { tx } = txWith([{ type: "VERSCHLUSS" }, null]);
    await expect(assertEntryTimeOk(tx, kgEntry, NOW_ISH)).rejects.toThrow();
  });

  it("ein Nachbar der GEGEN-Art ist der Normalfall", async () => {
    const { tx } = txWith([{ type: "OEFFNEN" }, { type: "OEFFNEN" }]);
    await expect(assertEntryTimeOk(tx, kgEntry, NOW_ISH)).resolves.toBeUndefined();
  });

  /** Beim Trage-Paar zählt nur die Kette DERSELBEN Kategorie — zwei Geräte verschiedener Kategorien
   *  dürfen gleichzeitig getragen werden. Und die eigene Zeile darf sich nicht selbst im Weg stehen. */
  it("Trage-Paar: fragt nach Kategorie und schliesst die eigene Zeile aus", async () => {
    const { tx, findFirst } = txWith([null, null]);
    await assertEntryTimeOk(tx, { ...kgEntry, type: "WEAR_BEGIN" }, NOW_ISH);
    const where = findFirst.mock.calls[0][0].where;
    expect(JSON.stringify(where)).toContain("cat1");
    expect(JSON.stringify(where)).toContain("e1");
  });
});

/**
 * Der Wächter gegen eine still danebenfallende Eintragsart: kommt eine NEUE dazu, muss jemand
 * entscheiden, ob sie korrigierbar ist — statt dass `entryPairTypes` sie wortlos als „nein" führt.
 */
describe("Vollständigkeit gegenüber VALID_TYPES", () => {
  it("jede gültige Eintragsart ist hier bewusst eingeordnet", () => {
    const paired = ["VERSCHLUSS", "OEFFNEN", "WEAR_BEGIN", "WEAR_END"];
    const unpaired = ["PRUEFUNG", "ORGASMUS"];
    expect([...VALID_TYPES].sort()).toEqual([...paired, ...unpaired].sort());
    for (const t of paired) expect(entryPairTypes(t)).not.toBeNull();
    for (const t of unpaired) expect(entryPairTypes(t)).toBeNull();
  });
});
