import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Zwei Regressionen aus dem MCP-Vorfall vom 28.07.2026:
 *
 * 1. `withdraw target=inspection` OHNE id räumte JEDE offene Kontroll-Zeile weg — auch die noch
 *    nicht ausgelösten AUTO-Kontrollen, die das Dashboard dem Aufrufer bewusst vorenthält. Ein
 *    Rückzug traf drei statt einer, und die Automatik schwieg den Rest des Tages (der Poller hält
 *    den Tag für geplant, siehe `ensureDailyAutoKontrollenForUser`).
 * 2. `request_inspection` klemmte `delayMinutes` still auf ein Maximum und meldete den ERSETZTEN
 *    Wert als Erfolg. 242 min angefragt, 65 geliefert, kein Hinweis in der Antwort.
 */

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    kontrollAnforderung: { count: vi.fn(), findMany: vi.fn(), findFirst: vi.fn() },
    entry: { findFirst: vi.fn() },
  },
}));

vi.mock("@/lib/kontrolleService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/kontrolleService")>();
  return { ...actual, requestKontrolle: vi.fn(), resolveKontrolle: vi.fn(), resolveInspectionEntry: vi.fn(), hasActiveKontrolle: vi.fn() };
});

import { mcpWithdraw, mcpRequestInspection, mcpResolveInspection } from "./mcpWrite";
import { prisma } from "@/lib/prisma";
import { requestKontrolle, resolveKontrolle, resolveInspectionEntry, hasActiveKontrolle } from "@/lib/kontrolleService";
import { INSPECTION_DELAY_RANGE, INSPECTION_RANDOM_DELAY } from "@/lib/constants";
import { keyholderVisibleKontrolleWhere } from "@/lib/queries";

const JETZT = new Date("2026-07-28T12:00:00Z");
const kontrollFindManyMock = prisma.kontrollAnforderung.findMany as unknown as ReturnType<typeof vi.fn>;
const kontrollCountMock = prisma.kontrollAnforderung.count as unknown as ReturnType<typeof vi.fn>;
const requestKontrolleMock = requestKontrolle as unknown as ReturnType<typeof vi.fn>;

/** Die Where-Klausel, die geplante Auto-Kontrollen ausklammert — `keyholderVisibleKontrolleWhere`
 *  ist dieselbe Sichtbarkeitsregel, die auch die Admin-UI benutzt. Bewusst gegen das echte Fragment
 *  geprüft statt gegen ein nachgebautes Literal: der Punkt der Korrektur ist ja, dass Sicht und
 *  Rückzug EINE Regel teilen — ein zweites Literal hier könnte genau daran vorbeidriften. */
const EXPECTED_WHERE = {
  userId: "u1", entryId: null, withdrawnAt: null, ...keyholderVisibleKontrolleWhere(JETZT),
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(JETZT);
  (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "u1", username: "sub", role: "admin" });
  (prisma.entry.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ type: "VERSCHLUSS" });
  (hasActiveKontrolle as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(false);
  kontrollFindManyMock.mockResolvedValue([]);
  kontrollCountMock.mockResolvedValue(0);
  (resolveKontrolle as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, data: { userId: "u1", notified: true } });
  requestKontrolleMock.mockResolvedValue({
    ok: true,
    data: { code: "12345", deadline: "2026-07-28T18:00:00+02:00", scheduledFor: "2026-07-28T16:50:00+02:00" },
  });
});

describe("withdraw target=inspection lässt geplante Auto-Kontrollen stehen", () => {
  it("Commit-Pfad filtert die noch nicht ausgelösten Auto-Zeilen aus der Abfrage", async () => {
    await mcpWithdraw("sub", { target: "inspection" });

    expect(kontrollFindManyMock).toHaveBeenCalledTimes(1);
    expect(kontrollFindManyMock.mock.calls[0][0].where).toEqual(EXPECTED_WHERE);
  });

  it("zieht nur zurück, was die Abfrage liefert — je Zeile genau ein resolveKontrolle", async () => {
    kontrollFindManyMock.mockResolvedValue([{ id: "k-manuell" }]);

    const r = await mcpWithdraw("sub", { target: "inspection" }) as { withdrawn: number };

    expect(r.withdrawn).toBe(1);
    expect(resolveKontrolle).toHaveBeenCalledTimes(1);
    expect(resolveKontrolle).toHaveBeenCalledWith("k-manuell", "withdraw", "ai");
  });

  it("dryRun zählt nach derselben Regel — sonst verspräche die Vorschau einen anderen Umfang", async () => {
    await mcpWithdraw("sub", { target: "inspection", dryRun: true });

    expect(kontrollCountMock).toHaveBeenCalledTimes(1);
    expect(kontrollCountMock.mock.calls[0][0].where).toEqual(EXPECTED_WHERE);
  });
});

describe("request_inspection macht eine geklemmte Verzögerung kenntlich", () => {
  // 242 ist der Wert aus dem Vorfall: er lag über dem alten Cap von 65 und muss heute durchgehen.
  it.each([
    ["innerhalb des Bereichs — unverändert, kein Hinweis", 242, 242, false],
    ["über dem Maximum — geklemmt und benannt", INSPECTION_DELAY_RANGE.max + 100, INSPECTION_DELAY_RANGE.max, true],
    ["unter dem Minimum — geklemmt und benannt", 2, INSPECTION_DELAY_RANGE.min, true],
    ["0 = sofort — nichts wurde ersetzt, also kein Hinweis", 0, 0, false],
    // Negativ ist die dokumentierte Kurzform für „sofort", keine verletzte Grenze: hier einen
    // Kappungs-Hinweis zu melden wäre derselbe Fehler in die andere Richtung.
    ["negativ = ebenfalls sofort — und ebenfalls ohne Hinweis", -30, 0, false],
  ])("%s", async (_name, angefragt, erwartet, mitHinweis) => {
    const r = await mcpRequestInspection("sub", { delayMinutes: angefragt }) as {
      delayMinutes: number; requestedDelayMinutes: number | null; delayNote: string | null; message: string;
    };

    expect(requestKontrolleMock.mock.calls[0][0].delayMinutes).toBe(erwartet);
    expect(r.delayMinutes).toBe(erwartet);
    expect(r.requestedDelayMinutes).toBe(angefragt);
    if (mitHinweis) {
      // Der Hinweis muss den ANGEFRAGTEN Wert nennen — sonst merkt der Aufrufer nicht, dass es seiner war.
      expect(r.delayNote).toContain(`${angefragt} min`);
      expect(r.message).toContain("NOT applied");
    } else {
      expect(r.delayNote).toBeNull();
      expect(r.message).not.toContain("NOT applied");
    }
  });

  it("ohne Angabe bleibt es beim engen Zufalls-Fenster — der höhere Cap gilt nur auf Verlangen", async () => {
    for (let i = 0; i < 40; i++) {
      requestKontrolleMock.mockClear();
      await mcpRequestInspection("sub", {});
      const gezogen = requestKontrolleMock.mock.calls[0][0].delayMinutes;
      expect(gezogen).toBeGreaterThanOrEqual(INSPECTION_RANDOM_DELAY.min);
      expect(gezogen).toBeLessThanOrEqual(INSPECTION_RANDOM_DELAY.max);
    }
  });

  it("dryRun weist dieselbe Kappung aus, bevor irgendetwas angelegt wird", async () => {
    const r = await mcpRequestInspection("sub", { delayMinutes: 5000, dryRun: true }) as {
      preview: { delayMinutes: number; requestedDelayMinutes: number | null; delayNote: string | null };
    };

    expect(requestKontrolle).not.toHaveBeenCalled();
    expect(r.preview.delayMinutes).toBe(INSPECTION_DELAY_RANGE.max);
    expect(r.preview.requestedDelayMinutes).toBe(5000);
    expect(r.preview.delayNote).toContain("NOT applied");
  });

  it("dryRun ohne Angabe nennt den Zufallsfall als solchen statt einer Zahl", async () => {
    const r = await mcpRequestInspection("sub", { dryRun: true }) as {
      preview: { delayMinutes: string; requestedDelayMinutes: number | null; delayNote: string | null };
    };

    expect(r.preview.delayMinutes).toContain("random");
    expect(r.preview.requestedDelayMinutes).toBeNull();
    expect(r.preview.delayNote).toBeNull();
  });
});

/**
 * Vorfall 07.08.2026: `resolve_inspection` suchte die zu beurteilende Kontrolle über die
 * `KontrollAnforderung`. Eine freiwillige Selbstkontrolle hat keine — der Keyholder bekam
 * „No submitted inspection", obwohl ein Foto vorlag. Adressiert wird deshalb der EINTRAG.
 */
describe("resolve_inspection findet auch die Selbstkontrolle", () => {
  const entryFindFirstMock = prisma.entry.findFirst as unknown as ReturnType<typeof vi.fn>;
  const kontrollFindFirstMock = prisma.kontrollAnforderung.findFirst as unknown as ReturnType<typeof vi.fn>;
  const resolveEntryMock = resolveInspectionEntry as unknown as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    resolveEntryMock.mockResolvedValue({ ok: true, data: { userId: "u1", notified: true } });
  });

  it("beurteilt den jüngsten Kontroll-Eintrag, ohne nach einer Anforderung zu suchen", async () => {
    entryFindFirstMock.mockResolvedValue({ id: "e-selbst", verifikationStatus: null });

    await mcpResolveInspection("sub", { action: "verify" });

    expect(resolveInspectionEntry).toHaveBeenCalledWith("e-selbst", "manuallyVerify", "ai");
    // Die Anforderung darf für die AUSWAHL keine Rolle mehr spielen — sonst bliebe die
    // Selbstkontrolle wieder unauffindbar.
    expect(kontrollFindFirstMock).not.toHaveBeenCalled();
  });

  it("wählt nach Einreich-Zeitpunkt, nicht nach der frei wählbaren Eintrags-Zeit", async () => {
    entryFindFirstMock.mockResolvedValue({ id: "e1", verifikationStatus: null });

    await mcpResolveInspection("sub", { action: "reject" });

    const arg = entryFindFirstMock.mock.lastCall?.[0];
    // Beurteilt wird ein FOTO: eine nachgetragene Kontrolle ohne Bild ist keine Einreichung und
    // dürfte die echte nicht verdecken.
    expect(arg.where).toMatchObject({ userId: "u1", type: "PRUEFUNG", imageUrl: { not: null } });
    // `startTime` ist vom Sub wählbar; nur `createdAt` bildet die Reihenfolge der Einreichungen ab.
    expect(arg.orderBy).toEqual({ createdAt: "desc" });
    expect(resolveInspectionEntry).toHaveBeenCalledWith("e1", "reject", "ai");
  });

  it("beurteilt mit `id` GENAU diese Einreichung", async () => {
    // Die Oberfläche urteilt je Zeile, auch über ältere Einreichungen. Ohne diesen Weg wäre eine
    // übersehene Kontrolle für die KI unerreichbar — sie träfe immer nur die jüngste.
    entryFindFirstMock.mockResolvedValue({ id: "e-alt", verifikationStatus: null });

    await mcpResolveInspection("sub", { action: "verify", id: "e-alt" });

    expect(entryFindFirstMock.mock.lastCall?.[0].where).toMatchObject({ id: "e-alt", imageUrl: { not: null } });
    expect(resolveInspectionEntry).toHaveBeenCalledWith("e-alt", "manuallyVerify", "ai");
  });

  it("sagt bei unbekannter id, woran es liegen kann", async () => {
    // „not found" liesse offen, ob die id falsch ist, zu einem anderen Träger gehört oder auf eine
    // Prüfung ohne Foto zeigt — drei verschiedene Fehler mit demselben Satz.
    entryFindFirstMock.mockResolvedValue(null);

    await expect(mcpResolveInspection("sub", { action: "verify", id: "gibts-nicht" }))
      .rejects.toThrow(/id gibts-nicht .*PRUEFUNG entry with a photo/);
  });

  it("ohne jede Kontrolle bleibt es bei der klaren Fehlermeldung", async () => {
    entryFindFirstMock.mockResolvedValue(null);

    await expect(mcpResolveInspection("sub", { action: "verify" })).rejects.toThrow(/No submitted inspection/);
    expect(resolveInspectionEntry).not.toHaveBeenCalled();
  });
});
