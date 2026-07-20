import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * B-01 (MCP-Befundliste 2026-07-17): `request_orgasm` akzeptierte ein Fenster, dessen Ende bereits
 * verstrichen ist, und stellte es zu — mit `art: "ANWEISUNG"` entsteht daraus sofort ein
 * `missed_orgasm`-Vergehen für eine Frist, die der Sub nie erfüllen konnte. Der einzige gefundene
 * Pfad, auf dem der Tracker eine unverdiente Strafe erzeugt.
 *
 * `beginntAt` in der Vergangenheit bleibt zulässig (rückwirkende Fensteröffnung ist legitim) —
 * nur `endetAt` muss in der Zukunft liegen.
 */

const tx = {
  orgasmusAnforderung: { updateMany: vi.fn(), create: vi.fn() },
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    orgasmusAnforderung: { updateMany: vi.fn() },
    $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  },
}));
vi.mock("@/lib/mail", () => ({
  sendMailSafe: vi.fn(), escHtml: (s: string) => s, noticeBoxHtml: () => "", dashboardEmailHtml: () => "",
}));
vi.mock("@/lib/push", () => ({ firePush: vi.fn() }));
vi.mock("@/lib/emailI18n", () => ({ emailT: async () => (k: string) => k, emailGreeting: () => "" }));
vi.mock("next-intl/server", () => ({ getTranslations: vi.fn(async () => (k: string) => k) }));

import { createOrgasmusAnforderung, checkOrgasmWindowEnd } from "./orgasmusAnforderungService";
import { prisma } from "@/lib/prisma";

const userMock = prisma.user.findUnique as unknown as ReturnType<typeof vi.fn>;

const JETZT = new Date("2026-07-17T12:00:00Z");
const VOR_EINER_STUNDE = new Date("2026-07-17T11:00:00Z");
const VOR_SECHS_TAGEN = new Date("2026-07-11T10:00:00Z");
const IN_EINER_STUNDE = new Date("2026-07-17T13:00:00Z");
const MORGEN = new Date("2026-07-18T12:00:00Z");

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(JETZT);
  vi.clearAllMocks();
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
  it("endetAt sechs Tage in der Vergangenheit wird abgelehnt, auch bei GELEGENHEIT", async () => {
    const res = await createOrgasmusAnforderung({
      userId: "u1", art: "GELEGENHEIT", beginntAt: VOR_SECHS_TAGEN, endetAt: VOR_EINER_STUNDE,
    });
    if (res.ok) throw new Error("erwartet: Fehler");
    expect(res.error).toBe("ORGASM_END_MUST_BE_FUTURE");
    // Der Guard greift VOR dem User-Lookup — kein Datensatz wurde angelegt oder benachrichtigt.
    expect(userMock).not.toHaveBeenCalled();
    expect(tx.orgasmusAnforderung.create).not.toHaveBeenCalled();
  });

  it("dieselbe Konstellation mit ANWEISUNG wird ebenfalls abgelehnt (verhindert die unverdiente Strafe)", async () => {
    const res = await createOrgasmusAnforderung({
      userId: "u1", art: "ANWEISUNG", beginntAt: VOR_SECHS_TAGEN, endetAt: VOR_EINER_STUNDE,
    });
    if (res.ok) throw new Error("erwartet: Fehler");
    expect(res.error).toBe("ORGASM_END_MUST_BE_FUTURE");
  });

  it("beginntAt in der Vergangenheit + endetAt in der Zukunft bleibt zulässig (rückwirkende Fensteröffnung)", async () => {
    const res = await createOrgasmusAnforderung({
      userId: "u1", art: "GELEGENHEIT", beginntAt: VOR_SECHS_TAGEN, endetAt: MORGEN,
    });
    expect(res.ok).toBe(true);
    expect(tx.orgasmusAnforderung.create).toHaveBeenCalledTimes(1);
  });
});
