/**
 * Die Zeitzonen-Historie: Resolver und Schreibpfad.
 *
 * Warum es sie gibt: das Strafbuch beurteilt Vergangenes LIVE, und die Zone entscheidet mit, ob
 * eine Reinigungsöffnung im Fenster lag und an welchem Kalendertag sie aufs Kontingent zählte. Ohne
 * Historie las es die HEUTIGE Zone — eine Umstellung bewertete damit die ganze Vergangenheit neu,
 * und weil der Träger sie selbst setzen darf, war das eine selbstbediente Neubeurteilung.
 *
 * Der Doppelgänger unten folgt `cleaningRuleHistory.test.ts`: hier steht der Schreibpfad zur
 * Prüfung, und die Transaktion muss dieselben Modell-Mocks durchreichen, damit sichtbar wird, was
 * INNEN geschrieben wurde.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => {
  const timezoneChange = {
    count: vi.fn(async () => 0),
    createMany: vi.fn(async (_args: { data: unknown[] }) => ({ count: 0 })),
  };
  const user = {
    findUnique: vi.fn(async () => ({ timezone: "Europe/Zurich" }) as unknown),
    update: vi.fn(async () => ({})),
  };
  return {
    prisma: {
      user,
      timezoneChange,
      $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn({ user, timezoneChange })),
    },
  };
});

import { timezoneRulesFrom, setUserTimezone, TIMEZONE_EPOCH, fixedTimezone } from "./timezoneRules";
import { prisma } from "@/lib/prisma";

const at = (iso: string) => new Date(iso);
/** Die Zeilen, die der Schreibpfad angelegt hat — an zwei Stellen gebraucht. */
const writtenRows = (): unknown[] => {
  const [args] = vi.mocked(prisma.timezoneChange.createMany).mock.calls[0] ?? [];
  // `data` nimmt bei Prisma auch eine Einzelzeile — der Schreibpfad übergibt immer eine Liste.
  return (args?.data ?? []) as unknown[];
};

describe("Zeitzonen-Resolver", () => {
  it("nimmt die heutige Zone, solange es keine Historie gibt", () => {
    const tzAt = timezoneRulesFrom([], "Asia/Tokyo");
    expect(tzAt(at("2020-01-01T00:00:00Z"))).toBe("Asia/Tokyo");
  });

  it("liefert für einen vergangenen Zeitpunkt die damals geltende Zone", () => {
    const tzAt = timezoneRulesFrom([
      { timezone: "Europe/Zurich", effectiveFrom: TIMEZONE_EPOCH },
      { timezone: "Asia/Tokyo", effectiveFrom: at("2026-06-01T00:00:00Z") },
    ], "Asia/Tokyo");
    // Der springende Punkt: eine Öffnung im Mai wird weiterhin nach Zürich beurteilt, obwohl der
    // Träger inzwischen auf Tokio steht.
    expect(tzAt(at("2026-05-15T12:00:00Z"))).toBe("Europe/Zurich");
    expect(tzAt(at("2026-06-15T12:00:00Z"))).toBe("Asia/Tokyo");
  });

  it("fällt ohne Zone auf die App-Zone zurück statt auf undefined", () => {
    expect(timezoneRulesFrom([], null)(at("2026-01-01T00:00:00Z"))).toBe("Europe/Zurich");
  });

  it("bietet eine feste Fassung für Aufrufer ohne Historie", () => {
    expect(fixedTimezone("Asia/Tokyo")(at("1999-01-01T00:00:00Z"))).toBe("Asia/Tokyo");
  });
});

describe("Zeitzone umstellen", () => {
  beforeEach(() => vi.clearAllMocks());

  it("schreibt beim ersten Mal die Grundzeile mit", async () => {
    // Ohne die Grundzeile gäbe es eine Lücke von Epoch bis zur ersten Umstellung, in die jede
    // vergangene Öffnung fiele — und die würde dann nach der NEUEN Zone beurteilt.
    await setUserTimezone("u1", "Asia/Tokyo", { now: at("2026-06-01T00:00:00Z"), changedBy: "sub" });
    const rows = writtenRows();
    expect(rows).toEqual([
      { userId: "u1", timezone: "Europe/Zurich", effectiveFrom: TIMEZONE_EPOCH, changedBy: null },
      { userId: "u1", timezone: "Asia/Tokyo", effectiveFrom: at("2026-06-01T00:00:00Z"), changedBy: "sub" },
    ]);
  });

  it("schreibt keine Grundzeile, wenn es schon eine Historie gibt", async () => {
    vi.mocked(prisma.timezoneChange.count).mockResolvedValueOnce(2);
    await setUserTimezone("u1", "Asia/Tokyo", { now: at("2026-07-01T00:00:00Z") });
    const rows = writtenRows();
    expect(rows).toHaveLength(1);
  });

  it("schreibt keine Zeile, wenn sich nichts ändert", async () => {
    // Eine Historie hält Änderungen fest, nicht Klicks — sonst nennte `changedBy` irgendwann den,
    // der zuletzt bestätigt hat (gleiche Regel wie in `setCleaningSettings`).
    await setUserTimezone("u1", "Europe/Zurich", { now: at("2026-06-01T00:00:00Z") });
    expect(prisma.timezoneChange.createMany).not.toHaveBeenCalled();
    expect(prisma.user.update).toHaveBeenCalled();
  });

  it("weist eine ungültige Zone ab, statt sie zu speichern", async () => {
    await expect(setUserTimezone("u1", "Mars/Olympus")).rejects.toThrow();
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});
