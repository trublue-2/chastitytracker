import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Kern-Invariante: **verborgen ist nur, was TERMINIERT ist und noch nicht ausgelöst hat** —
 * `isHiddenFromSub` = `wirksamAb !== null && benachrichtigtAt === null`. Jede Meldung an den Sub
 * hängt daran; sie vorher zu senden verriete die geplante Direktive, was die Terminierung gerade
 * verhindern soll. Gemeldet als Bug am 14.07.2026: ein `edit_lock_period` auf eine drei Wochen voraus
 * geplante Sperrzeit schickte sofort eine „Sperrzeit geändert"-Mail.
 *
 * Die naheliegende Fassung „`benachrichtigtAt === null` = unbekannt" wäre FALSCH gewesen — siehe den
 * Test zur auto-erzeugten Sperrzeit unten. Der Unterschied ist der ganze Fix.
 */

const tx = {
  verschlussAnforderung: { findMany: vi.fn(), updateMany: vi.fn(), create: vi.fn() },
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    verschlussAnforderung: { findUnique: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  },
}));
vi.mock("@/lib/notify", () => ({ notifyUser: vi.fn() }));
vi.mock("@/lib/heimdallNotify", () => ({ notifyHeimdallForUserId: vi.fn() }));
vi.mock("@/lib/queries", () => ({ getIsLocked: vi.fn(async () => true), validateDeviceOwnership: vi.fn() }));
vi.mock("@/lib/mail", () => ({
  sendMailSafe: vi.fn(), escHtml: (s: string) => s, noticeBoxHtml: () => "", dashboardEmailHtml: () => "",
}));
vi.mock("@/lib/emailI18n", () => ({ emailT: async () => (k: string) => k, emailGreeting: () => "" }));
vi.mock("@/lib/push", () => ({ firePush: vi.fn() }));

import {
  createVerschlussAnforderung, withdrawVerschlussAnforderung, withdrawVerschlussAnforderungById,
  updateSperrzeitEnde,
} from "./verschlussAnforderungService";
import { prisma } from "@/lib/prisma";
import { notifyUser } from "@/lib/notify";
import { notifyHeimdallForUserId } from "@/lib/heimdallNotify";
import { getIsLocked } from "@/lib/queries";

const findUniqueMock = prisma.verschlussAnforderung.findUnique as unknown as ReturnType<typeof vi.fn>;
const updateMock = prisma.verschlussAnforderung.update as unknown as ReturnType<typeof vi.fn>;
const notifyMock = notifyUser as unknown as ReturnType<typeof vi.fn>;
const heimdallMock = notifyHeimdallForUserId as unknown as ReturnType<typeof vi.fn>;

const AUSGELOEST = new Date("2026-07-14T12:00:00Z");
const ZUKUNFT = new Date("2026-08-10T00:00:00Z");
/** Ein gültiges neues Ende: nach `jetzt` UND nach dem `wirksamAb` der geplanten Zeile (= ZUKUNFT).
 *  Ein Ende VOR der Auslösung lehnt der Service ab — siehe „Sperr-Ende muss nach der Auslösung liegen". */
const NEUES_ENDE = new Date("2026-09-01T00:00:00Z");

/** Terminiert, noch nicht ausgelöst → für den Sub unsichtbar. */
const geplant = { wirksamAb: ZUKUNFT, benachrichtigtAt: null };
/** Terminiert und vom Poller ausgelöst → der Sub hat die Mail bekommen. */
const ausgeloest = { wirksamAb: new Date("2026-07-01T00:00:00Z"), benachrichtigtAt: AUSGELOEST };
/** Sofort angelegt, Mail ging beim Anlegen raus (`createVerschlussAnforderung`). */
const sofort = { wirksamAb: null, benachrichtigtAt: AUSGELOEST };
/**
 * DIE FALLE: die Sperrzeit, die `entries/route.ts` automatisch anlegt, wenn der Sub eine
 * Verschluss-Anforderung erfüllt. Sie trägt WEDER `wirksamAb` NOCH `benachrichtigtAt` — niemand
 * musste eine Mail schicken, der Sub hat sich ja selbst eingeschlossen. Sie ist trotzdem sofort
 * aktiv und ihm bestens bekannt.
 */
const autoErzeugt = { wirksamAb: null, benachrichtigtAt: null };

/** Eine SPERRZEIT-Zeile, wie updateSperrzeitEnde sie liest. */
const sz = (zustand: object) => ({ userId: "u1", art: "SPERRZEIT", withdrawnAt: null, ...zustand });

const userMock = prisma.user.findUnique as unknown as ReturnType<typeof vi.fn>;
const isLockedMock = getIsLocked as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  tx.verschlussAnforderung.findMany.mockReset().mockResolvedValue([]);
  tx.verschlussAnforderung.updateMany.mockReset().mockResolvedValue({ count: 0 });
  tx.verschlussAnforderung.create.mockReset().mockResolvedValue({ id: "neu" });
  updateMock.mockReset().mockResolvedValue({});
  notifyMock.mockReset().mockResolvedValue(undefined);
  heimdallMock.mockReset();
  userMock.mockReset().mockResolvedValue({ id: "u1", email: "sub@example.invalid", username: "sub", locale: "de" });
  isLockedMock.mockReset().mockResolvedValue(true); // SPERRZEIT setzt einen verschlossenen User voraus
});

describe("updateSperrzeitEnde", () => {
  it("BUG 14.07.: eine GEPLANTE Sperrzeit zu ändern schickt KEINE Mail", async () => {
    findUniqueMock.mockResolvedValue(sz(geplant));
    const res = await updateSperrzeitEnde("s1", NEUES_ENDE);

    if (!res.ok) throw new Error("erwartet: ok");
    expect(res.data.notified).toBe(false);
    expect(notifyMock).not.toHaveBeenCalled();
    // Das neue Ende wird trotzdem gespeichert — der Poller liefert es bei Fälligkeit mit aus.
    expect(updateMock).toHaveBeenCalledWith({ where: { id: "s1" }, data: { endetAt: NEUES_ENDE } });
  });

  it("REGRESSION: die AUTO-ERZEUGTE Sperrzeit hat kein benachrichtigtAt — und muss trotzdem melden", async () => {
    // Hätte der Fix nur auf `benachrichtigtAt` geschaut, wäre für die häufigste Sperrzeit überhaupt
    // jede Meldung verschluckt worden: der Sub bliebe verschlossen im Glauben, eine längst
    // geänderte/zurückgezogene Sperre laufe noch weiter.
    findUniqueMock.mockResolvedValue(sz(autoErzeugt));
    const res = await updateSperrzeitEnde("s1", NEUES_ENDE);

    if (!res.ok) throw new Error("erwartet: ok");
    expect(res.data.notified).toBe(true);
    expect(notifyMock).toHaveBeenCalledTimes(1);
  });

  it("eine ausgelöste oder sofort angelegte Sperrzeit meldet wie bisher", async () => {
    for (const zustand of [ausgeloest, sofort]) {
      notifyMock.mockClear();
      findUniqueMock.mockResolvedValue(sz(zustand));
      const res = await updateSperrzeitEnde("s1", NEUES_ENDE);
      if (!res.ok) throw new Error("erwartet: ok");
      expect(res.data.notified).toBe(true);
      expect(notifyMock).toHaveBeenCalledTimes(1);
    }
  });

  it("auf unbefristet setzen folgt derselben Regel", async () => {
    findUniqueMock.mockResolvedValue(sz(geplant));
    const still = await updateSperrzeitEnde("s1", null);
    if (!still.ok) throw new Error("erwartet: ok");
    expect(still.data.notified).toBe(false);
    expect(notifyMock).not.toHaveBeenCalled();

    findUniqueMock.mockResolvedValue(sz(ausgeloest));
    const laut = await updateSperrzeitEnde("s1", null);
    if (!laut.ok) throw new Error("erwartet: ok");
    expect(laut.data.notified).toBe(true);
    expect(notifyMock).toHaveBeenCalledTimes(1);
  });

  it("die Guards greifen vor allem anderen — kein Schreiben, keine Meldung", async () => {
    findUniqueMock.mockResolvedValue(null);
    expect((await updateSperrzeitEnde("s1", NEUES_ENDE)).ok).toBe(false);

    findUniqueMock.mockResolvedValue(sz({ ...sofort, art: "ANFORDERUNG" }));
    expect((await updateSperrzeitEnde("s1", NEUES_ENDE)).ok).toBe(false);

    findUniqueMock.mockResolvedValue(sz({ ...sofort, withdrawnAt: new Date() }));
    expect((await updateSperrzeitEnde("s1", NEUES_ENDE)).ok).toBe(false);

    findUniqueMock.mockResolvedValue(sz(sofort));
    expect((await updateSperrzeitEnde("s1", new Date("2020-01-01"))).ok).toBe(false); // Ende in der Vergangenheit

    expect(notifyMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });
});

/**
 * BUG 14.07.: das Sperr-Ende wurde nur gegen `now` geprüft — bei einer TERMINIERTEN Sperrzeit passierte
 * damit ein Ende, das VOR ihrem Auslösezeitpunkt liegt. Massgeblich ist nicht `now`, sondern der
 * Zeitpunkt, ab dem die Sperre GILT (Begründung: `checkLockEnd`).
 */
describe("Sperr-Ende muss nach der Auslösung liegen", () => {
  const JETZT = new Date("2026-07-14T12:00:00Z");
  const MORGEN = new Date("2026-07-15T12:00:00Z");
  const IN_DREI_WOCHEN = new Date("2026-08-04T12:00:00Z");
  const DANACH = new Date("2026-08-20T12:00:00Z");

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(JETZT);
  });
  afterEach(() => vi.useRealTimers());

  describe("updateSperrzeitEnde", () => {
    it("terminiert: ein Ende VOR dem Auslösezeitpunkt wird abgelehnt (auch wenn es in der Zukunft liegt)", async () => {
      findUniqueMock.mockResolvedValue(sz({ wirksamAb: IN_DREI_WOCHEN, benachrichtigtAt: null }));
      const res = await updateSperrzeitEnde("s1", MORGEN);

      if (res.ok) throw new Error("erwartet: Fehler");
      expect(res.error).toBe("LOCK_PERIOD_END_MUST_BE_AFTER_TRIGGER");
      expect(updateMock).not.toHaveBeenCalled();
      expect(notifyMock).not.toHaveBeenCalled();
    });

    it("terminiert: ein Ende NACH dem Auslösezeitpunkt bleibt erlaubt", async () => {
      findUniqueMock.mockResolvedValue(sz({ wirksamAb: IN_DREI_WOCHEN, benachrichtigtAt: null }));
      const res = await updateSperrzeitEnde("s1", DANACH);

      expect(res.ok).toBe(true);
      expect(updateMock).toHaveBeenCalledWith({ where: { id: "s1" }, data: { endetAt: DANACH } });
    });

    it("Ende GENAU auf dem Auslösezeitpunkt ist eine Sperre der Länge null → abgelehnt", async () => {
      findUniqueMock.mockResolvedValue(sz({ wirksamAb: IN_DREI_WOCHEN, benachrichtigtAt: null }));
      const res = await updateSperrzeitEnde("s1", IN_DREI_WOCHEN);
      if (res.ok) throw new Error("erwartet: Fehler");
      expect(res.error).toBe("LOCK_PERIOD_END_MUST_BE_AFTER_TRIGGER");
    });

    it("unbefristet (null) bleibt bei einer terminierten Sperrzeit erlaubt", async () => {
      findUniqueMock.mockResolvedValue(sz({ wirksamAb: IN_DREI_WOCHEN, benachrichtigtAt: null }));
      expect((await updateSperrzeitEnde("s1", null)).ok).toBe(true);
    });

    it("bereits ausgelöst: es zählt wieder `jetzt`, nicht das vergangene wirksamAb", async () => {
      findUniqueMock.mockResolvedValue(sz(ausgeloest));
      expect((await updateSperrzeitEnde("s1", MORGEN)).ok).toBe(true); // verkürzen auf morgen: legitim

      findUniqueMock.mockResolvedValue(sz(ausgeloest));
      const past = await updateSperrzeitEnde("s1", new Date("2026-07-13T12:00:00Z"));
      if (past.ok) throw new Error("erwartet: Fehler");
      expect(past.error).toBe("LOCK_PERIOD_END_MUST_BE_FUTURE");
    });
  });

  describe("createVerschlussAnforderung", () => {
    it("terminierte SPERRZEIT mit Ende vor dem Auslösezeitpunkt wird gar nicht erst angelegt", async () => {
      const res = await createVerschlussAnforderung({
        userId: "u1", art: "SPERRZEIT",
        wirksamAbAt: IN_DREI_WOCHEN, endetAt: MORGEN,
      });

      if (res.ok) throw new Error("erwartet: Fehler");
      expect(res.error).toBe("LOCK_PERIOD_END_MUST_BE_AFTER_TRIGGER");
      expect(tx.verschlussAnforderung.create).not.toHaveBeenCalled();
    });

    it("sofortige SPERRZEIT mit Ende in der Vergangenheit wird abgelehnt", async () => {
      const res = await createVerschlussAnforderung({
        userId: "u1", art: "SPERRZEIT", endetAt: new Date("2026-07-13T12:00:00Z"),
      });

      if (res.ok) throw new Error("erwartet: Fehler");
      expect(res.error).toBe("LOCK_PERIOD_END_MUST_BE_FUTURE");
      expect(tx.verschlussAnforderung.create).not.toHaveBeenCalled();
    });

    it("terminierte SPERRZEIT mit Ende nach dem Auslösezeitpunkt entsteht wie bisher", async () => {
      const res = await createVerschlussAnforderung({
        userId: "u1", art: "SPERRZEIT",
        wirksamAbAt: IN_DREI_WOCHEN, endetAt: DANACH,
      });

      expect(res.ok).toBe(true);
      expect(tx.verschlussAnforderung.create).toHaveBeenCalledTimes(1);
    });

    it("ANFORDERUNG: das absolute Sperr-Ende (wird beim Erfüllen zur SPERRZEIT) gilt dieselbe Regel", async () => {
      const res = await createVerschlussAnforderung({
        userId: "u1", art: "ANFORDERUNG",
        wirksamAbAt: IN_DREI_WOCHEN, fristH: 4, sperrEndetAt: MORGEN,
      });

      if (res.ok) throw new Error("erwartet: Fehler");
      expect(res.error).toBe("LOCK_PERIOD_END_MUST_BE_AFTER_TRIGGER");
      expect(tx.verschlussAnforderung.create).not.toHaveBeenCalled();
    });

    it("ANFORDERUNG: die Einschliess-FRIST ist kein Sperr-Ende und bleibt ungeprüft", async () => {
      // `endetAt` einer ANFORDERUNG ist die Frist zum Einschliessen, nicht das Ende einer Sperre —
      // sie darf vor der Auslösung liegen, ohne dass eine abgelaufene Sperre entsteht.
      isLockedMock.mockResolvedValue(false); // eine ANFORDERUNG geht nur an einen offenen User
      const res = await createVerschlussAnforderung({
        userId: "u1", art: "ANFORDERUNG",
        wirksamAbAt: IN_DREI_WOCHEN, endetAt: MORGEN,
      });

      expect(res.ok).toBe(true);
    });
  });
});

/**
 * Der Rückzug MUSS terminierte Direktiven mit-stornieren (der Keyholder nimmt sie aus der Pipeline)
 * — deshalb kein `wirksamAb`-Filter in der Where-Klausel. Er darf sie aber nicht MELDEN.
 */
describe("withdrawVerschlussAnforderung (per art)", () => {
  it("nur GEPLANTE storniert → kein Wort an den Sub (er wusste nie davon)", async () => {
    tx.verschlussAnforderung.findMany.mockResolvedValue([{ id: "a1", ...geplant }]);
    const res = await withdrawVerschlussAnforderung("u1", "SPERRZEIT");

    if (!res.ok) throw new Error("erwartet: ok");
    expect(res.data).toEqual({ count: 1, hidden: 1, notified: false });
    expect(notifyMock).not.toHaveBeenCalled();
    expect(tx.verschlussAnforderung.updateMany).toHaveBeenCalledTimes(1); // storniert wird sie trotzdem
  });

  it("LOAD-BEARING: der Heimdall-Push läuft auch beim STILLEN Rückzug", async () => {
    // Die Asymmetrie ist der Kern: der Sub darf nichts erfahren, die BOX schon. Legt jemand die
    // beiden Guards zusammen (`if (notified)`), behielte eine hardware-erzwungene Box eine Sperre,
    // die es nicht mehr gibt — und der Sub bliebe physisch verschlossen.
    tx.verschlussAnforderung.findMany.mockResolvedValue([{ id: "a1", ...geplant }]);
    await withdrawVerschlussAnforderung("u1", "SPERRZEIT");

    expect(notifyMock).not.toHaveBeenCalled();
    expect(heimdallMock).toHaveBeenCalledWith("u1");
  });

  it("eine bekannte Direktive storniert → Meldung wie bisher", async () => {
    tx.verschlussAnforderung.findMany.mockResolvedValue([{ id: "a1", ...ausgeloest }]);
    const res = await withdrawVerschlussAnforderung("u1", "SPERRZEIT");

    if (!res.ok) throw new Error("erwartet: ok");
    expect(res.data).toEqual({ count: 1, hidden: 0, notified: true });
    expect(notifyMock).toHaveBeenCalledTimes(1);
    expect(heimdallMock).toHaveBeenCalledWith("u1");
  });

  it("die auto-erzeugte Sperrzeit gilt als bekannt → Meldung", async () => {
    tx.verschlussAnforderung.findMany.mockResolvedValue([{ id: "a1", ...autoErzeugt }]);
    const res = await withdrawVerschlussAnforderung("u1", "SPERRZEIT");

    if (!res.ok) throw new Error("erwartet: ok");
    expect(res.data.notified).toBe(true);
    expect(notifyMock).toHaveBeenCalledTimes(1);
  });

  it("gemischt (eine bekannt, eine geplant) → EINE Meldung, nicht zwei und nicht keine", async () => {
    tx.verschlussAnforderung.findMany.mockResolvedValue([
      { id: "a1", ...geplant },
      { id: "a2", ...ausgeloest },
    ]);
    const res = await withdrawVerschlussAnforderung("u1", "ANFORDERUNG");

    if (!res.ok) throw new Error("erwartet: ok");
    expect(res.data).toEqual({ count: 2, hidden: 1, notified: true });
    expect(notifyMock).toHaveBeenCalledTimes(1);
  });

  it("nichts offen → count 0, keine Meldung, kein Schreibzugriff, kein Push", async () => {
    tx.verschlussAnforderung.findMany.mockResolvedValue([]);
    const res = await withdrawVerschlussAnforderung("u1", "ANFORDERUNG");

    if (!res.ok) throw new Error("erwartet: ok");
    expect(res.data).toEqual({ count: 0, hidden: 0, notified: false });
    expect(notifyMock).not.toHaveBeenCalled();
    expect(heimdallMock).not.toHaveBeenCalled();
    expect(tx.verschlussAnforderung.updateMany).not.toHaveBeenCalled();
  });

  it("die Where-Klausel filtert NICHT nach wirksamAb — geplante bleiben eingeschlossen", async () => {
    // Regression: der virtuelle Keyholder beobachtete einmal withdrawn:0 bei einer nur TERMINIERTEN
    // Anforderung. Das Mit-Stornieren ist gewollt; falsch war allein die Meldung darüber.
    await withdrawVerschlussAnforderung("u1", "ANFORDERUNG");
    const where = tx.verschlussAnforderung.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ userId: "u1", art: "ANFORDERUNG", fulfilledAt: null, withdrawnAt: null });
    expect(JSON.stringify(where)).not.toContain("wirksamAb");

    tx.verschlussAnforderung.findMany.mockClear();
    await withdrawVerschlussAnforderung("u1", "SPERRZEIT");
    const whereSz = tx.verschlussAnforderung.findMany.mock.calls[0][0].where;
    expect(whereSz).toMatchObject({ userId: "u1", art: "SPERRZEIT", withdrawnAt: null });
    expect(JSON.stringify(whereSz)).not.toContain("wirksamAb");
  });

  it("Lesen und Stornieren laufen in EINER Transaktion", async () => {
    // Sonst könnte der Poller dazwischen auslösen: er stempelt `benachrichtigtAt` nach unserem Lesen,
    // wir schwiegen — und der Sub hielte eine ihm gerade gemeldete Sperrzeit für weiter aktiv.
    tx.verschlussAnforderung.findMany.mockResolvedValue([{ id: "a1", ...geplant }]);
    await withdrawVerschlussAnforderung("u1", "SPERRZEIT");
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});

/** Der Admin-UI-Pfad: dieselben Regeln, sonst hätte die Oberfläche denselben Bug wie der MCP. */
describe("withdrawVerschlussAnforderungById (Admin-UI)", () => {
  const va = (zustand: object) => ({ userId: "u1", art: "SPERRZEIT", withdrawnAt: null, ...zustand });

  it("eine GEPLANTE Zeile wegklicken meldet nichts — pusht aber an Heimdall", async () => {
    findUniqueMock.mockResolvedValue(va(geplant));
    const res = await withdrawVerschlussAnforderungById("s1");

    if (!res.ok) throw new Error("erwartet: ok");
    expect(res.data.notified).toBe(false);
    expect(notifyMock).not.toHaveBeenCalled();
    expect(heimdallMock).toHaveBeenCalledWith("u1");
  });

  it("eine bekannte Zeile wegklicken meldet", async () => {
    findUniqueMock.mockResolvedValue(va(ausgeloest));
    const res = await withdrawVerschlussAnforderungById("s1");

    if (!res.ok) throw new Error("erwartet: ok");
    expect(res.data.notified).toBe(true);
    expect(notifyMock).toHaveBeenCalledTimes(1);
  });

  it("unbekannt → 404, bereits zurückgezogen → 400, jeweils ohne Meldung", async () => {
    findUniqueMock.mockResolvedValue(null);
    expect((await withdrawVerschlussAnforderungById("s1")).ok).toBe(false);

    findUniqueMock.mockResolvedValue(va({ ...ausgeloest, withdrawnAt: new Date() }));
    expect((await withdrawVerschlussAnforderungById("s1")).ok).toBe(false);

    expect(notifyMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });
});
