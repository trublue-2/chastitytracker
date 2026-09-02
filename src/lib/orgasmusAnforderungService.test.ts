import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * B-01 (MCP-Befundliste 2026-07-17): `request_orgasm` akzeptierte ein Fenster, dessen Ende bereits
 * verstrichen ist, und stellte es zu — mit `art: "ANWEISUNG"` entsteht daraus sofort ein
 * `missed_orgasm`-Vergehen für eine Frist, die der Sub nie erfüllen konnte. Der einzige gefundene
 * Pfad, auf dem der Tracker eine unverdiente Strafe erzeugt.
 *
 * `beginsAt` in der Vergangenheit bleibt zulässig (rückwirkende Fensteröffnung ist legitim) —
 * nur `endsAt` muss in der Zukunft liegen.
 */

const tx = {
  orgasmusAnforderung: { findMany: vi.fn(), updateMany: vi.fn(), create: vi.fn() },
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    orgasmusAnforderung: { updateMany: vi.fn() },
    // Der Gesundheits-Halt ist Vorbedingung jeder Direktive (`isHealthHoldActive`) — `null` = keiner.
    healthHold: { findFirst: vi.fn(async () => null) },
    $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  },
}));
vi.mock("@/lib/mail", () => ({
  sendMailSafe: vi.fn(), escHtml: (s: string) => s, noticeBoxHtml: () => "", optionalNoticeBoxHtml: () => "", dashboardEmailHtml: () => "",
}));
vi.mock("@/lib/push", () => ({ firePush: vi.fn() }));
vi.mock("@/lib/notify", () => ({ notifyUser: vi.fn() }));
vi.mock("@/lib/emailI18n", () => ({ emailT: async () => (k: string) => k, emailGreeting: () => "" }));
vi.mock("next-intl/server", () => ({ getTranslations: vi.fn(async () => (k: string) => k) }));

import { createOrgasmusAnforderung, checkOrgasmWindowEnd } from "./orgasmusAnforderungService";
import { prisma } from "@/lib/prisma";
import { sendMailSafe } from "@/lib/mail";
import { notifyUser } from "@/lib/notify";

const userMock = prisma.user.findUnique as unknown as ReturnType<typeof vi.fn>;
const mailMock = sendMailSafe as unknown as ReturnType<typeof vi.fn>;
const notifyMock = notifyUser as unknown as ReturnType<typeof vi.fn>;

const JETZT = new Date("2026-07-17T12:00:00Z");
const VOR_EINER_STUNDE = new Date("2026-07-17T11:00:00Z");
const VOR_SECHS_TAGEN = new Date("2026-07-11T10:00:00Z");
const IN_EINER_STUNDE = new Date("2026-07-17T13:00:00Z");
const MORGEN = new Date("2026-07-18T12:00:00Z");

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(JETZT);
  vi.clearAllMocks();
  tx.orgasmusAnforderung.findMany.mockReset().mockResolvedValue([]);
  tx.orgasmusAnforderung.updateMany.mockReset().mockResolvedValue({ count: 0 });
  tx.orgasmusAnforderung.create.mockReset().mockResolvedValue({ id: "neu" });
  userMock.mockReset().mockResolvedValue({ id: "u1", email: "sub@example.invalid", username: "sub", locale: "de", orgasmusArtenConfig: null });
});
afterEach(() => vi.useRealTimers());

describe("checkOrgasmWindowEnd", () => {
  it("Ende in der Vergangenheit → Reject", () => {
    expect(checkOrgasmWindowEnd(VOR_EINER_STUNDE, JETZT)).toBe("ORGASM_END_MUST_BE_FUTURE");
  });

  it("Ende genau jetzt → Reject (nicht strikt in der Zukunft)", () => {
    expect(checkOrgasmWindowEnd(JETZT, JETZT)).toBe("ORGASM_END_MUST_BE_FUTURE");
  });

  it("Ende in der Zukunft → erlaubt", () => {
    expect(checkOrgasmWindowEnd(IN_EINER_STUNDE, JETZT)).toBeNull();
  });
});

describe("createOrgasmusAnforderung — Vergangenheits-Fenster (B-01)", () => {
  it("endsAt sechs Tage in der Vergangenheit wird abgelehnt, auch bei GELEGENHEIT", async () => {
    const res = await createOrgasmusAnforderung({
      userId: "u1", art: "GELEGENHEIT", beginsAt: VOR_SECHS_TAGEN, endsAt: VOR_EINER_STUNDE,
    },
    "herrin");
    if (res.ok) throw new Error("erwartet: Fehler");
    expect(res.error).toBe("ORGASM_END_MUST_BE_FUTURE");
    // Der Guard greift VOR dem User-Lookup — kein Datensatz wurde angelegt oder benachrichtigt.
    expect(userMock).not.toHaveBeenCalled();
    expect(tx.orgasmusAnforderung.create).not.toHaveBeenCalled();
  });

  it("dieselbe Konstellation mit ANWEISUNG wird ebenfalls abgelehnt (verhindert die unverdiente Strafe)", async () => {
    const res = await createOrgasmusAnforderung({
      userId: "u1", art: "ANWEISUNG", beginsAt: VOR_SECHS_TAGEN, endsAt: VOR_EINER_STUNDE,
    },
    "herrin");
    if (res.ok) throw new Error("erwartet: Fehler");
    expect(res.error).toBe("ORGASM_END_MUST_BE_FUTURE");
  });

  it("beginsAt in der Vergangenheit + endsAt in der Zukunft bleibt zulässig (rückwirkende Fensteröffnung)", async () => {
    const res = await createOrgasmusAnforderung({
      userId: "u1", art: "GELEGENHEIT", beginsAt: VOR_SECHS_TAGEN, endsAt: MORGEN,
    },
    "herrin");
    expect(res.ok).toBe(true);
    expect(tx.orgasmusAnforderung.create).toHaveBeenCalledTimes(1);
  });
});

/**
 * Die Terminierung folgt der Konvention der drei Geschwister (`delayedTrigger.ts`): bis zum
 * Auslösen bleibt die Anweisung für den Sub verborgen — und deshalb geht bis dahin auch keine
 * Meldung raus. Der Fenster-Guard oben zählt dann gegen den AUSLÖSE-Zeitpunkt, nicht gegen „jetzt".
 */
describe("createOrgasmusAnforderung — Terminierung", () => {
  it("sofort: benachrichtigt und gemeldet", async () => {
    const res = await createOrgasmusAnforderung({
      userId: "u1", art: "ANWEISUNG", beginsAt: JETZT, endsAt: MORGEN,
    }, "herrin");
    expect(res.ok && res.data.scheduledFor).toBeNull();
    expect(tx.orgasmusAnforderung.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ wirksamAb: null, benachrichtigtAt: JETZT, createdBy: "herrin" }) }),
    );
    expect(mailMock).toHaveBeenCalledTimes(1);
  });

  it("verzögert: gespeichert, aber KEINE Meldung — der Poller stellt zu", async () => {
    const res = await createOrgasmusAnforderung({
      userId: "u1", art: "ANWEISUNG", beginsAt: JETZT, endsAt: MORGEN, delayMinutes: 60,
    }, "herrin");
    expect(res.ok && res.data.scheduledFor).toBe(IN_EINER_STUNDE.toISOString());
    expect(tx.orgasmusAnforderung.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ wirksamAb: IN_EINER_STUNDE, benachrichtigtAt: null }) }),
    );
    expect(mailMock).not.toHaveBeenCalled();
  });

  it("ein Fenster, das vor der eigenen Zustellung endet, wird abgelehnt", async () => {
    const res = await createOrgasmusAnforderung({
      userId: "u1", art: "ANWEISUNG", beginsAt: JETZT, endsAt: IN_EINER_STUNDE, wirksamAbAt: MORGEN,
    }, "herrin");
    if (res.ok) throw new Error("erwartet: Fehler");
    expect(res.error).toBe("ORGASM_END_MUST_BE_FUTURE");
    expect(tx.orgasmusAnforderung.create).not.toHaveBeenCalled();
  });
});

/**
 * Die verdrängte Vorgängerin: eine neue Anweisung zieht die offene zurück. Ist die neue TERMINIERT,
 * bekommt der Träger davon nichts mit — dann muss wenigstens der Rückzug bei ihm ankommen, sonst
 * verschwindet ihm ein laufendes Fenster wortlos vom Dashboard.
 */
describe("createOrgasmusAnforderung — Verdrängung", () => {
  it("terminierte Neue verdrängt eine bekannte Alte → Rückzugs-Meldung", async () => {
    tx.orgasmusAnforderung.findMany.mockResolvedValue([{ wirksamAb: null, benachrichtigtAt: JETZT }]);
    await createOrgasmusAnforderung({
      userId: "u1", art: "GELEGENHEIT", beginsAt: JETZT, endsAt: MORGEN, delayMinutes: 60,
    }, "herrin");
    expect(notifyMock).toHaveBeenCalledTimes(1);
  });

  it("terminierte Neue verdrängt eine ebenfalls verborgene Alte → gar keine Meldung", async () => {
    tx.orgasmusAnforderung.findMany.mockResolvedValue([{ wirksamAb: MORGEN, benachrichtigtAt: null }]);
    await createOrgasmusAnforderung({
      userId: "u1", art: "GELEGENHEIT", beginsAt: JETZT, endsAt: MORGEN, delayMinutes: 60,
    }, "herrin");
    expect(notifyMock).not.toHaveBeenCalled();
  });
});
