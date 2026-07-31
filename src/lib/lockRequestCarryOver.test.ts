import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Eine TERMINIERTE Einschliess-Anforderung wird fällig, während der Sub bereits verschlossen ist.
 * Sie ist damit erfüllt — bisher verfiel sie aber als `obsolete`, und mit ihr die SPERRZEIT, die sie
 * mitbrachte: die entsteht sonst erst beim Erfüllen im Entries-Pfad, den ein schon verschlossener
 * Sub nie durchläuft. Der Keyholder verlor die Sperre ausgerechnet dann, wenn der Sub alles richtig
 * gemacht hatte. `carryOverSperrzeitOnAlreadyLocked` übernimmt sie stattdessen.
 */

const txMock = {
  verschlussAnforderung: { create: vi.fn(), update: vi.fn() },
};
vi.mock("@/lib/prisma", () => ({
  prisma: { $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(txMock)) },
}));
// Heimdall-Push ist fire-and-forget und für die Regel unerheblich.
vi.mock("@/lib/heimdallNotify", () => ({ notifyHeimdallForUserId: vi.fn(), notifyHeimdall: vi.fn() }));

import { carryOverSperrzeitOnAlreadyLocked, sperrzeitEndeFromRequest } from "./verschlussAnforderungService";

/** X — der Auslöse-Zeitpunkt der terminierten Anforderung. */
const X = new Date("2026-07-31T14:00:00Z");
const STUNDE = 60 * 60 * 1000;

const anforderung = (over: Partial<{ dauerH: number | null; sperrEndetAt: Date | null }> = {}) => ({
  id: "a1", userId: "u1", nachricht: "24h drin bleiben", reinigungErlaubt: true,
  dauerH: 24, sperrEndetAt: null, ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  txMock.verschlussAnforderung.create.mockResolvedValue({ id: "s-neu", nachricht: "24h drin bleiben" });
  txMock.verschlussAnforderung.update.mockResolvedValue({});
});

describe("sperrzeitEndeFromRequest — die eine Regel beider Pfade", () => {
  it("absolutes Sperr-Ende gewinnt und bleibt unabhängig vom Anker fix", () => {
    const fix = new Date("2026-08-05T10:00:00Z");
    const a = { dauerH: 24, sperrEndetAt: fix };
    expect(sperrzeitEndeFromRequest(a, X)).toEqual(fix);
    expect(sperrzeitEndeFromRequest(a, new Date("2026-07-01T00:00:00Z"))).toEqual(fix);
  });

  it("sonst zählt dauerH ab dem übergebenen Anker", () => {
    expect(sperrzeitEndeFromRequest({ dauerH: 24, sperrEndetAt: null }, X))
      .toEqual(new Date(X.getTime() + 24 * STUNDE));
  });

  it("ohne beides: keine Sperrzeit", () => {
    expect(sperrzeitEndeFromRequest({ dauerH: null, sperrEndetAt: null }, X)).toBeNull();
  });
});

describe("carryOverSperrzeitOnAlreadyLocked", () => {
  it("legt die Sperrzeit an — dauerH ab X, nicht ab dem länger zurückliegenden Verschluss", async () => {
    const r = (await carryOverSperrzeitOnAlreadyLocked(anforderung(), X))!;
    expect(r.endetAt).toEqual(new Date(X.getTime() + 24 * STUNDE));

    const { data } = txMock.verschlussAnforderung.create.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(data).toMatchObject({
      userId: "u1", art: "SPERRZEIT", nachricht: "24h drin bleiben", reinigungErlaubt: true,
      endetAt: new Date(X.getTime() + 24 * STUNDE),
      // Sofort gültig ⇒ nicht vor dem Sub verborgen. KEIN `benachrichtigtAt`: der Stempel meint
      // „Mail/Push ging raus", und der Versand liegt hinter dem Commit (der Poller schickt).
      wirksamAb: null,
    });
    expect(data).not.toHaveProperty("benachrichtigtAt");
  });

  it("gibt die Nachricht der GESCHRIEBENEN Zeile zurück — die Meldung zitiert die Sperrzeit", async () => {
    const r = (await carryOverSperrzeitOnAlreadyLocked(anforderung(), X))!;
    expect(r.nachricht).toBe("24h drin bleiben");
  });

  it("verbucht die Anforderung als ERFÜLLT, nicht als zurückgezogen", async () => {
    await carryOverSperrzeitOnAlreadyLocked(anforderung(), X);
    expect(txMock.verschlussAnforderung.update).toHaveBeenCalledWith({
      where: { id: "a1" }, data: { fulfilledAt: X },
    });
  });

  it("absolutes Sperr-Ende wird 1:1 übernommen", async () => {
    const fix = new Date("2026-08-05T10:00:00Z");
    const r = (await carryOverSperrzeitOnAlreadyLocked(anforderung({ dauerH: null, sperrEndetAt: fix }), X))!;
    expect(r.endetAt).toEqual(fix);
  });

  it("ohne mitgebrachte Sperrzeit: null — der Aufrufer zieht wie bisher zurück", async () => {
    expect(await carryOverSperrzeitOnAlreadyLocked(anforderung({ dauerH: null, sperrEndetAt: null }), X)).toBeNull();
    expect(txMock.verschlussAnforderung.create).not.toHaveBeenCalled();
    expect(txMock.verschlussAnforderung.update).not.toHaveBeenCalled();
  });

  it("bereits abgelaufenes absolutes Sperr-Ende: null statt einer toten Sperre", async () => {
    const vergangen = new Date(X.getTime() - STUNDE);
    expect(await carryOverSperrzeitOnAlreadyLocked(anforderung({ dauerH: null, sperrEndetAt: vergangen }), X)).toBeNull();
    expect(txMock.verschlussAnforderung.create).not.toHaveBeenCalled();
  });

  it("Anlegen und Erfüllt-Setzen laufen in EINER Transaktion", async () => {
    const { prisma } = await import("@/lib/prisma");
    await carryOverSperrzeitOnAlreadyLocked(anforderung(), X);
    expect((prisma as unknown as { $transaction: ReturnType<typeof vi.fn> }).$transaction).toHaveBeenCalledTimes(1);
  });
});
