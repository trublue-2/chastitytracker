import { describe, it, expect, vi, beforeEach } from "vitest";

// hasActiveKontrolle nutzt nur prisma.kontrollAnforderung.findFirst — mocken.
vi.mock("@/lib/prisma", () => ({ prisma: { kontrollAnforderung: { findFirst: vi.fn() } } }));

import { hasActiveKontrolle, inspectionIntro } from "./kontrolleService";
import { emailT } from "@/lib/emailI18n";
import { prisma } from "@/lib/prisma";

const findFirstMock = prisma.kontrollAnforderung.findFirst as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  findFirstMock.mockReset();
});

describe("hasActiveKontrolle — Überschneidungs-Guard", () => {
  const NOW = new Date("2026-07-09T12:00:00Z");

  it("true, wenn eine sichtbare (unmittelbare) Kontrolle existiert", async () => {
    findFirstMock.mockResolvedValue({ id: "ka1" });
    const result = await hasActiveKontrolle("u1", NOW);
    expect(result).toBe(true);
  });

  it("false, wenn keine passende Zeile gefunden wird", async () => {
    findFirstMock.mockResolvedValue(null);
    const result = await hasActiveKontrolle("u1", NOW);
    expect(result).toBe(false);
  });

  it("Query filtert entryId:null, withdrawnAt:null und (wirksamAb:null ODER bereits erreicht)", async () => {
    findFirstMock.mockResolvedValue(null);
    await hasActiveKontrolle("u1", NOW);
    const arg = findFirstMock.mock.calls[0][0];
    expect(arg.where).toMatchObject({ userId: "u1", entryId: null, withdrawnAt: null });
    expect(arg.where.OR).toEqual([{ wirksamAb: null }, { wirksamAb: { lte: NOW } }]);
    // Eine noch in der Zukunft geplante (unsichtbare) Kontrolle darf NICHT als aktiv zählen —
    // sichergestellt dadurch, dass die Query wirksamAb explizit auf "erreicht" beschränkt statt
    // jede nicht-null wirksamAb zuzulassen.
    expect(arg.where.wirksamAb).toBeUndefined();
  });

  it("blockiert nur LAUFENDE: deadline muss noch in der Zukunft liegen (überfällige zählen nicht)", async () => {
    findFirstMock.mockResolvedValue(null);
    await hasActiveKontrolle("u1", NOW);
    const arg = findFirstMock.mock.calls[0][0];
    // deadline >= now grenzt Status "open" von "overdue" ab. Eine überfällige, nie beantwortete
    // Kontrolle (deadline < now) würde sonst jede künftige (auch Auto-)Kontrolle dauerhaft
    // blockieren — genau das verhindert diese Bedingung.
    expect(arg.where.deadline).toEqual({ gte: NOW });
  });

  it("excludeId schliesst die geprüfte Zeile selbst aus (Poller-Fall: 'irgendeine ANDERE aktive')", async () => {
    findFirstMock.mockResolvedValue(null);
    await hasActiveKontrolle("u1", NOW, { excludeId: "self-id" });
    const arg = findFirstMock.mock.calls[0][0];
    expect(arg.where.id).toEqual({ not: "self-id" });
  });

  it("ohne excludeId wird kein id-Filter gesetzt (requestKontrolle-Fall: neue Zeile existiert noch nicht)", async () => {
    findFirstMock.mockResolvedValue(null);
    await hasActiveKontrolle("u1", NOW);
    const arg = findFirstMock.mock.calls[0][0];
    expect(arg.where.id).toBeUndefined();
  });
});

/**
 * Issue #42: Die Mail sagte „innert der nächsten 1 Stunde", während die Frist-Zeile darunter 10
 * Minuten nannte. Ursache war `Math.max(1, Math.round(ms / 3_600_000))` — alles unter einer halben
 * Stunde rundete auf 0 und wurde auf 1 angehoben, und 90 Minuten wurden zu „2 Stunden".
 * Auto-Kontrollen ziehen ihre Frist zufällig aus 5–240 Minuten (AUTO_INSPECTION_DEADLINE_*_RANGE),
 * das trifft also den Normalfall.
 */
describe("inspectionIntro — die genannte Dauer muss der echten Frist entsprechen", () => {
  const min = (n: number) => n * 60_000;
  const de = (ms: number) => inspectionIntro(emailT("de"), ms);
  const en = (ms: number) => inspectionIntro(emailT("en"), ms);

  it("nennt Minuten, wenn weniger als eine Stunde bleibt (der gemeldete Fall)", () => {
    expect(de(min(10))).toContain("10 Minuten");
    expect(de(min(10))).not.toContain("Stunde");
    expect(en(min(10))).toContain("10 minutes");
  });

  it("beugt die Einzahl korrekt", () => {
    expect(de(min(1))).toContain("1 Minute ");
    expect(en(min(1))).toContain(" 1 minute.");
  });

  it("nennt bei vollen Stunden nur Stunden", () => {
    expect(de(min(60))).toContain("1 Stunde ");
    expect(de(min(240))).toContain("4 Stunden");
    expect(en(min(240))).toContain(" 4 hours.");
  });

  it("zerlegt krumme Fristen statt sie zu runden", () => {
    // Vor dem Fix: „2 Stunden" — also 30 Minuten mehr versprochen, als die Frist hergab.
    expect(de(min(90))).toContain("1 Stunde und 30 Minuten");
    expect(de(min(150))).toContain("2 Stunden und 30 Minuten");
    expect(en(min(90))).toContain("1 hour and 30 minutes");
  });

  it("verspricht NIE mehr Zeit, als tatsächlich bleibt", () => {
    // Die Eigenschaft, an der der ursprüngliche Fehler gescheitert wäre — über die ganze Spannweite,
    // aus der die Auto-Kontrolle ihre Frist zieht.
    for (let m = 1; m <= 240; m++) {
      const text = de(min(m));
      const h = /(\d+) Stunden?/.exec(text);
      const mi = /(\d+) Minuten?/.exec(text);
      const genannt = (h ? Number(h[1]) * 60 : 0) + (mi ? Number(mi[1]) : 0);
      expect(genannt, `bei ${m} min stand „${text}"`).toBeLessThanOrEqual(m);
    }
  });

  it("kippt an der Stundengrenze nicht auf „60 Minuten“", () => {
    const s = de(min(59.6));  // rundet auf 60
    expect(s).not.toContain("60 Minuten");
    expect(s).toContain("1 Stunde ");
  });

  it("behauptet bei verstrichener oder kaputter Frist keine 0 und kein NaN", () => {
    expect(de(-min(5))).toContain("1 Minute ");
    expect(de(NaN)).toContain("1 Minute ");
    expect(de(NaN)).not.toContain("NaN");
  });
});
