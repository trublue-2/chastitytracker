import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Mehrere offene Sperrzeiten können koexistieren: eine geplante überlebt eine Öffnung (sie ist noch
 * nicht aktiv), und schliesst sich der Sub danach über eine Verschluss-Anforderung wieder ein, legt
 * `entries/route.ts` eine zweite, sofort aktive an. Die alte Auswahl in `mcpEditLockPeriod`
 * (`findFirst` + `orderBy createdAt desc`) traf die richtige nur zufällig — und der `withdraw`-Rückzug
 * meldete ein nacktes `count`, ohne zu sagen, dass eine geplante mitgegangen ist.
 */

vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: vi.fn() }, verschlussAnforderung: { findUnique: vi.fn() } },
}));
vi.mock("@/lib/queries", () => ({
  getUserDeviceOptions: vi.fn(),
  getKeyholderSperrzeiten: vi.fn(),
}));
vi.mock("@/lib/verschlussAnforderungService", () => ({
  createVerschlussAnforderung: vi.fn(),
  updateSperrzeitEnde: vi.fn(),
  withdrawVerschlussAnforderung: vi.fn(),
  withdrawVerschlussAnforderungById: vi.fn(),
}));

import { mcpEditLockPeriod, mcpWithdraw } from "./mcpWrite";
import { prisma } from "@/lib/prisma";
import { getKeyholderSperrzeiten } from "@/lib/queries";
import { updateSperrzeitEnde, withdrawVerschlussAnforderung, withdrawVerschlussAnforderungById, type WithdrawnDirective } from "@/lib/verschlussAnforderungService";

const userFind = prisma.user.findUnique as unknown as ReturnType<typeof vi.fn>;
const openMock = getKeyholderSperrzeiten as unknown as ReturnType<typeof vi.fn>;
const updateEndeMock = updateSperrzeitEnde as unknown as ReturnType<typeof vi.fn>;
const withdrawMock = withdrawVerschlussAnforderung as unknown as ReturnType<typeof vi.fn>;
const withdrawByIdMock = withdrawVerschlussAnforderungById as unknown as ReturnType<typeof vi.fn>;
const vaFindUnique = prisma.verschlussAnforderung.findUnique as unknown as ReturnType<typeof vi.fn>;

const NEUES_ENDE = "2026-09-01T00:00:00.000Z";
const IN_DREI_WOCHEN = new Date("2026-08-04T00:00:00Z");

/** S1: von der Keyholderin für in drei Wochen geplant — dem Sub unbekannt. Älter (zuerst angelegt). */
const geplant = {
  id: "s1",
  wirksamAb: IN_DREI_WOCHEN,
  benachrichtigtAt: null,
  endetAt: new Date("2026-08-11T00:00:00Z"),
  nachricht: null,
};
/** S2: beim Selbst-Einschluss auto-erzeugt (`entries/route.ts`) — sofort aktiv, dem Sub bekannt. Neuer. */
const ausgeloest = {
  id: "s2",
  wirksamAb: null,
  benachrichtigtAt: null, // die Falle: auto-erzeugt, trotzdem NICHT verborgen (wirksamAb === null)
  endetAt: new Date("2026-07-20T00:00:00Z"),
  nachricht: null,
};

beforeEach(() => {
  userFind.mockReset().mockResolvedValue({ id: "u1" });
  openMock.mockReset();
  updateEndeMock.mockReset().mockResolvedValue({ ok: true, data: { id: "x", userId: "u1", notified: true } });
  withdrawMock.mockReset();
  withdrawByIdMock.mockReset();
  vaFindUnique.mockReset();
});

describe("mcpEditLockPeriod — Zielwahl bei mehreren offenen Sperrzeiten", () => {
  it("nimmt die AUSGELÖSTE, nicht die zuletzt angelegte", async () => {
    // Der Kern des Bugs: sortiert man nach createdAt desc, gewinnt mal die eine, mal die andere.
    // Gemeint ist immer die laufende — die, die der Sub kennt und die gerade durchsetzt.
    openMock.mockResolvedValue([geplant, ausgeloest]); // geplante zuerst = "neueste" in der alten Logik
    const res = await mcpEditLockPeriod("kg", { untilAt: NEUES_ENDE });

    expect(updateEndeMock).toHaveBeenCalledWith("s2", new Date(NEUES_ENDE));
    expect(res.id).toBe("s2");
  });

  it("macht die Mehrdeutigkeit sichtbar: die unangetastete geplante wird als Datum gemeldet", async () => {
    openMock.mockResolvedValue([geplant, ausgeloest]);
    const res = await mcpEditLockPeriod("kg", { untilAt: NEUES_ENDE });

    expect(res.untouched).toEqual([{
      id: "s1",
      status: "scheduled",
      scheduledFor: "2026-08-04T02:00:00+02:00", // K-02: Offset-ISO (Europe/Zurich) statt Zulu
      endsAt: "2026-08-11T02:00:00+02:00",
      message: null,
    }]);
    expect(res.message).toContain("2 lock periods are open");
  });

  it("EINE offene Sperrzeit → nichts Unangetastetes, keine Mehrdeutigkeits-Notiz", async () => {
    openMock.mockResolvedValue([ausgeloest]);
    const res = await mcpEditLockPeriod("kg", { untilAt: NEUES_ENDE });

    expect(res.untouched).toEqual([]);
    expect(res.message).not.toContain("lock periods are open");
  });

  it("nur GEPLANTE offen → die neueste, und die Antwort sagt: nicht benachrichtigt", async () => {
    const zweiteGeplante = { ...geplant, id: "s3" };
    openMock.mockResolvedValue([zweiteGeplante, geplant]);
    updateEndeMock.mockResolvedValue({ ok: true, data: { id: "s3", userId: "u1", notified: false } });

    const res = await mcpEditLockPeriod("kg", { untilAt: NEUES_ENDE });
    expect(res.id).toBe("s3");
    expect(res.message).toContain("SCHEDULED");
    expect(res.message).toContain("NOT notified");
  });

  it("mit id lässt sich die geplante gezielt ansprechen", async () => {
    openMock.mockResolvedValue([geplant, ausgeloest]);
    const res = await mcpEditLockPeriod("kg", { untilAt: NEUES_ENDE, id: "s1" });

    expect(updateEndeMock).toHaveBeenCalledWith("s1", new Date(NEUES_ENDE));
    expect(res.id).toBe("s1");
  });

  it("eine fremde/geschlossene id wird abgelehnt, statt still die falsche zu ändern", async () => {
    openMock.mockResolvedValue([ausgeloest]);
    await expect(mcpEditLockPeriod("kg", { untilAt: NEUES_ENDE, id: "fremd" })).rejects.toThrow(/No open lock period with id/);
    expect(updateEndeMock).not.toHaveBeenCalled();
  });

  it("keine offene Sperrzeit → Fehler, kein Schreibzugriff", async () => {
    openMock.mockResolvedValue([]);
    await expect(mcpEditLockPeriod("kg", { indefinite: true })).rejects.toThrow(/No open lock period/);
    expect(updateEndeMock).not.toHaveBeenCalled();
  });
});

describe("mcpWithdraw target=lock_period — was genau ging mit?", () => {
  /** Die Antwort des Service IST die Quelle: Zähler UND Zeilen kommen aus derselben Transaktion, in
   *  der storniert wurde. `mcpWithdraw` liest die Zeilen bewusst NICHT selbst nach — täte es das,
   *  könnte ein Poller-Tick dazwischen die Liste vom Zähler abweichen lassen. Deshalb steht hier
   *  auch kein `openMock`: dass die Tests ohne ihn auskommen, ist der Beweis dafür. */
  const serviceResult = (rows: WithdrawnDirective[], hidden: number, notified: boolean) =>
    ({ ok: true, data: { count: rows.length, hidden, notified, rows } });

  it("aktiv + geplant getroffen → die Meldung benennt beide Anteile", async () => {
    withdrawMock.mockResolvedValue(serviceResult([ausgeloest, geplant], 1, true));
    const res = await mcpWithdraw("kg", { target: "lock_period" });

    expect(res.withdrawn).toBe(2);
    expect(res.hidden).toBe(1);
    expect(res.message).toContain("1 already triggered");
    expect(res.message).toContain("1 still SCHEDULED");
    expect(res.message).toContain("withdrawn silently");
  });

  it("benennt jede weggenommene Sperrzeit einzeln — die Zahl allein sagt nicht, WELCHE", async () => {
    // Der Kern des Befunds: der Rückzug ohne `id` ist ein Rundumschlag. Wer nur `withdrawn: 2` liest,
    // erfährt nicht, dass neben der laufenden auch die für in drei Wochen geplante mitging.
    withdrawMock.mockResolvedValue(serviceResult([ausgeloest, geplant], 1, true));
    const res = await mcpWithdraw("kg", { target: "lock_period" });

    expect(res.withdrawnItems).toEqual([
      { id: "s2", status: "triggered", scheduledFor: null, endsAt: expect.stringContaining("2026-07-20"), message: null, code: null },
      { id: "s1", status: "scheduled", scheduledFor: expect.stringContaining("2026-08-04"), endsAt: expect.stringContaining("2026-08-11"), message: null, code: null },
    ]);
  });

  it("die Sichtbarkeit je Zeile deckt sich mit `hidden` — Liste und Zähler zählen dasselbe", async () => {
    withdrawMock.mockResolvedValue(serviceResult([ausgeloest, geplant], 1, true));
    const res = await mcpWithdraw("kg", { target: "lock_period" });

    expect(res.withdrawnItems?.filter((i) => i.status === "scheduled")).toHaveLength(res.hidden!);
    expect(res.withdrawnItems).toHaveLength(res.withdrawn!);
  });

  it("nur Ausgelöste getroffen → keine Aufschlüsselung, Meldung wie bisher", async () => {
    withdrawMock.mockResolvedValue(serviceResult([ausgeloest], 0, true));
    const res = await mcpWithdraw("kg", { target: "lock_period" });

    expect(res.message).toContain("Withdrew 1 lock_period;");
    expect(res.message).not.toContain("SCHEDULED");
    expect(res.withdrawnItems).toEqual([expect.objectContaining({ id: "s2", status: "triggered" })]);
  });

  it("nur Geplante getroffen → der Sub erfuhr nichts, und die Antwort sagt das", async () => {
    withdrawMock.mockResolvedValue(serviceResult([geplant], 1, false));
    const res = await mcpWithdraw("kg", { target: "lock_period" });

    expect(res.message).toContain("NOT notified");
    expect(res.withdrawnItems).toEqual([expect.objectContaining({ id: "s1", status: "scheduled" })]);
  });

  it("mit id: der Status kommt vom Service, nicht vom Abbild von vorher", async () => {
    // Die Zeile wird VOR dem Rückzug gelesen (Besitz-Prüfung). Löst der Poller in der Lücke aus,
    // steht in diesem Abbild noch „nicht benachrichtigt", während der Service es besser weiss.
    // Die Antwort darf dann nicht gleichzeitig „scheduled" und „der Sub wurde benachrichtigt" sagen.
    vaFindUnique.mockResolvedValue({ ...geplant, userId: "u1", art: "SPERRZEIT" });
    withdrawByIdMock.mockResolvedValue({ ok: true, data: { userId: "u1", notified: true } });

    const res = await mcpWithdraw("kg", { target: "lock_period", id: "s1" });

    expect(res.hidden).toBe(0);
    expect(res.message).toContain("notified");
    expect(res.withdrawnItems).toEqual([expect.objectContaining({ id: "s1", status: "triggered" })]);
  });

  it("mit id: unausgelöst zurückgezogen → 'scheduled', und die Meldung schweigt darüber", async () => {
    vaFindUnique.mockResolvedValue({ ...geplant, userId: "u1", art: "SPERRZEIT" });
    withdrawByIdMock.mockResolvedValue({ ok: true, data: { userId: "u1", notified: false } });

    const res = await mcpWithdraw("kg", { target: "lock_period", id: "s1" });

    expect(res.hidden).toBe(1);
    expect(res.message).toContain("NOT notified");
    expect(res.withdrawnItems).toEqual([expect.objectContaining({ id: "s1", status: "scheduled" })]);
  });

  it("sagt, dass der Rückzug nicht öffnet — sonst sieht die haltende Box wie ein Fehler aus", async () => {
    // Vorfall 28.07.2026: Sperrzeit zurückgezogen, um die Box für ein Firmware-Update zu öffnen.
    // Die Antwort meldete Erfolg, die Box hielt weiter — korrekt (der Rückzug einer Frist ist keine
    // Öffnungs-Anweisung), aber nirgends gesagt.
    withdrawMock.mockResolvedValue(serviceResult([ausgeloest], 0, true));
    const res = await mcpWithdraw("kg", { target: "lock_period" });

    expect(res.message).toContain("NOT an instruction to open");
    expect(res.message).toContain("ENTRIES"); // der Weg zum Öffnen wird benannt
  });

  it("… und behauptet dabei KEINE Riegelstellung — die gilt bei Reinigungspause/ohne Box nicht", async () => {
    // Ein früherer Entwurf schrieb „der Riegel bleibt zu". Bei laufender Reinigungspause ist die Box
    // offen, ohne Heimdall gibt es gar keinen Riegel — eine zugesicherte Hardware-Folge, die nicht
    // gilt, ist schlechter als Schweigen: die Keyholder-KI gibt sie als Tatsache weiter.
    withdrawMock.mockResolvedValue(serviceResult([ausgeloest], 0, true));
    const res = await mcpWithdraw("kg", { target: "lock_period" });

    expect(res.message).not.toMatch(/bolt|stays shut|becomes an indefinite/i);
  });

  it("… aber nur bei lock_period — bei den anderen Zielen gibt es keine Hardware-Folge", async () => {
    withdrawMock.mockResolvedValue(serviceResult([ausgeloest], 0, true));
    const res = await mcpWithdraw("kg", { target: "lock_request" });

    expect(res.message).not.toContain("NOT an instruction to open");
  });

  it("nichts offen → leere Liste statt fehlendem Feld (die Form bleibt gleich)", async () => {
    withdrawMock.mockResolvedValue(serviceResult([], 0, false));
    const res = await mcpWithdraw("kg", { target: "lock_period" });

    expect(res.withdrawn).toBe(0);
    expect(res.withdrawnItems).toEqual([]);
  });
});
