import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Der Gesundheits-Halt war bis v6.0.2 eine Zeile ohne Wirkung: gesetzt werden konnte er nur über den
 * MCP, gelesen wurde er an zwei Stellen (Wiege-Meldepflicht, Gewichts-Freigabe), und die Poller
 * kannten ihn gar nicht. Eine automatische Kontrolle traf den kranken Träger also weiterhin, blieb
 * unerfüllt, und das Vergehen entstand von selbst — ohne dass jemand eine Fehlentscheidung getroffen
 * hätte (Issue #91 samt Kommentar).
 *
 * Diese Datei prüft die beiden Hälften, die keine andere Stelle prüfen kann: die Spannen-Rechnung,
 * an der die ganze Straffreiheit hängt, und die beiden Seiteneffekte des Schreibvorgangs.
 */

vi.mock("@/lib/prisma", () => ({
  prisma: { $transaction: vi.fn(), healthHold: { findMany: vi.fn(async () => []) } },
}));
vi.mock("@/lib/notify", () => ({ notifyUser: vi.fn() }));

import { isPausedAt, writeHealthHold, setHealthHold, toHealthHoldSpans, NOT_PAUSED_WHERE, USER_NOT_PAUSED_WHERE, type HealthHoldSpan } from "./healthHold";
import { prisma } from "@/lib/prisma";
import { notifyUser } from "@/lib/notify";

const T = (iso: string) => new Date(iso);

describe("isPausedAt", () => {
  const laufend: HealthHoldSpan[] = [{ from: T("2026-08-01T10:00:00Z"), to: null }];
  const beendet: HealthHoldSpan[] = [{ from: T("2026-08-01T10:00:00Z"), to: T("2026-08-03T08:00:00Z") }];

  it("ein laufender Halt deckt alles ab seinem Beginn", () => {
    expect(isPausedAt(laufend, T("2026-08-01T09:59:59Z"))).toBe(false);
    expect(isPausedAt(laufend, T("2026-08-05T00:00:00Z"))).toBe(true);
  });

  it("ein beendeter Halt deckt genau seine Spanne", () => {
    expect(isPausedAt(beendet, T("2026-08-02T00:00:00Z"))).toBe(true);
    expect(isPausedAt(beendet, T("2026-08-03T08:00:01Z"))).toBe(false);
  });

  // Die Grenzen zählen mit: wer um 10:00 eine Pause setzt, meint sie ab 10:00. Eine Tat in genau
  // dieser Sekunde als ungedeckt zu behandeln wäre eine Spitzfindigkeit gegen den Träger.
  it("Beginn und Ende zählen zur Pause", () => {
    expect(isPausedAt(beendet, T("2026-08-01T10:00:00Z"))).toBe(true);
    expect(isPausedAt(beendet, T("2026-08-03T08:00:00Z"))).toBe(true);
  });

  it("mehrere Spannen: die Lücke dazwischen ist nicht pausiert", () => {
    const zwei: HealthHoldSpan[] = [
      { from: T("2026-08-01T00:00:00Z"), to: T("2026-08-02T00:00:00Z") },
      { from: T("2026-08-05T00:00:00Z"), to: null },
    ];
    expect(isPausedAt(zwei, T("2026-08-03T12:00:00Z"))).toBe(false);
    expect(isPausedAt(zwei, T("2026-08-06T12:00:00Z"))).toBe(true);
  });

  it("ohne Halt ist nie etwas pausiert", () => {
    expect(isPausedAt([], T("2026-08-01T10:00:00Z"))).toBe(false);
  });

  it("toHealthHoldSpans formt die Rohzeilen um — die EINE Umwandlung, die das Strafbuch nimmt", () => {
    expect(toHealthHoldSpans([{ createdAt: T("2026-08-01T00:00:00Z"), resolvedAt: null }]))
      .toEqual([{ from: T("2026-08-01T00:00:00Z"), to: null }]);
  });
});

describe("writeHealthHold", () => {
  const NOW = T("2026-08-10T12:00:00Z");
  const PAUSE_START = T("2026-08-08T12:00:00Z"); // zwei Tage vorher
  let tx: {
    healthHold: { findFirst: ReturnType<typeof vi.fn>; updateMany: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> };
    kontrollAnforderung: { updateMany: ReturnType<typeof vi.fn> };
    task: { findMany: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const asTx = () => tx as any;

  beforeEach(() => {
    vi.clearAllMocks();
    tx = {
      healthHold: {
        findFirst: vi.fn(async () => null),
        updateMany: vi.fn(async () => ({ count: 1 })),
        create: vi.fn(async () => ({ id: "h1", active: true, reason: "Grippe", createdAt: NOW, resolvedAt: null })),
      },
      kontrollAnforderung: { updateMany: vi.fn(async () => ({ count: 2 })) },
      task: { findMany: vi.fn(async () => []), update: vi.fn(async () => ({})) },
    };
  });

  it("beim Einschalten fallen die offenen Kontrollen — auch die nur geplanten", async () => {
    const res = await writeHealthHold(asTx(), "u1", { active: true, reason: "Grippe" }, NOW);

    expect(res.withdrawnInspections).toBe(2);
    const where = tx.kontrollAnforderung.updateMany.mock.calls[0][0].where;
    // Eine bereits erfüllte oder zurückgezogene Zeile bleibt unangetastet: der Rückzug gilt dem, was
    // der Träger noch schuldet, nicht seiner Historie.
    expect(where).toMatchObject({ userId: "u1", entryId: null, fulfilledAt: null, withdrawnAt: null });
  });

  it("ein zweites Einschalten löst den alten Halt auf, statt zwei aktive stehen zu lassen", async () => {
    tx.healthHold.findFirst.mockResolvedValue({ id: "alt", active: true, reason: "Fieber", createdAt: PAUSE_START, resolvedAt: null });

    const res = await writeHealthHold(asTx(), "u1", { active: true, reason: "Grippe" }, NOW);

    expect(tx.healthHold.updateMany).toHaveBeenCalledWith({
      where: { userId: "u1", active: true },
      data: { active: false, resolvedAt: NOW },
    });
    expect(res.before).toEqual({ active: true, reason: "Fieber" });
  });

  it("beim Aufheben rücken die Fristen der offenen Aufgaben um die Pausendauer nach", async () => {
    tx.healthHold.findFirst.mockResolvedValue({ id: "h1", active: true, reason: "Grippe", createdAt: PAUSE_START, resolvedAt: null });
    // Vor der Pause gestellt, Frist mitten in der Pause: verloren sind die vollen zwei Tage.
    tx.task.findMany.mockResolvedValue([
      { id: "t1", createdAt: T("2026-08-07T12:00:00Z"), wirksamAb: null, holdUntil: T("2026-08-09T12:00:00Z") },
    ]);

    const res = await writeHealthHold(asTx(), "u1", { active: false, reason: null }, NOW);

    expect(res.shiftedTasks).toBe(1);
    expect(tx.task.update).toHaveBeenCalledWith({
      where: { id: "t1" },
      data: {
        // Nullpunkt war `createdAt` (kein `wirksamAb`) → 07.08. + 2 Tage. Die relativen Fristen
        // (Kulanz, Nachweis-Offsets) hängen daran und wandern damit von selbst mit.
        wirksamAb: T("2026-08-09T12:00:00Z"),
        holdUntil: T("2026-08-11T12:00:00Z"),
      },
    });
  });

  // Sonst bekäme eine Aufgabe, die zwei Minuten vor dem Aufheben gestellt wurde, zwei Tage geschenkt.
  it("eine WÄHREND der Pause gestellte Aufgabe rückt nur um ihre eigene verlorene Zeit nach", async () => {
    tx.healthHold.findFirst.mockResolvedValue({ id: "h1", active: true, reason: "Grippe", createdAt: PAUSE_START, resolvedAt: null });
    tx.task.findMany.mockResolvedValue([
      { id: "t2", createdAt: T("2026-08-09T12:00:00Z"), wirksamAb: T("2026-08-09T12:00:00Z"), holdUntil: T("2026-08-12T12:00:00Z") },
    ]);

    await writeHealthHold(asTx(), "u1", { active: false, reason: null }, NOW);

    // Ein Tag verloren, nicht zwei.
    expect(tx.task.update).toHaveBeenCalledWith({
      where: { id: "t2" },
      data: { wirksamAb: T("2026-08-10T12:00:00Z"), holdUntil: T("2026-08-13T12:00:00Z") },
    });
  });

  it("das Aufheben ohne laufenden Halt ist ein No-Op, kein Fehler", async () => {
    const res = await writeHealthHold(asTx(), "u1", { active: false, reason: null }, NOW);

    expect(res.row).toBeNull();
    expect(res.shiftedTasks).toBe(0);
    expect(tx.task.findMany).not.toHaveBeenCalled();
    expect(tx.healthHold.updateMany).not.toHaveBeenCalled();
  });
});

/**
 * Die Zusage „während der Pause erreicht ihn keine Direktive" hat ZWEI Hälften, und die zweite war
 * beim ersten Anlauf vergessen: das Gate der Zustellung (`dueForDispatchWhere`) fasst nur
 * TERMINIERTE Zeilen. Eine sofort gestellte Kontrolle ging mitten in der Pause hinaus, während ihr
 * terminierter Zwilling wartete — und der Posteingang des Trägers sagte ihm gerade zu, dass keine
 * kommen. Dieser Block hält die vier Erstell-Wege dagegen; er liest sie als TEXT, weil ein echter
 * Aufruf für jeden von ihnen Attrappen für Prisma, Mail, Push und Posteingang bräuchte
 * (Bauart wie `appName.test.ts`).
 */
describe("Die Erstell-Dienste prüfen den Halt selbst", () => {
  const files = {
    "kontrolleService.ts": readFileSync("src/lib/kontrolleService.ts", "utf8"),
    "verschlussAnforderungService.ts": readFileSync("src/lib/verschlussAnforderungService.ts", "utf8"),
    "orgasmusAnforderungService.ts": readFileSync("src/lib/orgasmusAnforderungService.ts", "utf8"),
    // Die Aufgabe prüft in `checkTask`, nicht in `createTask` — damit die MCP-dryRun-Vorschau
    // dieselbe Absage zeigt, statt Erfolg für einen Commit zu versprechen, der mit 409 endet.
    "taskService.ts": readFileSync("src/lib/taskService.ts", "utf8"),
  };

  it.each(Object.keys(files))("%s weist bei laufendem Halt ab", (name) => {
    const src = files[name as keyof typeof files];
    expect(src).toContain("isHealthHoldActive");
    expect(src).toContain("HEALTH_HOLD_ACTIVE");
  });

  it("die Aufgabe prüft in checkTask, damit die Vorschau dieselbe Absage zeigt", () => {
    const src = files["taskService.ts"];
    const check = src.slice(src.indexOf("export async function checkTask("), src.indexOf("const graceMin"));
    expect(check).toContain("isHealthHoldActive");
  });
});

describe("NOT_PAUSED_WHERE / USER_NOT_PAUSED_WHERE", () => {
  // Der Wert selbst ist trivial; geprüft wird, dass es ihn GIBT und dass er die Relation nennt. Die
  // Wirkung hängt daran, dass jede auswählende Abfrage ihn mitführt statt nachträglich zu filtern —
  // ein Filter danach besetzt den `take`-Deckel eines Poller-Ticks für die Dauer der Pause.
  it("fragt über die Relation, nicht über eine vorher geladene Liste", () => {
    expect(NOT_PAUSED_WHERE).toEqual({ user: { healthHolds: { none: { active: true } } } });
    expect(USER_NOT_PAUSED_WHERE).toEqual({ healthHolds: { none: { active: true } } });
  });
});

describe("setHealthHold", () => {
  beforeEach(() => vi.clearAllMocks());

  // Dieselbe Schranke wie im MCP: die Pause setzt jede Direktive aus, und die Keyholderin muss in
  // einer Woche noch nachlesen können, warum.
  it("verlangt einen Grund zum Einschalten — und schreibt dann gar nichts", async () => {
    const res = await setHealthHold({ userId: "u1", active: true, reason: "   ", actor: "kh" });

    expect(res).toEqual({ ok: false, status: 400, error: "HEALTH_HOLD_REASON_REQUIRED" });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(notifyUser).not.toHaveBeenCalled();
  });

  it("das AUFHEBEN braucht keinen Grund — das Ende einer Pause erklärt sich selbst", async () => {
    (prisma.$transaction as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      row: null, before: { active: true, reason: "Grippe" }, withdrawnInspections: 0, shiftedTasks: 3,
    });

    const res = await setHealthHold({ userId: "u1", active: false, reason: null, actor: "kh" });

    expect(res.ok).toBe(true);
    // Der Träger erfährt es — ohne die Meldung wäre die Pause für ihn von einem Defekt nicht zu
    // unterscheiden.
    expect(notifyUser).toHaveBeenCalledWith("u1", expect.objectContaining({ messageKey: "healthHoldEndedMessage" }));
  });
});
