import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Die Reinigungs-Schranke. `releaseSperrzeitenOnOpen` entscheidet zwei Dinge auf einmal: ob die
 * Sperrzeit fällt (→ Strafbuch) und — über den Rückgabewert — ob die Box dem Eintrag folgen darf.
 * Ein Fehler hier öffnet entweder die Box bei einem Verstoss oder hält sie bei einer erlaubten
 * Reinigung zu. Beides ist am Gerät passiert, deshalb dieser Test.
 */
vi.mock("@/lib/prisma", async () => {
  const { createPrismaMock } = await import("@/test/prismaMock");
  return { prisma: createPrismaMock() };
});

import { releaseSperrzeitenOnOpen, cleaningWindowOpen, cleaningBlockReason, type CleaningPermissionUser } from "./queries";
import type { PrismaTx } from "./queries";

const TZ = "Europe/Zurich";
const FENSTER = [{ start: "19:00", end: "20:00" }];

/** 2026-07-10 ist CEST (UTC+2) — 19:30 Ortszeit = 17:30 UTC. */
const IM_FENSTER = new Date("2026-07-10T17:30:00Z");
const NACHTS = new Date("2026-07-10T01:00:00Z"); // 03:00 Ortszeit

const SPERRZEIT_ERLAUBT = [{ id: "s1", reinigungErlaubt: true }];

const user = (over: Partial<CleaningPermissionUser> = {}): CleaningPermissionUser => ({
  reinigungErlaubt: true,
  reinigungsFenster: FENSTER,
  timezone: TZ,
  ...over,
});

let updateMany: ReturnType<typeof vi.fn>;
let findMany: ReturnType<typeof vi.fn>;

function tx(): PrismaTx {
  return {
    verschlussAnforderung: { findMany, updateMany },
    user: { findUnique: vi.fn().mockResolvedValue(user()) },
  } as unknown as PrismaTx;
}

beforeEach(() => {
  updateMany = vi.fn().mockResolvedValue({ count: 1 });
  findMany = vi.fn().mockResolvedValue(SPERRZEIT_ERLAUBT);
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

/** Die Schranke prüft die WANDUHR, nicht die (rückdatierbare) startTime des Eintrags. */
function jetzt(at: Date) {
  vi.setSystemTime(at);
}

describe("cleaningWindowOpen", () => {
  it("keine Fenster konfiguriert = nicht zeitgebunden → immer offen", () => {
    expect(cleaningWindowOpen([], NACHTS, TZ)).toBe(true);
    expect(cleaningWindowOpen(null, NACHTS, TZ)).toBe(true);
  });

  it("innerhalb eines konfigurierten Fensters → offen", () => {
    expect(cleaningWindowOpen(FENSTER, IM_FENSTER, TZ)).toBe(true);
  });

  it("ausserhalb eines konfigurierten Fensters → zu", () => {
    expect(cleaningWindowOpen(FENSTER, NACHTS, TZ)).toBe(false);
  });

  it("liest die Fenster in der Zone des SUBS, nicht in UTC", () => {
    // 17:30 UTC ist 19:30 in Zürich (im Fenster), aber 17:30 in London (ausserhalb).
    expect(cleaningWindowOpen(FENSTER, IM_FENSTER, "Europe/Zurich")).toBe(true);
    expect(cleaningWindowOpen(FENSTER, IM_FENSTER, "Europe/London")).toBe(false);
  });

  it("verwirft ungültige und über Mitternacht laufende Fenster (parseReinigungsFenster)", () => {
    // Beide Paare fallen weg → leere Liste → nicht zeitgebunden.
    expect(cleaningWindowOpen([{ start: "22:00", end: "02:00" }, { start: "quatsch", end: "07:00" }], NACHTS, TZ)).toBe(true);
  });
});

describe("cleaningBlockReason", () => {
  const erlaubt = [{ reinigungErlaubt: true }];

  it("alles erfüllt → null", () => {
    expect(cleaningBlockReason(user(), erlaubt, IM_FENSTER)).toBeNull();
  });

  it("User darf nicht reinigen → userNotAllowed (das Speziellere gewinnt)", () => {
    // Auch ausserhalb des Fensters und bei verbietender Sperre: wer gar nicht reinigen darf,
    // braucht keinen Fenster-Hinweis.
    expect(cleaningBlockReason(user({ reinigungErlaubt: false }), [{ reinigungErlaubt: false }], NACHTS))
      .toBe("userNotAllowed");
  });

  it("eine Sperrzeit verbietet Reinigung → lockPeriodForbids, auch im Fenster", () => {
    expect(cleaningBlockReason(user(), [{ reinigungErlaubt: true }, { reinigungErlaubt: false }], IM_FENSTER))
      .toBe("lockPeriodForbids");
  });

  it("ausserhalb eines konfigurierten Fensters → outsideWindow", () => {
    expect(cleaningBlockReason(user(), erlaubt, NACHTS)).toBe("outsideWindow");
  });

  it("ohne konfigurierte Fenster → null (nicht zeitgebunden)", () => {
    expect(cleaningBlockReason(user({ reinigungsFenster: [] }), erlaubt, NACHTS)).toBeNull();
  });

  it("ohne aktive Sperrzeit entscheiden nur User-Flag und Fenster", () => {
    expect(cleaningBlockReason(user(), [], IM_FENSTER)).toBeNull();
    expect(cleaningBlockReason(user(), [], NACHTS)).toBe("outsideWindow");
  });
});

describe("releaseSperrzeitenOnOpen", () => {
  it("ohne aktive Sperrzeit: nichts zurückzuziehen, die Box folgt", async () => {
    jetzt(NACHTS);
    findMany.mockResolvedValue([]);
    expect(await releaseSperrzeitenOnOpen("u1", "REINIGUNG", tx(), "user", user())).toBe(false);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("erlaubte Reinigung IM Fenster: Sperrzeit bleibt, die Box öffnet", async () => {
    jetzt(IM_FENSTER);
    expect(await releaseSperrzeitenOnOpen("u1", "REINIGUNG", tx(), "user", user())).toBe(false);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("Reinigung AUSSERHALB des Fensters: Verstoss — Sperrzeit fällt, die Box bleibt zu", async () => {
    jetzt(NACHTS);
    expect(await releaseSperrzeitenOnOpen("u1", "REINIGUNG", tx(), "user", user())).toBe(true);
    expect(updateMany).toHaveBeenCalledOnce();
  });

  it("ohne konfigurierte Fenster ist Reinigung nicht zeitgebunden — auch nachts erlaubt", async () => {
    jetzt(NACHTS);
    expect(await releaseSperrzeitenOnOpen("u1", "REINIGUNG", tx(), "user", user({ reinigungsFenster: [] }))).toBe(false);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("anderer Öffnungsgrund im Fenster: bleibt ein Verstoss", async () => {
    jetzt(IM_FENSTER);
    expect(await releaseSperrzeitenOnOpen("u1", "ORGASMUS", tx(), "user", user())).toBe(true);
  });

  it("User darf gar nicht reinigen: Verstoss, egal welches Fenster", async () => {
    jetzt(IM_FENSTER);
    expect(await releaseSperrzeitenOnOpen("u1", "REINIGUNG", tx(), "user", user({ reinigungErlaubt: false }))).toBe(true);
  });

  it("eine der aktiven Sperrzeiten verbietet Reinigung: Verstoss (jede muss zustimmen)", async () => {
    jetzt(IM_FENSTER);
    findMany.mockResolvedValue([{ id: "s1", reinigungErlaubt: true }, { id: "s2", reinigungErlaubt: false }]);
    expect(await releaseSperrzeitenOnOpen("u1", "REINIGUNG", tx(), "user", user())).toBe(true);
    expect(updateMany).toHaveBeenCalledOnce();
  });

  it("ohne durchgereichten User lädt die Funktion ihn selbst", async () => {
    jetzt(IM_FENSTER);
    const t = tx();
    expect(await releaseSperrzeitenOnOpen("u1", "REINIGUNG", t, "user")).toBe(false);
    expect(t.user.findUnique).toHaveBeenCalledOnce();
  });
});
