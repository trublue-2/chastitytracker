import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Der Fristen-Joker (`inspectionJoker.ts`). Gepinnt werden die Zusagen, auf denen die Funktion steht:
 * nur VOR Fristende, einmal je Kontrolle, nur mit Guthaben, nie nach Reinigung/Verschluss, Kappung am
 * Schlaf-Fenster — und dass ein Wettlauf beim Einsatz nie zwei Joker oder einen ohne Guthaben ergibt.
 */

const tx = {
  kontrollAnforderung: { findUnique: vi.fn(), updateMany: vi.fn() },
  user: { updateMany: vi.fn(), findUniqueOrThrow: vi.fn() },
};
const prismaMock = {
  ...tx,
  $transaction: vi.fn(async (cb: (t: typeof tx) => unknown) => cb(tx)),
};
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
const notifyControllers = vi.fn();
vi.mock("@/lib/notify", () => ({ notifyControllers, notifyUser: vi.fn(), deliverToChannels: vi.fn(), NOTIFY_RECIPIENT_SELECT: {} }));
vi.mock("@/lib/keyholder", () => ({ getControllerAudience: vi.fn(async () => ({ controllers: [{ id: "kh" }], username: "sub" })) }));
vi.mock("@/lib/appMeta", () => ({ markLastAction: vi.fn() }));

const { jokerDeadline, jokerOffer, spendInspectionJoker, normalizeJokerReason } = await import("./inspectionJoker");
const { autoKontrolleSettingsFromUser } = await import("./autoKontrolleService");
const { ALL_WEEKDAYS } = await import("./weekdays");

const TZ = "Europe/Zurich";
/** 14:00 Zürcher Sommerzeit — mitten im Wachen. */
const NOW = new Date("2026-06-15T12:00:00Z");
const MIN = 60_000;

const SLEEP_FIELDS = {
  autoKontrolleAktiv: false,
  autoKontrollePerDayMin: 0, autoKontrollePerDayMax: 0,
  autoKontrolleRuheVon: "22:00", autoKontrolleRuheBis: "06:00",
  autoKontrolleFristVon: 15, autoKontrolleFristBis: 60,
  autoKontrolleFensterVon: "", autoKontrolleFensterBis: "",
  autoKontrolleNurBeiSperre: false,
  autoKontrolleDays: ALL_WEEKDAYS, autoKontrolleDayRules: null as string | null,
  postLockInspectionEnabled: false, postLockInspectionDelayMin: 15,
  postLockInspectionDelayMax: 45, postLockInspectionDeadlineMinutes: 15,
  postLockInspectionRequireBoxPhoto: false,
};
const SLEEP = autoKontrolleSettingsFromUser(SLEEP_FIELDS);
const USER = { inspectionJokerBalance: 2, inspectionJokerMinutes: 60 };

function ka(over: Partial<Parameters<typeof jokerDeadline>[0]> = {}) {
  return {
    deadline: new Date(NOW.getTime() + 30 * MIN),
    entryId: null, withdrawnAt: null, autoMarkedRemovedAt: null,
    wirksamAb: null, benachrichtigtAt: NOW,
    cleaningRelock: false, postLock: false, jokerPreviousDeadline: null as Date | null,
    ...over,
  };
}

describe("jokerDeadline — wann er angeboten wird", () => {
  it("verschiebt eine laufende Frist um den eingestellten Aufschub", () => {
    const k = ka();
    expect(jokerDeadline(k, USER, SLEEP, NOW, TZ)).toEqual(new Date(k.deadline.getTime() + 60 * MIN));
  });

  it("nicht ohne Guthaben", () => {
    expect(jokerDeadline(ka(), { ...USER, inspectionJokerBalance: 0 }, SLEEP, NOW, TZ)).toBeNull();
  });

  it("nicht nach Fristende — sonst erliesse sich der Träger das Vergehen selbst", () => {
    expect(jokerDeadline(ka({ deadline: new Date(NOW.getTime() - MIN) }), USER, SLEEP, NOW, TZ)).toBeNull();
    expect(jokerDeadline(ka({ deadline: NOW }), USER, SLEEP, NOW, TZ)).toBeNull();
  });

  it("nur einmal je Kontrolle", () => {
    expect(jokerDeadline(ka({ jokerPreviousDeadline: NOW }), USER, SLEEP, NOW, TZ)).toBeNull();
  });

  it("nie für die Kontrolle nach einer Reinigungspause oder einem Verschluss", () => {
    expect(jokerDeadline(ka({ cleaningRelock: true }), USER, SLEEP, NOW, TZ)).toBeNull();
    expect(jokerDeadline(ka({ postLock: true }), USER, SLEEP, NOW, TZ)).toBeNull();
  });

  it("nicht für eine erfüllte, zurückgezogene, gebuchte oder noch verborgene Kontrolle", () => {
    expect(jokerDeadline(ka({ entryId: "e1" }), USER, SLEEP, NOW, TZ)).toBeNull();
    expect(jokerDeadline(ka({ withdrawnAt: NOW }), USER, SLEEP, NOW, TZ)).toBeNull();
    expect(jokerDeadline(ka({ autoMarkedRemovedAt: NOW }), USER, SLEEP, NOW, TZ)).toBeNull();
    expect(jokerDeadline(ka({ wirksamAb: new Date(NOW.getTime() + MIN), benachrichtigtAt: null }), USER, SLEEP, NOW, TZ)).toBeNull();
  });

  it("klemmt einen unsinnigen Aufschub auf den erlaubten Bereich", () => {
    const k = ka();
    expect(jokerDeadline(k, { ...USER, inspectionJokerMinutes: 5 }, SLEEP, NOW, TZ)).toEqual(new Date(k.deadline.getTime() + 30 * MIN));
  });
});

describe("jokerDeadline — Schlaf-Fenster", () => {
  it("endet vor dem Schlaf, wenn die alte Frist im Wachen liegt", () => {
    // Frist 21:30 Ortszeit, Schlaf ab 22:00: aus +60 werden +30.
    const k = ka({ deadline: new Date("2026-06-15T19:30:00Z") });
    expect(jokerDeadline(k, USER, SLEEP, NOW, TZ)).toEqual(new Date("2026-06-15T20:00:00Z"));
  });

  it("wird nicht angeboten, wenn vor dem Schlaf zu wenig Aufschub bleibt", () => {
    // Frist 21:50, Schlaf ab 22:00: nur 10 min Gewinn.
    expect(jokerDeadline(ka({ deadline: new Date("2026-06-15T19:50:00Z") }), USER, SLEEP, NOW, TZ)).toBeNull();
  });

  it("ohne Schlaf-Fenster (von = bis) wird nie gekappt", () => {
    const awake = autoKontrolleSettingsFromUser({ ...SLEEP_FIELDS, autoKontrolleRuheVon: "00:00", autoKontrolleRuheBis: "00:00" });
    const k = ka({ deadline: new Date("2026-06-15T19:30:00Z") });
    expect(jokerDeadline(k, USER, awake, NOW, TZ)).toEqual(new Date(k.deadline.getTime() + 60 * MIN));
  });

  it("findet den Schlaf-Beginn auch über Mitternacht", () => {
    // Schlaf 00:30–06:00, Frist 23:50 Ortszeit: aus +60 werden +40.
    const late = autoKontrolleSettingsFromUser({ ...SLEEP_FIELDS, autoKontrolleRuheVon: "00:30", autoKontrolleRuheBis: "06:00" });
    const k = ka({ deadline: new Date("2026-06-15T21:50:00Z") });
    expect(jokerDeadline(k, USER, late, NOW, TZ)).toEqual(new Date("2026-06-15T22:30:00Z"));
  });

  it("kappt nicht, wenn die Frist schon im Schlaf liegt — das hat die Keyholderin so gestellt", () => {
    const k = ka({ deadline: new Date("2026-06-15T21:00:00Z") }); // 23:00 Ortszeit
    expect(jokerDeadline(k, USER, SLEEP, NOW, TZ)).toEqual(new Date(k.deadline.getTime() + 60 * MIN));
  });
});

describe("jokerOffer", () => {
  it("nennt den tatsächlichen Aufschub und das Guthaben vor dem Einsatz", () => {
    const k = ka({ deadline: new Date("2026-06-15T19:30:00Z") });
    expect(jokerOffer(k, { ...USER, ...SLEEP_FIELDS }, NOW, TZ)).toEqual({
      newDeadline: "2026-06-15T20:00:00.000Z", minutes: 30, balance: 2,
    });
  });
});

describe("normalizeJokerReason", () => {
  it("leer und Fremdtypen sind kein Grund, langer Text wird gekürzt", () => {
    expect(normalizeJokerReason("  ")).toBeNull();
    expect(normalizeJokerReason(42)).toBeNull();
    expect(normalizeJokerReason(" Autofahrt ")).toBe("Autofahrt");
    expect(normalizeJokerReason("x".repeat(500))).toHaveLength(200);
  });
});

describe("spendInspectionJoker", () => {
  const row = (over: Record<string, unknown> = {}) => ({
    id: "k1", userId: "u1", ...ka(),
    user: { ...SLEEP_FIELDS, id: "u1", timezone: TZ, autoInspectionPlannedFor: null, ...USER },
    ...over,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    tx.kontrollAnforderung.findUnique.mockResolvedValue(row());
    tx.kontrollAnforderung.updateMany.mockResolvedValue({ count: 1 });
    tx.user.updateMany.mockResolvedValue({ count: 1 });
    tx.user.findUniqueOrThrow.mockResolvedValue({ inspectionJokerBalance: 1 });
  });

  it("verschiebt die Frist, zieht einen Joker ab und meldet es der Keyholderin", async () => {
    const result = await spendInspectionJoker("k1", "u1", "Autofahrt");
    expect(result).toEqual({ ok: true, data: { deadline: new Date(NOW.getTime() + 90 * MIN), balance: 1 } });

    const { where, data } = tx.kontrollAnforderung.updateMany.mock.calls[0][0];
    // Bedingt auf die gelesene Frist und „noch nicht abgelaufen" — der Kern gegen den Wettlauf.
    expect(where).toMatchObject({ id: "k1", jokerPreviousDeadline: null, entryId: null, deadline: { gt: NOW } });
    expect(data).toMatchObject({ jokerPreviousDeadline: new Date(NOW.getTime() + 30 * MIN), benachrichtigtReminderAt: null });
    expect(tx.user.updateMany.mock.calls[0][0]).toMatchObject({ where: { inspectionJokerBalance: { gt: 0 } } });

    expect(notifyControllers).toHaveBeenCalledWith("u1", [{ id: "kh" }], expect.objectContaining({
      messageKey: "inspectionJokerUsedReasonMessageKeyholder",
      params: expect.objectContaining({ reason: "Autofahrt", balance: 1 }),
    }));
  });

  it("ohne Grund die Meldung ohne Grund", async () => {
    await spendInspectionJoker("k1", "u1", null);
    expect(notifyControllers.mock.calls[0][2].messageKey).toBe("inspectionJokerUsedMessageKeyholder");
  });

  it("eine fremde Kontrolle ist wie keine", async () => {
    tx.kontrollAnforderung.findUnique.mockResolvedValue(row({ userId: "other" }));
    expect(await spendInspectionJoker("k1", "u1", null)).toMatchObject({ ok: false, status: 404 });
    expect(tx.kontrollAnforderung.updateMany).not.toHaveBeenCalled();
  });

  it("lehnt ab, wenn die Regel keinen Joker zulässt — ohne zu schreiben", async () => {
    tx.kontrollAnforderung.findUnique.mockResolvedValue(row({ jokerPreviousDeadline: NOW }));
    expect(await spendInspectionJoker("k1", "u1", null)).toMatchObject({ ok: false, error: "INSPECTION_JOKER_UNAVAILABLE" });
    expect(tx.kontrollAnforderung.updateMany).not.toHaveBeenCalled();
  });

  it("Doppelklick: hat ein paralleler Einsatz die Kontrolle schon getroffen, kostet der zweite nichts", async () => {
    tx.kontrollAnforderung.updateMany.mockResolvedValue({ count: 0 });
    expect(await spendInspectionJoker("k1", "u1", null)).toMatchObject({ ok: false, error: "INSPECTION_JOKER_UNAVAILABLE" });
    expect(tx.user.updateMany).not.toHaveBeenCalled();
    expect(notifyControllers).not.toHaveBeenCalled();
  });

  it("Guthaben inzwischen leer: die Transaktion bricht ab, statt einen Joker ohne Deckung zu buchen", async () => {
    tx.user.updateMany.mockResolvedValue({ count: 0 });
    expect(await spendInspectionJoker("k1", "u1", null)).toMatchObject({ ok: false, error: "INSPECTION_JOKER_UNAVAILABLE" });
    expect(notifyControllers).not.toHaveBeenCalled();
  });
});
