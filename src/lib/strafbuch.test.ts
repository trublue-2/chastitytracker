import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/prisma", async () => {
  const { createPrismaMock } = await import("@/test/prismaMock");
  return { prisma: createPrismaMock() };
});

import { isLateLock, cleaningRelockDeadline, isCleaningNotRelocked, cleaningRelockObligation, buildStrafbuch, cleaningWindowEnforcedFrom } from "./strafbuch";
import { prisma } from "@/lib/prisma";
import type { PrismaMock } from "@/test/prismaMock";

describe("isLateLock", () => {
  const endsAt = new Date("2026-07-09T18:00:00Z");

  it("is late when still open past the deadline", () => {
    const now = new Date("2026-07-09T18:00:01Z");
    expect(isLateLock({ endsAt, fulfilledAt: null }, now)).toBe(true);
  });

  it("is not late when still open before the deadline", () => {
    const now = new Date("2026-07-09T17:59:59Z");
    expect(isLateLock({ endsAt, fulfilledAt: null }, now)).toBe(false);
  });

  it("is late when fulfilled after the deadline", () => {
    const fulfilledAt = new Date("2026-07-09T18:00:01Z");
    expect(isLateLock({ endsAt, fulfilledAt }, new Date("2026-07-10T00:00:00Z"))).toBe(true);
  });

  it("is not late when fulfilled on or before the deadline", () => {
    const fulfilledAt = new Date("2026-07-09T18:00:00Z");
    expect(isLateLock({ endsAt, fulfilledAt }, new Date("2026-07-10T00:00:00Z"))).toBe(false);
  });
});

describe("cleaningRelockDeadline", () => {
  const tz = "Europe/Zurich"; // UTC+2 (CEST) in July

  it("falls back to open time + maxMinutes when no window is configured", () => {
    const openStart = new Date("2026-07-09T18:00:00Z"); // 20:00 Zurich
    expect(cleaningRelockDeadline(openStart, 15, [], tz).toISOString()).toBe("2026-07-09T18:15:00.000Z");
  });

  it("uses the active window's end when the opening falls inside a configured window", () => {
    const openStart = new Date("2026-07-09T18:00:00Z"); // 20:00 Zurich
    const fenster = [{ start: "20:00", end: "22:00" }];
    expect(cleaningRelockDeadline(openStart, 15, fenster, tz).toISOString()).toBe("2026-07-09T20:00:00.000Z");
  });

  it("falls back to maxMinutes when windows are configured but the opening falls outside all of them", () => {
    const openStart = new Date("2026-07-09T18:00:00Z"); // 20:00 Zurich
    const fenster = [{ start: "08:00", end: "09:00" }];
    expect(cleaningRelockDeadline(openStart, 15, fenster, tz).toISOString()).toBe("2026-07-09T18:15:00.000Z");
  });

  /**
   * DIE FOLGE der Fenster-Regel, und deshalb HIER gepinnt und nicht nur an `activeCleaningWindow`:
   * überlappen sich zwei Fenster, gilt das mit dem spätesten Ende. Mit dem zuerst gespeicherten fiel
   * die Rückschliess-Frist zu früh — der Träger bekam ein Versäumnis für eine Zeit, in der eine
   * Reinigungsöffnung nach `cleaningWindowOpen` weiterhin erlaubt war.
   */
  it("nimmt bei überlappenden Fenstern das spätere Ende", () => {
    const openStart = new Date("2026-07-09T09:00:00Z"); // 11:00 Zürich, in BEIDEN Fenstern
    const ueberlappend = [{ start: "08:00", end: "12:00" }, { start: "10:00", end: "20:00" }];
    expect(cleaningRelockDeadline(openStart, 15, ueberlappend, tz).toISOString()).toBe("2026-07-09T18:00:00.000Z"); // 20:00
    // Und unabhängig davon, in welcher Reihenfolge die Fenster gespeichert sind.
    expect(cleaningRelockDeadline(openStart, 15, [...ueberlappend].reverse(), tz).toISOString())
      .toBe("2026-07-09T18:00:00.000Z");
  });

  it("resolves a window end correctly across a same-day DST transition (spring-forward)", () => {
    // 2026-03-29 is the EU spring-forward day: clocks jump 02:00 CET -> 03:00 CEST at 01:00 UTC.
    // Opening falls pre-transition (01:30 CET, offset +1); the window end (04:00) is post-transition
    // (offset +2). A naive flat-ms-from-midnight calculation would misresolve this.
    const openStart = new Date("2026-03-29T00:30:00Z"); // 01:30 CET
    const fenster = [{ start: "01:30", end: "04:00" }];
    expect(cleaningRelockDeadline(openStart, 15, fenster, tz).toISOString()).toBe("2026-03-29T02:00:00.000Z"); // 04:00 CEST
  });
});

describe("cleaningRelockObligation — dieselbe Regel für Strafbuch UND Dashboard-Anzeige", () => {
  const tz = "Europe/Zurich";
  const enforcedFrom = new Date("2026-01-01T00:00:00Z");
  const opening = { oeffnenGrund: "REINIGUNG", startTime: new Date("2026-07-09T18:00:00Z") }; // 20:00 Zürich
  const user = { cleaningAllowed: true, cleaningWindows: [{ start: "20:00", end: "22:00" }], timezone: tz };
  const lockPeriod = { cleaningAllowed: true, endsAt: null };

  it("liefert die Fenster-Frist, wenn die Öffnung erlaubt ist", () => {
    const d = cleaningRelockObligation(opening, lockPeriod, user, 15, enforcedFrom);
    expect(d?.toISOString()).toBe("2026-07-09T20:00:00.000Z"); // Fensterende 22:00 Zürich
  });

  it("keine Pflicht ohne aktive Sperrzeit — das Strafbuch kennt dann keine", () => {
    expect(cleaningRelockObligation(opening, null, user, 15, enforcedFrom)).toBeNull();
  });

  it("keine Pflicht, wenn die Sperrzeit Reinigung verbietet (die Öffnung ist dann unerlaubt)", () => {
    expect(cleaningRelockObligation(opening, { cleaningAllowed: false, endsAt: null }, user, 15, enforcedFrom)).toBeNull();
  });

  it("keine Pflicht ausserhalb der konfigurierten Fenster", () => {
    const spaet = { oeffnenGrund: "REINIGUNG", startTime: new Date("2026-07-09T21:00:00Z") }; // 23:00 Zürich
    expect(cleaningRelockObligation(spaet, lockPeriod, user, 15, enforcedFrom)).toBeNull();
  });

  it("keine Pflicht, wenn der Nutzer gar nicht reinigen darf", () => {
    expect(cleaningRelockObligation(opening, lockPeriod, { ...user, cleaningAllowed: false }, 15, enforcedFrom)).toBeNull();
  });

  it("keine Pflicht, wenn die Sperrzeit VOR der Frist endet — es bliebe nichts zu verletzen", () => {
    const kurz = { cleaningAllowed: true, endsAt: new Date("2026-07-09T19:00:00Z") }; // vor dem Fensterende
    expect(cleaningRelockObligation(opening, kurz, user, 15, enforcedFrom)).toBeNull();
  });

  it("andere Öffnungsgründe begründen keine Pflicht", () => {
    expect(cleaningRelockObligation({ ...opening, oeffnenGrund: "KEYHOLDER" }, lockPeriod, user, 15, enforcedFrom)).toBeNull();
  });
});

describe("isCleaningNotRelocked", () => {
  const deadline = new Date("2026-07-09T20:15:00Z");

  it("is not-relocked when still open past the deadline", () => {
    expect(isCleaningNotRelocked(deadline, null, new Date("2026-07-09T20:15:01Z"))).toBe(true);
  });

  it("is not flagged when still open before the deadline", () => {
    expect(isCleaningNotRelocked(deadline, null, new Date("2026-07-09T20:14:59Z"))).toBe(false);
  });

  it("is not-relocked when the VERSCHLUSS came after the deadline", () => {
    const relockAt = new Date("2026-07-09T20:15:01Z");
    expect(isCleaningNotRelocked(deadline, relockAt, new Date("2026-07-10T00:00:00Z"))).toBe(true);
  });

  it("is not flagged when the VERSCHLUSS came on or before the deadline", () => {
    const relockAt = new Date("2026-07-09T20:15:00Z");
    expect(isCleaningNotRelocked(deadline, relockAt, new Date("2026-07-10T00:00:00Z"))).toBe(false);
  });
});

// ─── Prisma-Doppelgänger, geteilt von allen buildStrafbuch-Blöcken ─────────
// Modulweit statt je describe: sonst hängt ein Block, der einen Mock NICHT setzt, am Nachlass des
// vorherigen (`vi.clearAllMocks()` löscht die Aufrufe, nicht die Implementierungen) und schlägt
// allein ausgeführt anders aus als in der vollen Suite.

const db = prisma as unknown as PrismaMock;

const oeffnung = (startTime: Date, id = "e1") => ({
  id, type: "OEFFNEN", startTime, oeffnenGrund: "REINIGUNG", note: null, source: "user",
});

/** Zwei findMany auf derselben Tabelle (SPERRZEIT + ANFORDERUNG) — nach `art` unterscheiden,
 *  statt sich auf die Aufrufreihenfolge im Promise.all zu verlassen. */
const mockLockPeriods = (rows: unknown[]) =>
  db.verschlussAnforderung.findMany.mockImplementation((args: { where?: { art?: string } }) =>
    Promise.resolve(args?.where?.art === "SPERRZEIT" ? rows : []),
  );

/** Dieselbe Unterscheidung für `entry.findMany`: buildStrafbuch liest darüber auch VERSCHLUSS. */
const mockEntriesOfType = (type: string, rows: unknown[]) =>
  db.entry.findMany.mockImplementation((args: { where?: { type?: string } }) =>
    Promise.resolve(args?.where?.type === type ? rows : []),
  );
const mockOeffnungen = (rows: unknown[]) => mockEntriesOfType("OEFFNEN", rows);
const mockVerschluesse = (rows: unknown[]) => mockEntriesOfType("VERSCHLUSS", rows);

/** Der Stichtag dieser Instanz, wie ihn die Migration beim ersten Boot schreibt. */
const mockStichtag = (iso: string) =>
  db.appMeta.findUnique.mockResolvedValue({ key: "cleaningWindowEnforcedFrom", value: iso, updatedAt: new Date(iso) });

/**
 * Das Strafbuch muss dieselbe Regel anwenden wie die Durchsetzung. Einmal tat es das nicht: es prüfte
 * das User-Flag und das Sperrzeit-Flag, aber NICHT das Reinigungsfenster. Eine Reinigungsöffnung
 * ausserhalb des Fensters zog die Sperrzeit zurück (`releaseLockPeriodsOnOpen`) und galt hier
 * trotzdem als erlaubt — kein unerlaubtes Öffnen, stattdessen eine Wiederverschluss-Frist. Die Sperre
 * brach, und nichts stand im Buch.
 */
describe("buildStrafbuch — die Reinigungsöffnung und das Zeitfenster", () => {
  const TZ = "Europe/Zurich";

  const USER = {
    cleaningAllowed: true,
    cleaningMaxPerDay: 0, // 0 = unbegrenzt → kein Kontingent-Verstoss dazwischen
    cleaningMaxMinutes: 15,
    cleaningWindows: [{ start: "19:00", end: "20:00" }],
    timezone: TZ,
  };

  // 2026-07-10 ist CEST (UTC+2).
  const IM_FENSTER = new Date("2026-07-10T17:30:00Z"); // 19:30 Ortszeit
  const NACHTS = new Date("2026-07-10T01:00:00Z"); // 03:00 Ortszeit
  const NOW = new Date("2026-07-10T22:00:00Z");

  /** Aktive, reinigungserlaubte Sperrzeit über den ganzen Tag. */
  const SPERRE = {
    id: "s1",
    createdAt: new Date("2026-07-09T22:00:00Z"),
    endsAt: new Date("2026-07-11T22:00:00Z"),
    withdrawnAt: null,
    cleaningAllowed: true,
    wirksamAb: null,
    fulfilledAt: null,
  };

  const mockOeffnung = (o: ReturnType<typeof oeffnung>) => mockOeffnungen([o]);

  beforeEach(() => {
    vi.clearAllMocks();
    db.user.findUnique.mockResolvedValue(USER);
    mockLockPeriods([SPERRE]);
    // Stichtag festnageln: hier steht die FENSTER-Regel zur Prüfung, nicht der Stichtag. Läge er
    // nach den Öffnungen dieses Blocks (10.07.), wären sie pauschal straffrei — der Test prüfte
    // dann nichts mehr.
    mockStichtag("2026-07-01T00:00:00Z");
  });

  it("innerhalb des Fensters: kein unerlaubtes Öffnen", async () => {
    mockOeffnung(oeffnung(IM_FENSTER));
    expect((await buildStrafbuch("u1", NOW)).unauthorizedOpenings).toHaveLength(0);
  });

  it("AUSSERHALB des Fensters: unerlaubtes Öffnen — und KEINE Wiederverschluss-Frist", async () => {
    mockOeffnung(oeffnung(NACHTS));
    const s = await buildStrafbuch("u1", NOW);
    expect(s.unauthorizedOpenings).toHaveLength(1);
    expect(s.unauthorizedOpenings[0].startTime).toEqual(NACHTS);
    // Ein gebrochenes Siegel ist kein versäumter Wiederverschluss.
    expect(s.cleaningNotRelocked).toHaveLength(0);
  });

  it("ohne konfigurierte Fenster ist Reinigung nicht zeitgebunden — auch nachts erlaubt", async () => {
    db.user.findUnique.mockResolvedValue({ ...USER, cleaningWindows: [] });
    mockOeffnung(oeffnung(NACHTS));
    expect((await buildStrafbuch("u1", NOW)).unauthorizedOpenings).toHaveLength(0);
  });

  it("VOR dem Stichtag: kein Vergehen, obwohl ausserhalb des Fensters", async () => {
    // Genau das rettet die fremden Instanzen beim Rollout: was vor IHREM Stichtag geschah, wird nach
    // den damals geltenden Regeln beurteilt — dort gab es die Fenster-Schranke noch nicht.
    mockStichtag("2026-07-11T00:00:00Z");   // Stichtag NACH der Öffnung (10.07., 03:00 Ortszeit)
    mockOeffnung(oeffnung(NACHTS));
    expect((await buildStrafbuch("u1", NOW)).unauthorizedOpenings).toHaveLength(0);
  });

  it("NACH dem Stichtag: dieselbe Öffnung ist ein Vergehen", async () => {
    mockStichtag("2026-07-09T00:00:00Z");   // Stichtag VOR der Öffnung
    mockOeffnung(oeffnung(NACHTS));
    expect((await buildStrafbuch("u1", NOW)).unauthorizedOpenings).toHaveLength(1);
  });

  it("die Sperrzeit verbietet Reinigung: unerlaubtes Öffnen, auch im Fenster", async () => {
    mockLockPeriods([{ ...SPERRE, cleaningAllowed: false }]);
    mockOeffnung(oeffnung(IM_FENSTER));
    expect((await buildStrafbuch("u1", NOW)).unauthorizedOpenings).toHaveLength(1);
  });

  it("der User darf gar nicht reinigen: unerlaubtes Öffnen, auch im Fenster", async () => {
    db.user.findUnique.mockResolvedValue({ ...USER, cleaningAllowed: false });
    mockOeffnung(oeffnung(IM_FENSTER));
    expect((await buildStrafbuch("u1", NOW)).unauthorizedOpenings).toHaveLength(1);
  });
});

/**
 * Der Gesundheits-Halt. Bis v6.0.2 ruhte allein die Wiege-Meldepflicht; jede andere Vergehensart
 * entstand während einer laufenden Pause weiter — samt der automatischen, die niemand entschieden
 * hat (Issue #91). Gefiltert wird jetzt zentral über `OFFENSE_LISTS`, damit eine neue Art nicht
 * still danebenfällt.
 */
describe("buildStrafbuch — der Gesundheits-Halt", () => {
  const TZ = "Europe/Zurich";
  const NOW = new Date("2026-07-10T22:00:00Z");
  const NACHTS = new Date("2026-07-10T01:00:00Z"); // 03:00 Ortszeit, ausserhalb jedes Fensters

  const USER = {
    cleaningAllowed: true,
    cleaningMaxPerDay: 0,
    cleaningMaxMinutes: 15,
    cleaningWindows: [{ start: "19:00", end: "20:00" }],
    timezone: TZ,
  };

  const SPERRE = {
    id: "s1",
    createdAt: new Date("2026-07-09T22:00:00Z"),
    endsAt: new Date("2026-07-11T22:00:00Z"),
    withdrawnAt: null,
    cleaningAllowed: true,
    wirksamAb: null,
    fulfilledAt: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    db.user.findUnique.mockResolvedValue(USER);
    mockLockPeriods([SPERRE]);
    mockStichtag("2026-07-01T00:00:00Z");
    mockOeffnungen([oeffnung(NACHTS)]);
  });

  // Die Implementierung überlebt `vi.clearAllMocks()` (siehe Kopf dieses Abschnitts) — ohne das
  // Zurücksetzen liefe der nächste Block mit einer Pause, die er nie gesetzt hat, und seine
  // Vergehen verschwänden lautlos.
  afterEach(() => {
    db.healthHold.findMany.mockResolvedValue([]);
  });

  it("ohne Halt bleibt die Öffnung ausserhalb des Fensters ein Vergehen", async () => {
    expect((await buildStrafbuch("u1", NOW)).unauthorizedOpenings).toHaveLength(1);
  });

  it("dieselbe Öffnung WÄHREND einer Pause ist keines", async () => {
    db.healthHold.findMany.mockResolvedValue([
      { createdAt: new Date("2026-07-09T12:00:00Z"), resolvedAt: new Date("2026-07-10T12:00:00Z") },
    ]);
    expect((await buildStrafbuch("u1", NOW)).unauthorizedOpenings).toHaveLength(0);
  });

  it("eine Pause, die erst NACH der Tat begann, ändert nichts", async () => {
    // Die Pause ist eine Aussage über einen Zeitraum, keine Amnestie für alles Frühere. Ohne diese
    // Grenze könnte eine rückwirkend gesetzte Pause die ganze Historie leerräumen.
    db.healthHold.findMany.mockResolvedValue([
      { createdAt: new Date("2026-07-10T06:00:00Z"), resolvedAt: null },
    ]);
    expect((await buildStrafbuch("u1", NOW)).unauthorizedOpenings).toHaveLength(1);
  });

  it("ein bereits BEURTEILTES Vergehen überlebt die Pause", async () => {
    // Ein gefälltes Urteil ist die Aufzeichnung einer Entscheidung. Fiele es aus der Ableitung,
    // hinge sein `StrafeRecord` an einem Vergehen, das keine Oberfläche mehr kennt.
    db.healthHold.findMany.mockResolvedValue([
      { createdAt: new Date("2026-07-09T12:00:00Z"), resolvedAt: new Date("2026-07-10T12:00:00Z") },
    ]);
    db.strafeRecord.findMany.mockResolvedValue([
      { id: "sr1", refId: "e1", offenseType: "OEFFNEN_ENTRY", bestraftDatum: NOW, notiz: null, judgedBy: "admin", erledigtAt: null },
    ]);
    expect((await buildStrafbuch("u1", NOW)).unauthorizedOpenings).toHaveLength(1);
  });
});

describe("buildStrafbuch — das Reinigungs-Kontingent zählt den Kalendertag der Sub", () => {
  // Beide Öffnungen liegen am SELBEN Auckland-Tag (11.07., 01:00 und 11:00 NZST = UTC+12),
  // aber an ZWEI VERSCHIEDENEN Zürich-Tagen (10.07. 15:00 und 11.07. 01:00 CEST = UTC+2).
  const FIRST = new Date("2026-07-10T13:00:00Z");
  const SECOND = new Date("2026-07-10T23:00:00Z");
  const NOW = new Date("2026-07-12T00:00:00Z");

  /** Nur diese zwei Felder tragen hier: ohne gemockte Sperrzeit steht die Fenster-Regel gar nicht
   *  zur Debatte, es zählt allein das Kontingent gegen den Kalendertag. */
  const USER = { cleaningMaxPerDay: 1, timezone: "Pacific/Auckland" };

  beforeEach(() => {
    vi.clearAllMocks();
    mockStichtag("2026-07-01T00:00:00Z");
    db.user.findUnique.mockResolvedValue(USER);
    // Absteigend wie das echte `orderBy: { startTime: "desc" }` — der Zähler sortiert selbst.
    mockOeffnungen([oeffnung(SECOND, "e2"), oeffnung(FIRST, "e1")]);
  });

  it("zwei Öffnungen am selben Sub-Tag: die zweite sprengt das Kontingent", async () => {
    const s = await buildStrafbuch("u1", NOW);
    expect(s.cleaningLimitViolations).toHaveLength(1);
    expect(s.cleaningLimitViolations[0].startTime).toEqual(SECOND);
  });

  it("dieselben Öffnungen bei einer Zürcher Sub: zwei Tage, kein Verstoss", async () => {
    // Die Gegenprobe hält den Beweis fest, dass die SUB-Zeitzone entscheidet — und nicht der
    // Zufall, dass die Öffnungen ohnehin ein Vergehen ergäben.
    db.user.findUnique.mockResolvedValue({ ...USER, timezone: "Europe/Zurich" });
    expect((await buildStrafbuch("u1", NOW)).cleaningLimitViolations).toHaveLength(0);
  });
});

// ─── Stichtag: ab wann gilt die Fenster-Regel? ─────────────────────────────

/**
 * Ein `late_lock` setzt voraus, dass der Sub die Anforderung überhaupt kannte. Erreichbar wurde das
 * Gegenteil über eine TERMINIERTE Anforderung mit ABSOLUTER Frist vor dem Auslöse-Zeitpunkt: sie
 * löst aus, wird nicht verschickt (der Sub ist schon verschlossen, die Sperrzeit wird übernommen) —
 * und hinterliesse eine Zeile mit abgelaufener Frist, für die niemand etwas kann.
 */
describe("buildStrafbuch — nie zugestellte Anforderungen sind keine Versäumnisse", () => {
  const JETZT = new Date("2026-07-31T18:00:00Z");
  const EXPIRED = new Date("2026-07-31T12:00:00Z");

  /** Eine ausgelöste, aber nie zugestellte Anforderung (`wirksamAb` gesetzt, `benachrichtigtAt` null). */
  const anforderung = (over: object = {}) => ({
    id: "a1", art: "ANFORDERUNG", endsAt: EXPIRED, fulfilledAt: null, message: null,
    wirksamAb: new Date("2026-07-31T17:00:00Z"), benachrichtigtAt: null, withdrawnAt: null, ...over,
  });

  const mockAnforderungen = (rows: unknown[]) =>
    db.verschlussAnforderung.findMany.mockImplementation((args: { where?: { art?: string } }) =>
      Promise.resolve(args?.where?.art === "ANFORDERUNG" ? rows : []),
    );

  beforeEach(() => {
    mockOeffnungen([]);
    db.user.findUnique.mockResolvedValue({
      cleaningAllowed: false, cleaningMaxPerDay: 0, cleaningMaxMinutes: 15,
      cleaningWindows: null, timezone: "Europe/Zurich",
    });
  });

  it("eine nie zugestellte Anforderung mit abgelaufener Frist ist KEIN late_lock", async () => {
    mockAnforderungen([anforderung()]);
    const sb = await buildStrafbuch("u1", JETZT);
    expect(sb.lateLocks).toEqual([]);
  });

  it("dieselbe Zeile ZUGESTELLT bleibt ein late_lock", async () => {
    mockAnforderungen([anforderung({ benachrichtigtAt: new Date("2026-07-31T17:00:05Z") })]);
    const sb = await buildStrafbuch("u1", JETZT);
    expect(sb.lateLocks.map((l) => l.id)).toEqual(["a1"]);
  });

  it("eine SOFORTIGE Anforderung (`wirksamAb` null) zählt weiterhin", async () => {
    // Sofort heisst: der Sub kennt sie per Konstruktion (siehe isHiddenFromSub).
    mockAnforderungen([anforderung({ wirksamAb: null })]);
    const sb = await buildStrafbuch("u1", JETZT);
    expect(sb.lateLocks.map((l) => l.id)).toEqual(["a1"]);
  });
});

describe("cleaningWindowEnforcedFrom — je Instanz, nicht je Code-Stand", () => {
  const NOW = new Date("2026-07-20T12:00:00Z");

  const mockRow = (value: string | null) =>
    db.appMeta.findUnique.mockResolvedValue(
      value === null ? null : { key: "cleaningWindowEnforcedFrom", value, updatedAt: NOW },
    );

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.CLEANING_WINDOW_ENFORCED_FROM;
  });

  afterEach(() => {
    delete process.env.CLEANING_WINDOW_ENFORCED_FROM;
  });

  it("nimmt den Stichtag aus der DB — dort schreibt ihn die Migration beim ersten Boot DIESER Instanz", async () => {
    // Der Stichtag ist ein Merkmal des DEPLOYS, nicht des Codes: dasselbe Image läuft auf 27
    // Instanzen, die es zu verschiedenen Zeitpunkten bekommen.
    // Genau das Format, das die Migration schreibt: ISO-8601 mit 'Z'. OHNE das 'Z' läse
    // `new Date(...)` die Zeichenkette als Ortszeit — der Stichtag läge auf einem CET-Server zwei
    // Stunden zu früh, und diese zwei Stunden würden rückwirkend bestraft.
    mockRow("2026-07-10T09:30:00Z");
    expect(await cleaningWindowEnforcedFrom(NOW)).toEqual(new Date("2026-07-10T09:30:00.000Z"));
  });

  it("die ENV übersteuert die DB-Zeile — für bewusstes Rückdatieren", async () => {
    mockRow("2026-07-20T00:00:00Z");
    process.env.CLEANING_WINDOW_ENFORCED_FROM = "2026-07-01T00:00:00Z";
    expect(await cleaningWindowEnforcedFrom(NOW)).toEqual(new Date("2026-07-01T00:00:00Z"));
  });

  it("eine unlesbare ENV fällt auf die DB-Zeile zurück — NICHT auf 'kein Stichtag'", async () => {
    // Ein NaN-Datum wäre in jedem Vergleich false: `startTime < NaN` → nichts gilt als grandfathered
    // → die GESAMTE Historie würde rückwirkend an der Fenster-Regel gemessen.
    mockRow("2026-07-10T00:00:00Z");
    process.env.CLEANING_WINDOW_ENFORCED_FROM = "übermorgen";
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await cleaningWindowEnforcedFrom(NOW)).toEqual(new Date("2026-07-10T00:00:00Z"));
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("fehlt die Zeile ganz, gilt AB JETZT — lieber ein Vergehen zu wenig als ein erfundenes", async () => {
    // Kann nur passieren, wenn die Migration nie lief. Dann ist `now` der einzige sichere Wert:
    // ein Stichtag in der Vergangenheit erfände Vergehen für Regeln, die damals nicht galten.
    mockRow(null);
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await cleaningWindowEnforcedFrom(NOW)).toEqual(NOW);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

/**
 * Ein bereits BEURTEILTES Vergehen überlebt jede Regeländerung — die Zusage, die
 * `applyOffenseRules` allen schaltbaren Arten gibt. `unauthorized_orgasm` liest ihre Regel schon
 * beim Ableiten und überspringt den Regel-Durchgang; ohne eigenen Schutz fiele sie als einzige
 * durch. Ausgelöst wird das durch eine von Hand ZURÜCKDATIERTE Regel-Zeile — der Weg, auf dem diese
 * Regel überhaupt rückwirkend scharf gestellt wird.
 */
describe("buildStrafbuch — beurteilter Orgasmus überlebt eine zurückdatierte Regel", () => {
  const TAT = new Date("2026-08-05T20:00:00Z");
  const NOW = new Date("2026-08-11T12:00:00Z");

  const ruleChange = (mode: string, effectiveFrom: Date) => ({
    offenseType: "unauthorized_orgasm", mode, effectiveFrom,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    db.user.findUnique.mockResolvedValue({
      cleaningAllowed: false, cleaningMaxPerDay: 0, cleaningMaxMinutes: 15,
      cleaningWindows: null, timezone: "Europe/Zurich",
    });
    mockLockPeriods([]);
    mockStichtag("2026-07-01T00:00:00Z");
    // Zurücksetzen, nicht dem Nachlass überlassen: `vi.clearAllMocks()` löscht die Aufrufe, nicht die
    // Implementierungen (siehe die Warnung am Kopf dieser Datei).
    db.orgasmusAnforderung.findMany.mockResolvedValue([]);
    // Der ORGASMUS-Eintrag, um den es geht — `mockOeffnungen` deckt nur OEFFNEN ab.
    db.entry.findMany.mockImplementation((args: { where?: { type?: string } }) =>
      Promise.resolve(args?.where?.type === "ORGASMUS"
        ? [{ id: "o1", startTime: TAT, orgasmusArt: null, note: null }]
        : []),
    );
  });

  it("ohne Urteil verschwindet er, wenn die Regel rückwirkend auf AUS steht", async () => {
    db.offenseRuleChange.findMany.mockResolvedValue([
      ruleChange("always", new Date("2026-08-01T00:00:00Z")),
      ruleChange("off", new Date("2026-08-04T00:00:00Z")),
    ]);
    db.strafeRecord.findMany.mockResolvedValue([]);

    expect((await buildStrafbuch("u1", NOW)).unauthorizedOrgasms).toHaveLength(0);
  });

  it("MIT Urteil bleibt er stehen — sonst hinge das Urteil ohne Anlass in der Luft", async () => {
    db.offenseRuleChange.findMany.mockResolvedValue([
      ruleChange("always", new Date("2026-08-01T00:00:00Z")),
      ruleChange("off", new Date("2026-08-04T00:00:00Z")),
    ]);
    db.strafeRecord.findMany.mockResolvedValue([{
      refId: "o1", offenseType: "UNAUTHORIZED_ORGASM", status: "PUNISHED",
      bestraftDatum: NOW, notiz: null, reason: "20 Schläge", judgedBy: "admin",
      erledigtAt: null, taskId: null,
    }]);

    expect((await buildStrafbuch("u1", NOW)).unauthorizedOrgasms).toMatchObject([{ id: "o1" }]);
  });

  it("hält auch gegen eine zurückdatierte lockedOnly-Regel ohne Sperrzeit", async () => {
    // Die zweite Hälfte des Schutzes: `lockedOnly` streicht alles, was ohne laufende Sperrzeit
    // passierte. Rückwirkend gesetzt träfe das ein bereits beurteiltes Vergehen genauso wie ein `off`.
    db.offenseRuleChange.findMany.mockResolvedValue([
      ruleChange("always", new Date("2026-08-01T00:00:00Z")),
      ruleChange("lockedOnly", new Date("2026-08-04T00:00:00Z")),
    ]);
    db.strafeRecord.findMany.mockResolvedValue([{
      refId: "o1", offenseType: "UNAUTHORIZED_ORGASM", status: "PUNISHED",
      bestraftDatum: NOW, notiz: null, reason: "20 Schläge", judgedBy: "admin",
      erledigtAt: null, taskId: null,
    }]);

    expect((await buildStrafbuch("u1", NOW)).unauthorizedOrgasms).toMatchObject([{ id: "o1" }]);
  });

  it("eine deckende Direktive lässt ihn auch MIT Urteil verschwinden", async () => {
    // Nur die REGEL wird überbrückt, nicht die Ableitung: deckt später eine Direktive den Orgasmus
    // ab, verschwindet er wie bei jeder anderen Art auch.
    db.offenseRuleChange.findMany.mockResolvedValue([ruleChange("always", new Date("2026-08-01T00:00:00Z"))]);
    db.strafeRecord.findMany.mockResolvedValue([{
      refId: "o1", offenseType: "UNAUTHORIZED_ORGASM", status: "PUNISHED",
      bestraftDatum: NOW, notiz: null, reason: "20 Schläge", judgedBy: "admin",
      erledigtAt: null, taskId: null,
    }]);
    db.orgasmusAnforderung.findMany.mockResolvedValue([{
      id: "d1", art: "GELEGENHEIT", beginsAt: new Date("2026-08-05T00:00:00Z"),
      endsAt: new Date("2026-08-06T00:00:00Z"), withdrawnAt: null, fulfilledAt: null,
      message: null, openingAllowed: false, wirksamAb: null, benachrichtigtAt: new Date("2026-08-05T00:00:00Z"),
    }]);

    expect((await buildStrafbuch("u1", NOW)).unauthorizedOrgasms).toHaveLength(0);
  });
});

/**
 * Die Aufgaben-Vergehen tragen ihre Herkunft mit: `state` allein sagt nicht, WAS schiefging.
 *
 * Seit eine eigene Nachweis-Frist die Aufgabe entscheiden kann, deckt `missed` drei Vorwürfe ab.
 * Welchen, entscheidet `taskFailureKind` aus `startedAt` und `hasRequirements` — fehlt eines der
 * beiden, wirft die Keyholder-Sicht dem Träger den falschen vor.
 */
describe("buildStrafbuch — der Beleg zum Aufgaben-Vergehen", () => {
  const NOW = new Date("2026-08-10T12:00:00Z");
  const START = new Date("2026-08-10T08:00:00Z");

  /** Verschlossen seit 08:00, nie geöffnet — die KG-Bedingung hält durchgehend. */
  const VERSCHLUSS = { id: "v1", type: "VERSCHLUSS", startTime: START, oeffnenGrund: null, note: null, source: "user" };

  const KG_CONDITION = { id: "r1", type: "KG_LOCKED", categoryId: null, deviceId: null, sortOrder: 0, category: null, device: null };

  /** Eine laufende Aufgabe mit einem Nachweis, dessen EIGENE Frist (09:00) längst verstrichen ist —
   *  die Haltefrist selbst läuft noch bis 18:00. */
  const task = (requirements: unknown[]) => [{
    id: "t1", title: "Foto schicken", description: null,
    holdUntil: new Date("2026-08-10T18:00:00Z"), startGraceMin: 30, holdDurationMin: null,
    proofOrderMatters: false, isPunishment: false, penaltyReason: null,
    createdAt: START, wirksamAb: null, benachrichtigtAt: null,
    completedAt: null, completionNote: null, withdrawnAt: null,
    requirements,
    proofs: [{
      id: "p1", sortOrder: 0, requireCode: false, dueOffsetMin: 60, submittedAt: null,
      imageExifTime: null, verifikationStatus: null, verifikationReason: null, reviewAccepted: null,
    }],
  }];

  beforeEach(() => {
    vi.clearAllMocks();
    db.user.findUnique.mockResolvedValue({
      cleaningAllowed: false, cleaningMaxPerDay: 0, cleaningMaxMinutes: 15,
      cleaningWindows: null, timezone: "Europe/Zurich",
    });
    mockVerschluesse([VERSCHLUSS]);
  });

  it("durchgehalten, Nachweis-Frist verstrichen: Versäumnis MIT Beginn", async () => {
    db.task.findMany.mockResolvedValue(task([KG_CONDITION]));

    const [t] = (await buildStrafbuch("u1", NOW)).unfulfilledTasks;
    expect(t.state).toBe("missed");
    // Der Beleg, an dem die Anzeige „nicht begonnen" von „Nachweis nicht erbracht" trennt.
    expect(t.startedAt).toEqual(START);
    expect(t.hasRequirements).toBe(true);
    // Und die Tatzeit ist die verstrichene Nachweis-Frist — kein Ablegen.
    expect(t.failedAt).toEqual(new Date("2026-08-10T09:00:00Z"));
  });

  it("nie verschlossen: dasselbe Versäumnis, aber OHNE Beginn", async () => {
    mockVerschluesse([]);
    db.task.findMany.mockResolvedValue(task([KG_CONDITION]));

    const [t] = (await buildStrafbuch("u1", NOW)).unfulfilledTasks;
    expect(t.state).toBe("missed");
    expect(t.startedAt).toBeNull();
    expect(t.hasRequirements).toBe(true);
  });

  /** Eine Aufgabe OHNE Bedingungen bekommt von `evaluateTask` per Konstruktion nie ein `startedAt`.
   *  Ohne `hasRequirements` wäre sie von „nie begonnen" nicht zu unterscheiden — und genau das ist
   *  ein Vorwurf, den es bei ihr gar nicht geben kann. */
  it("ohne Bedingungen: kein Beginn, aber auch nichts zu beginnen", async () => {
    db.task.findMany.mockResolvedValue(task([]));

    const [t] = (await buildStrafbuch("u1", NOW)).unfulfilledTasks;
    expect(t.state).toBe("missed");
    expect(t.startedAt).toBeNull();
    expect(t.hasRequirements).toBe(false);
  });
});

/**
 * Gemeldet am 19.08.2026: Die Keyholderin senkte das Tageskontingent von 2 auf 1 — und im Strafbuch
 * erschien daraufhin ein Vergehen für eine Reinigungsöffnung vom 13.08. Zu deren Zeit galten 2, die
 * App hatte dem Träger „1 von 2" angezeigt und ihn nicht gewarnt.
 *
 * Ursache war die Live-Ableitung: sie zählte die ganze Historie gegen den HEUTIGEN Spaltenwert.
 * Seither liest sie die Fassung, die zur Tatzeit galt (`CleaningRuleChange`) — dieselbe Lehre wie
 * bei den Vergehens-Regeln, nur für die Zahlen dahinter.
 */
describe("buildStrafbuch — die Reinigungs-Regeln gelten zur Tatzeit", () => {
  const TZ = "Europe/Zurich";
  const NOW = new Date("2026-08-19T20:00:00Z");

  /** Heutiger Stand: gesenkt auf eine Öffnung pro Tag. */
  const USER = {
    cleaningAllowed: true,
    cleaningMaxPerDay: 1,
    cleaningMaxMinutes: 15,
    cleaningWindows: null,
    timezone: TZ,
  };

  const GESENKT_AM = new Date("2026-08-19T07:00:00Z");
  const HISTORIE = [
    { allowed: true, maxMinutes: 15, maxPerDay: 2, windows: null, effectiveFrom: new Date(0) },
    { allowed: true, maxMinutes: 15, maxPerDay: 1, windows: null, effectiveFrom: GESENKT_AM },
  ];

  // Zwei Öffnungen am 13.08. (Ortszeit 09:00 und 11:41) — unter dem damaligen Kontingent von 2 in
  // Ordnung, unter dem heutigen von 1 wäre die zweite ein Vergehen.
  const DAMALS = [
    oeffnung(new Date("2026-08-13T07:00:00Z"), "alt1"),
    oeffnung(new Date("2026-08-13T09:41:00Z"), "alt2"),
  ];
  // Zwei Öffnungen am 19.08., beide NACH der Senkung.
  const HEUTE = [
    oeffnung(new Date("2026-08-19T08:00:00Z"), "neu1"),
    oeffnung(new Date("2026-08-19T10:30:00Z"), "neu2"),
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    db.user.findUnique.mockResolvedValue(USER);
    db.cleaningRuleChange.findMany.mockResolvedValue(HISTORIE);
    mockStichtag("2026-01-01T00:00:00Z");
  });

  it("die zweite Öffnung von damals bleibt straffrei — damals waren zwei erlaubt", async () => {
    mockOeffnungen(DAMALS);
    expect((await buildStrafbuch("u1", NOW)).cleaningLimitViolations).toHaveLength(0);
  });

  it("nach der Senkung ist die zweite Öffnung desselben Tages ein Vergehen", async () => {
    mockOeffnungen(HEUTE);
    const violations = (await buildStrafbuch("u1", NOW)).cleaningLimitViolations;
    expect(violations).toHaveLength(1);
    expect(violations[0].entryId).toBe("neu2");
  });

  it("beide Tage zusammen: nur der Tag nach der Senkung schlägt an", async () => {
    mockOeffnungen([...DAMALS, ...HEUTE]);
    const violations = (await buildStrafbuch("u1", NOW)).cleaningLimitViolations;
    expect(violations.map((v) => v.entryId)).toEqual(["neu2"]);
  });

  it("ohne Historie gilt der heutige Stand — sonst wäre nie etwas ein Vergehen", async () => {
    db.cleaningRuleChange.findMany.mockResolvedValue([]);
    mockOeffnungen(DAMALS);
    expect((await buildStrafbuch("u1", NOW)).cleaningLimitViolations).toHaveLength(1);
  });

  it("Kontingent 0 heisst unbegrenzt — auch wenn es zur Tatzeit galt", async () => {
    db.cleaningRuleChange.findMany.mockResolvedValue([
      { allowed: true, maxMinutes: 15, maxPerDay: 0, windows: null, effectiveFrom: new Date(0) },
    ]);
    mockOeffnungen([...DAMALS, ...HEUTE]);
    expect((await buildStrafbuch("u1", NOW)).cleaningLimitViolations).toHaveLength(0);
  });

  it("später abgeschaltete Reinigung macht frühere Öffnungen nicht nachträglich unerlaubt", async () => {
    // Die grössere Fassung desselben Fehlers: aus einer erlaubten Reinigungspause würde sonst
    // rückwirkend ein Sperrzeit-Bruch.
    db.user.findUnique.mockResolvedValue({ ...USER, cleaningAllowed: false });
    db.cleaningRuleChange.findMany.mockResolvedValue([
      { allowed: true, maxMinutes: 15, maxPerDay: 2, windows: null, effectiveFrom: new Date(0) },
      { allowed: false, maxMinutes: 15, maxPerDay: 2, windows: null, effectiveFrom: GESENKT_AM },
    ]);
    mockLockPeriods([{
      id: "s1",
      createdAt: new Date("2026-08-01T00:00:00Z"),
      endsAt: new Date("2026-08-31T00:00:00Z"),
      withdrawnAt: null,
      cleaningAllowed: true,
      wirksamAb: null,
      fulfilledAt: null,
    }]);
    mockOeffnungen([DAMALS[0]]);
    expect((await buildStrafbuch("u1", NOW)).unauthorizedOpenings).toHaveLength(0);
  });
});

/**
 * Der Vertrag, auf dem „Sofort aufschliessen" ruht.
 *
 * `releaseNow` beendet die Sperrzeit mit GENAU dem Zeitstempel, den die Öffnung trägt — und darauf,
 * dass ein Gleichstand nicht mehr als „aktiv" zählt, hängt die ganze Konstruktion: sonst stünde
 * jede von der Keyholderin ausgelöste Öffnung als unerlaubte im Strafbuch, obwohl sie selbst sie
 * ausgelöst hat.
 *
 * Die Regel lebt in einem einzigen `>` in `findActiveLockPeriod`. Wer daraus ein `>=` macht, kippt
 * das Verhalten lautlos — in der Ableitung sieht es aus wie eine Härtung, und die Wirkung zeigt
 * sich erst im Strafbuch eines fremden Subs. Diese beiden Fälle nageln es fest.
 */
describe("buildStrafbuch — die Sperrzeit, die im Moment der Öffnung endet", () => {
  const OPENED_AT = new Date("2026-07-10T12:00:00Z");
  const NOW = new Date("2026-07-10T22:00:00Z");

  /** Sperrzeit, die den Zeitpunkt der Öffnung umschliesst — beendet wird sie je Fall anders. */
  const lockEndingAt = (withdrawnAt: Date) => ({
    id: "s1",
    createdAt: new Date("2026-07-09T22:00:00Z"),
    endsAt: new Date("2026-07-11T22:00:00Z"),
    withdrawnAt,
    // Bewusst OHNE Reinigungserlaubnis: sonst entschiede die Fenster-Regel statt des Zeitstempels.
    cleaningAllowed: false,
    wirksamAb: null,
    fulfilledAt: null,
  });

  const keyholderOpening = { id: "e1", type: "OEFFNEN", startTime: OPENED_AT, oeffnenGrund: "KEYHOLDER", note: null, source: "user" };

  beforeEach(() => {
    vi.clearAllMocks();
    db.user.findUnique.mockResolvedValue({
      cleaningAllowed: false, cleaningMaxPerDay: 0, cleaningMaxMinutes: 15,
      cleaningWindows: [], timezone: "Europe/Zurich",
    });
    mockStichtag("2026-07-01T00:00:00Z");
    mockOeffnungen([keyholderOpening]);
  });

  it("gleicher Zeitstempel: die Öffnung ist KEIN Vergehen", async () => {
    mockLockPeriods([lockEndingAt(OPENED_AT)]);
    expect((await buildStrafbuch("u1", NOW)).unauthorizedOpenings).toHaveLength(0);
  });

  it("eine Millisekunde später beendet: die Sperrzeit galt noch, also IST es eines", async () => {
    // Die Gegenprobe. Ohne sie belegte der Test oben nur, dass gerade nichts anschlägt — nicht,
    // dass der Zeitstempel den Ausschlag gibt.
    mockLockPeriods([lockEndingAt(new Date(OPENED_AT.getTime() + 1))]);
    expect((await buildStrafbuch("u1", NOW)).unauthorizedOpenings).toHaveLength(1);
  });
});
