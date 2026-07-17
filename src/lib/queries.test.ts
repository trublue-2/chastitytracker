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

import { releaseSperrzeitenOnOpen, cleaningWindowOpen, cleaningBlockReason, cleaningWindowBindingStatus, foldActiveSperrzeiten, type CleaningPermissionUser, GENUINELY_WITHDRAWN_WHERE, getKgNeighbors } from "./queries";
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

// Regression: A-02 aus der MCP-Befundliste vom 17.07.2026. `windowOpenNow: null` las sich als
// "jetzt nicht erlaubt" — tatsächlich binden Fenster NUR während einer aktiven Sperrzeit, die
// Reinigen erlaubt. Dreimal dokumentiert als tatsächlich passierter Fehler (drei Reinigungsöffnungen
// ausserhalb aller Fenster, alle rechtmässig, weil keine Sperrzeit aktiv war).
describe("cleaningWindowBindingStatus (A-02)", () => {
  it("keine aktive Sperrzeit → Fenster binden nicht, Öffnung immer erlaubt (der dreifach dokumentierte Fehlerfall)", () => {
    expect(cleaningWindowBindingStatus(user(), null, NACHTS)).toEqual({
      windowsBinding: false,
      windowsBindingReason: "no-active-lock-period",
      openingAllowedNow: true,
    });
  });

  it("aktive Sperrzeit erlaubt Reinigen, aber ausserhalb des Fensters → Fenster binden, Öffnung nicht erlaubt", () => {
    expect(cleaningWindowBindingStatus(user(), { reinigungErlaubt: true }, NACHTS)).toEqual({
      windowsBinding: true,
      windowsBindingReason: null,
      openingAllowedNow: false,
    });
  });

  it("aktive Sperrzeit verbietet Reinigen → Fenster binden nicht (Grund liegt vorher), Öffnung nicht erlaubt", () => {
    expect(cleaningWindowBindingStatus(user(), { reinigungErlaubt: false }, NACHTS)).toEqual({
      windowsBinding: false,
      windowsBindingReason: "lock-period-forbids",
      openingAllowedNow: false,
    });
  });

  it("User darf grundsätzlich nicht reinigen → Fenster binden nicht, Öffnung nicht erlaubt", () => {
    expect(cleaningWindowBindingStatus(user({ reinigungErlaubt: false }), { reinigungErlaubt: true }, NACHTS)).toEqual({
      windowsBinding: false,
      windowsBindingReason: "user-not-allowed",
      openingAllowedNow: false,
    });
  });

  it("aktive Sperrzeit + innerhalb des Fensters → Fenster binden, Öffnung erlaubt", () => {
    expect(cleaningWindowBindingStatus(user(), { reinigungErlaubt: true }, IM_FENSTER)).toEqual({
      windowsBinding: true,
      windowsBindingReason: null,
      openingAllowedNow: true,
    });
  });

  // Regression (code-review Phase 2): cleaningBlockReason liefert null sowohl "im konfigurierten
  // Fenster" als auch "gar keine Fenster konfiguriert" (cleaningWindowOpen liest beides als "offen").
  // windowsBinding muss die beiden Fälle unterscheiden — ohne konfigurierte Fenster gibt es nichts,
  // das binden könnte, auch bei einer aktiven, erlaubten Sperrzeit.
  it("aktive Sperrzeit erlaubt Reinigen, aber KEINE Fenster konfiguriert → Fenster binden nicht", () => {
    expect(cleaningWindowBindingStatus(user({ reinigungsFenster: [] }), { reinigungErlaubt: true }, NACHTS)).toEqual({
      windowsBinding: false,
      windowsBindingReason: "no-windows-configured",
      openingAllowedNow: true,
    });
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

/**
 * Mehrere gleichzeitig AKTIVE Sperrzeiten sind kein Ausnahmefall: eine geplante überlebt eine Öffnung
 * (noch nicht aktiv → `releaseSperrzeitenOnOpen` lässt sie stehen), der Sub schliesst sich per
 * Verschluss-Anforderung wieder ein (`entries/route.ts` legt eine zweite an), und löst die geplante
 * dann aus, laufen zwei. Wer „die Sperrzeit" liest — allen voran die BOX-Durchsetzung — bekam bis
 * hierher die zuletzt ANGELEGTE. Das ist keine Regel, das ist die Sortierung.
 */
describe("foldActiveSperrzeiten — die effektive (strengste) Sperre", () => {
  const sz = (endetAt: Date | null, reinigungErlaubt = true, id = "x") => ({ id, endetAt, reinigungErlaubt });
  const FRUEH = new Date("2026-07-20T00:00:00Z");
  const SPAET = new Date("2026-08-11T00:00:00Z");

  it("nichts aktiv → null", () => {
    expect(foldActiveSperrzeiten([])).toBeNull();
  });

  it("das SPÄTESTE Ende setzt sich durch, nicht die zuletzt angelegte Zeile", () => {
    // Die Liste kommt neueste-zuerst: die kurze Selbst-Sperre des Subs steht vorne. Nähme man sie,
    // liefe die Box drei Wochen zu früh auf und die längere Anweisung der Keyholderin wäre still weg.
    const fold = foldActiveSperrzeiten([sz(FRUEH, true, "selbst"), sz(SPAET, true, "keyholder")])!;
    expect(fold.endetAt).toEqual(SPAET);
    expect(fold.id).toBe("keyholder");
  });

  it("unbefristet schlägt jedes Datum — egal in welcher Reihenfolge", () => {
    expect(foldActiveSperrzeiten([sz(SPAET), sz(null, true, "unbefristet")])!.endetAt).toBeNull();
    expect(foldActiveSperrzeiten([sz(null, true, "unbefristet"), sz(SPAET)])!.endetAt).toBeNull();
  });

  it("Reinigung nur, wenn JEDE aktive Sperre sie erlaubt (UND, nicht Zeile-gewinnt)", () => {
    // Sonst erlaubte die durchsetzende Zeile eine Reinigungsöffnung, die eine zweite aktive Sperre
    // verbietet — der Sub öffnet im guten Glauben und kassiert einen Strafbuch-Eintrag.
    const fold = foldActiveSperrzeiten([sz(SPAET, true), sz(FRUEH, false)])!;
    expect(fold.reinigungErlaubt).toBe(false);
    expect(fold.endetAt).toEqual(SPAET); // die strengere Reinigungs-Regel kippt das Ende nicht
  });

  it("eine einzige Sperre kommt unverändert zurück", () => {
    const only = sz(FRUEH, false, "s1");
    expect(foldActiveSperrzeiten([only])).toEqual(only);
  });
});

// ─── GENUINELY_WITHDRAWN_WHERE ─────────────────────────────────────────────

describe("GENUINELY_WITHDRAWN_WHERE", () => {
  it("klammert Versäumnisse aus — sonst löscht der Nacht-Purge Vergehen mit weg", () => {
    // `deleteWithdrawnAutoKontrollen` löscht am Tageswechsel die zurückgezogenen Auto-Kontrollen.
    // Die Eskalation setzt bei einem VERSÄUMNIS aber ebenfalls `withdrawnAt` — filterte der Purge
    // nur darauf, verschwände jede versäumte Auto-Kontrolle über Nacht, samt dem Vergehen, das im
    // Strafbuch genau an dieser Zeile hängt (strafbuch.ts liest `autoMarkedRemovedAt`).
    expect(GENUINELY_WITHDRAWN_WHERE).toEqual({
      withdrawnAt: { not: null },
      autoMarkedRemovedAt: null,
    });
  });
});

// ─── getKgNeighbors ─────────────────────────────────────────────────────────

describe("getKgNeighbors", () => {
  // Backdating in der Admin-Route hat bewusst keinen TIME_BEFORE-Guard — ein neuer Eintrag darf
  // zeitlich vor den global-jüngsten rutschen. Genau das kann ihn zwischen ein bestehendes Paar
  // schieben; die Route braucht die UNMITTELBAREN chronologischen Nachbarn (nicht den global-
  // jüngsten Eintrag), um zwei gleichartige KG-Einträge hintereinander zu verhindern.
  it("liefert den vorherigen und nächsten KG-Eintrag chronologisch um startTime herum", async () => {
    const findFirst = vi.fn()
      .mockResolvedValueOnce({ type: "VERSCHLUSS" }) // prev (startTime < …, desc)
      .mockResolvedValueOnce({ type: "OEFFNEN" });    // next (startTime > …, asc)
    const tx = { entry: { findFirst } } as unknown as PrismaTx;

    const result = await getKgNeighbors("u1", new Date("2026-05-01T11:00:00Z"), tx);

    expect(result).toEqual({ prev: { type: "VERSCHLUSS" }, next: { type: "OEFFNEN" } });
    expect(findFirst).toHaveBeenCalledTimes(2);
  });

  it("liefert null für beide Seiten, wenn es keine KG-Einträge gibt", async () => {
    const tx = { entry: { findFirst: vi.fn().mockResolvedValue(null) } } as unknown as PrismaTx;
    const result = await getKgNeighbors("u1", new Date("2026-05-01T11:00:00Z"), tx);
    expect(result).toEqual({ prev: null, next: null });
  });
});
