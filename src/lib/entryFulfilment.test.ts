import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";

/**
 * `applyEntryFulfilment` ist die eine Erfüllungs-Logik beider Erfassungs-Pfade. Ihr einziger
 * Unterschied ist der Parameter `at` — Stichtag der Auswahl UND Erfüllungs-Zeitstempel:
 *
 *   Sub-Pfad       `at = new Date()`      (Server-Uhr; die Eintrags-Zeit ist frei wählbar)
 *   Keyholder-Pfad `at = entry.startTime` (dort ist Rückdatieren erlaubt)
 *
 * Genau daran hängt, ob ein nachgetragener Eintrag ein „zu spät"-Vergehen erzeugt oder auflöst —
 * das Strafbuch leitet es live aus `fulfilledAt` gegen die Frist ab (siehe strafbuch.ts).
 */

const txMock = {
  kontrollAnforderung: { findFirst: vi.fn(), update: vi.fn() },
  verschlussAnforderung: { findMany: vi.fn(), updateMany: vi.fn(), createMany: vi.fn() },
  orgasmusAnforderung: { findFirst: vi.fn(), update: vi.fn() },
};
vi.mock("@/lib/prisma", () => ({ prisma: { strafeRecord: { create: vi.fn() } } }));

import { applyEntryFulfilment } from "./entryFulfilment";
import { isPastDeadlineUnfulfilled } from "./utils";

/** Die Frist der Anordnung: „schliess dich bis 20:00 ein." */
const DEADLINE = new Date("2026-08-03T20:00:00Z");
/** Der Sub handelt pünktlich um 19:30 … */
const ON_TIME = new Date("2026-08-03T19:30:00Z");
/** … die Keyholderin trägt es aber erst am nächsten Tag nach. */
const RECORDED_LATER = new Date("2026-08-04T09:00:00Z");
const HOUR = 60 * 60 * 1000;

/** Kein Kontroll-Kontext — jeder Eintrag, der keine PRUEFUNG ist. */
const NO_INSPECTION = { verification: null, targetWhere: null };
/** Eine Kontroll-Einreichung samt Ziel-Schranke (hier: KG), wie `deriveEntryVerification` sie liefert. */
const inspection = (verification: Parameters<typeof applyEntryFulfilment>[2]["verification"]) =>
  ({ verification, targetWhere: { categoryId: null } });

const entry = (over: Partial<{ type: string; startTime: Date; orgasmusArt: string | null }> = {}) => ({
  id: "e1", userId: "u1", type: "VERSCHLUSS", startTime: ON_TIME, orgasmusArt: null, ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  txMock.verschlussAnforderung.findMany.mockResolvedValue([]);
  txMock.kontrollAnforderung.findFirst.mockResolvedValue(null);
  txMock.orgasmusAnforderung.findFirst.mockResolvedValue(null);
});

/** Die eine offene Anordnung mit Frist 20:00 und 24 h Sperre. */
function openLockRequest() {
  txMock.verschlussAnforderung.findMany.mockResolvedValue([
    { id: "a1", deviceId: null, nachricht: "24h drin bleiben", reinigungErlaubt: true, dauerH: 24, sperrEndetAt: null },
  ]);
}

describe("Verschluss-Anforderung — `at` entscheidet über das Vergehen", () => {
  it("Keyholder-Nachtrag mit pünktlicher Zeit erfüllt VOR der Frist → kein Vergehen", async () => {
    openLockRequest();
    // Keyholder-Pfad: `at` ist die Eintrags-Zeit, NICHT der Moment des Erfassens.
    await applyEntryFulfilment(txMock as never, entry(), NO_INSPECTION, ON_TIME);

    const { data } = txMock.verschlussAnforderung.updateMany.mock.calls[0][0] as { data: { fulfilledAt: Date } };
    expect(data.fulfilledAt).toEqual(ON_TIME);
    // Das Strafbuch liest genau diesen Wert — pünktlich erfüllt heisst: nicht zu spät.
    expect(isPastDeadlineUnfulfilled(DEADLINE, data.fulfilledAt, RECORDED_LATER)).toBe(false);
  });

  it("derselbe Nachtrag mit dem Erfassungs-Moment als `at` erzeugt das Vergehen — der alte Zustand", async () => {
    openLockRequest();
    await applyEntryFulfilment(txMock as never, entry(), NO_INSPECTION, RECORDED_LATER);

    const { data } = txMock.verschlussAnforderung.updateMany.mock.calls[0][0] as { data: { fulfilledAt: Date } };
    expect(isPastDeadlineUnfulfilled(DEADLINE, data.fulfilledAt, RECORDED_LATER)).toBe(true);
  });

  it("eine Eintrags-Zeit NACH der Frist bleibt ein Vergehen — Rückdatieren wäscht nicht pauschal rein", async () => {
    openLockRequest();
    const zuSpaet = new Date("2026-08-03T20:05:00Z");
    await applyEntryFulfilment(txMock as never, entry({ startTime: zuSpaet }), NO_INSPECTION, zuSpaet);

    const { data } = txMock.verschlussAnforderung.updateMany.mock.calls[0][0] as { data: { fulfilledAt: Date } };
    expect(isPastDeadlineUnfulfilled(DEADLINE, data.fulfilledAt, RECORDED_LATER)).toBe(true);
  });

  it("die Auswahl der Anforderungen läuft gegen `at`, nicht gegen die Uhr", async () => {
    openLockRequest();
    await applyEntryFulfilment(txMock as never, entry(), NO_INSPECTION, ON_TIME);

    const { where } = txMock.verschlussAnforderung.findMany.mock.calls[0][0] as {
      where: { OR: unknown[]; createdAt: { lte: Date } };
    };
    // activeVerschlussAnforderungWhere(at): nur was zu DIESEM Zeitpunkt schon ausgelöst war.
    expect(where.OR).toEqual([{ wirksamAb: null }, { wirksamAb: { lte: ON_TIME } }]);
    // Und — die eigentliche Rückdatierungs-Schranke — nur was es damals schon GAB. Ohne sie hakte
    // ein zurückdatierter Verschluss eine erst danach gestellte Anordnung ab und erzeugte eine
    // Sperrzeit, die im Moment ihrer Entstehung bereits abgelaufen wäre.
    expect(where.createdAt).toEqual({ lte: ON_TIME });
  });

  it("die Sperrzeit rechnet ab der Eintrags-Zeit, nicht ab dem Nachtrag", async () => {
    openLockRequest();
    await applyEntryFulfilment(txMock as never, entry(), NO_INSPECTION, ON_TIME);

    const { data } = txMock.verschlussAnforderung.createMany.mock.calls[0][0] as { data: { endetAt: Date }[] };
    expect(data[0].endetAt).toEqual(new Date(ON_TIME.getTime() + 24 * HOUR));
  });

  it("ohne offene Anforderung passiert nichts — und es gibt keine Geräte-Vorgabe", async () => {
    const required = await applyEntryFulfilment(txMock as never, entry(), NO_INSPECTION, ON_TIME);
    expect(txMock.verschlussAnforderung.updateMany).not.toHaveBeenCalled();
    expect(txMock.verschlussAnforderung.createMany).not.toHaveBeenCalled();
    expect(required).toEqual([]);
  });

  it("gibt die geforderten Geräte zurück (Grundlage der Falsch-Gerät-Ahndung)", async () => {
    txMock.verschlussAnforderung.findMany.mockResolvedValue([
      { id: "a1", deviceId: "d1", nachricht: null, reinigungErlaubt: false, dauerH: null, sperrEndetAt: null },
      { id: "a2", deviceId: null, nachricht: null, reinigungErlaubt: false, dauerH: null, sperrEndetAt: null },
    ]);
    const required = await applyEntryFulfilment(txMock as never, entry(), NO_INSPECTION, ON_TIME);
    expect(required).toEqual(["d1"]);
  });
});

describe("Kontroll-Anforderung", () => {
  it("mit Code-Pflicht ist der Code der Schlüssel — und `at` der Erfüllungs-Zeitstempel", async () => {
    txMock.kontrollAnforderung.findFirst.mockResolvedValue({ id: "k1" });
    await applyEntryFulfilment(
      txMock as never,
      entry({ type: "PRUEFUNG" }),
      inspection({ kind: "code", code: "89758", sealCode: null }),
      ON_TIME,
    );

    const { where } = txMock.kontrollAnforderung.findFirst.mock.calls[0][0] as {
      where: { code: string; createdAt: { lte: Date } };
    };
    expect(where.code).toBe("89758");
    // Dieselbe Schranke wie bei den Verschluss-Anforderungen: ein auf 09:00 zurückdatierter
    // Eintrag darf keine erst um 14:00 gestellte Kontrolle beantworten.
    expect(where.createdAt).toEqual({ lte: ON_TIME });
    const { data } = txMock.kontrollAnforderung.update.mock.calls[0][0] as { data: { fulfilledAt: Date; entryId: string } };
    expect(data).toEqual({ entryId: "e1", fulfilledAt: ON_TIME });
  });

  it("freiwillige Selbstkontrolle an einem Gerät MIT Code-Pflicht erfüllt nichts", async () => {
    await applyEntryFulfilment(
      txMock as never,
      entry({ type: "PRUEFUNG" }),
      inspection({ kind: "none", codeRequired: true }),
      ON_TIME,
    );
    expect(txMock.kontrollAnforderung.findFirst).not.toHaveBeenCalled();
    expect(txMock.kontrollAnforderung.update).not.toHaveBeenCalled();
  });

  it("ohne Code-Pflicht beantwortet das Foto die eine offene, code-lose Anforderung", async () => {
    txMock.kontrollAnforderung.findFirst.mockResolvedValue({ id: "k2" });
    await applyEntryFulfilment(
      txMock as never,
      entry({ type: "PRUEFUNG" }),
      inspection({ kind: "none", codeRequired: false }),
      ON_TIME,
    );
    const { where } = txMock.kontrollAnforderung.findFirst.mock.calls[0][0] as { where: { code: null } };
    expect(where.code).toBeNull();
    expect(txMock.kontrollAnforderung.update).toHaveBeenCalled();
  });

  it("ohne Verifikations-Kontext (kein Foto/kein Lock) wird nichts erfüllt", async () => {
    await applyEntryFulfilment(txMock as never, entry({ type: "PRUEFUNG" }), NO_INSPECTION, ON_TIME);
    expect(txMock.kontrollAnforderung.findFirst).not.toHaveBeenCalled();
  });
});

describe("Orgasmus-Anforderung", () => {
  it("das FENSTER prüft immer die Eintrags-Zeit, der Stempel folgt `at`", async () => {
    txMock.orgasmusAnforderung.findFirst.mockResolvedValue({ id: "o1", vorgegebeneArt: null });
    await applyEntryFulfilment(
      txMock as never,
      entry({ type: "ORGASMUS", startTime: ON_TIME }),
      NO_INSPECTION,
      RECORDED_LATER,
    );

    const { where } = txMock.orgasmusAnforderung.findFirst.mock.calls[0][0] as {
      where: { beginntAt: { lte: Date }; endetAt: { gte: Date } };
    };
    expect(where.beginntAt.lte).toEqual(ON_TIME);
    expect(where.endetAt.gte).toEqual(ON_TIME);
    const { data } = txMock.orgasmusAnforderung.update.mock.calls[0][0] as { data: { fulfilledAt: Date } };
    expect(data.fulfilledAt).toEqual(RECORDED_LATER);
  });

  it("passt die vorgegebene Art nicht, bleibt die Anforderung offen", async () => {
    txMock.orgasmusAnforderung.findFirst.mockResolvedValue({ id: "o1", vorgegebeneArt: "RUINIERT" });
    await applyEntryFulfilment(
      txMock as never,
      entry({ type: "ORGASMUS", orgasmusArt: "VOLL" }),
      NO_INSPECTION,
      ON_TIME,
    );
    expect(txMock.orgasmusAnforderung.update).not.toHaveBeenCalled();
  });
});

describe("Typ-Trennung", () => {
  it("ein Verschluss fasst weder Kontroll- noch Orgasmus-Anforderungen an", async () => {
    openLockRequest();
    await applyEntryFulfilment(txMock as never, entry(), NO_INSPECTION, ON_TIME);
    expect(txMock.kontrollAnforderung.findFirst).not.toHaveBeenCalled();
    expect(txMock.orgasmusAnforderung.findFirst).not.toHaveBeenCalled();
  });

  it("eine Öffnung erfüllt gar nichts", async () => {
    await applyEntryFulfilment(txMock as never, entry({ type: "OEFFNEN" }), NO_INSPECTION, ON_TIME);
    expect(txMock.verschlussAnforderung.findMany).not.toHaveBeenCalled();
    expect(txMock.kontrollAnforderung.findFirst).not.toHaveBeenCalled();
    expect(txMock.orgasmusAnforderung.findFirst).not.toHaveBeenCalled();
  });
});

/**
 * Der Header oben beschreibt die Asymmetrie der beiden Pfade — geprüft wurde bisher nur, dass
 * `applyEntryFulfilment` das übergebene `at` treu verarbeitet. WELCHES `at` die Routen übergeben,
 * prüfte niemand, und genau dort sitzt die Sicherheitseigenschaft aus `bb818d2c`: übergäbe der
 * Sub-Pfad `created.startTime` statt der Server-Uhr, wäre die Rückdatier-Lücke zurück — jeder Test
 * dieser Datei bliebe grün, weil die Funktion ja weiterhin korrekt rechnet.
 *
 * Bauart nach `appName.test.ts`: die Aufrufstelle wird als TEXT gelesen. Die Alternative wäre ein
 * Routen-Test mit Attrappen für Prisma, Auth, Box und Benachrichtigungen — viel Gerüst für eine
 * Eigenschaft, die aus einem Argument besteht.
 *
 * **Warum die Argumente zerlegt werden, statt im ganzen Aufruf nach Text zu suchen.** Beides war
 * hier schon falsch gebaut und fiel erst im Review auf:
 *
 *   1. Ein Ausschnitt bis zur ersten `);` endet mitten im Aufruf, sobald ein KOMMENTAR darin ein
 *      `foo();` enthält. Die belastende Zeile liegt dann ausserhalb — und eine `not.toMatch`-Zusage
 *      wird GRÜN, gerade weil der Text fehlt. Klammer-Tiefe kennt dieses Versagen nicht: ein
 *      Kommentar mit `foo();` ist ausgeglichen.
 *   2. `toContain("new Date()")` über den ganzen Aufruf sagt nur, dass irgendwo eine Server-Uhr
 *      steht — nicht, dass sie das `at`-Argument IST. `submittedAt: new Date()` im Options-Objekt
 *      erfüllt die Zusage, während `at` längst die frei gewählte Nutzer-Zeit trägt.
 *
 * Deshalb: Argumente über die Klammer-Tiefe trennen und das LETZTE exakt vergleichen. Geht die
 * Zerlegung schief, stimmt die Argument-Zahl nicht mehr und der Wächter wird ROT — die Richtung,
 * in die ein Wächter versagen muss.
 */
describe("Welche Uhr die Erfassungs-Routen an applyEntryFulfilment geben", () => {
  /**
   * Die Argumente eines Aufrufs als Quelltext, über die Klammer-Tiefe getrennt.
   * Der Import (`import { applyEntryFulfilment, … }`) kann nicht getroffen werden: dort folgt dem
   * Bezeichner nie eine öffnende Klammer.
   */
  function callArgs(file: string): string[] {
    const src = readFileSync(file, "utf8");
    const at = src.indexOf("applyEntryFulfilment(");
    expect(at, `kein Aufruf von applyEntryFulfilment( in ${file}`).toBeGreaterThan(-1);

    const args: string[] = [];
    let cur = "";
    let depth = 0;
    for (let i = at + "applyEntryFulfilment".length; i < src.length; i++) {
      const c = src[i];
      if (c === "(" || c === "{" || c === "[") {
        if (++depth === 1) continue;
      } else if (c === ")" || c === "}" || c === "]") {
        if (--depth === 0) { args.push(cur); break; }
      } else if (c === "," && depth === 1) {
        args.push(cur); cur = ""; continue;
      }
      cur += c;
    }
    return args.map((a) => a.trim()).filter((a) => a.length > 0);
  }

  const sub = callArgs("src/app/api/entries/route.ts");
  const admin = callArgs("src/app/api/admin/entries/route.ts");

  it("zerlegt beide Aufrufe vollständig", () => {
    // Der Selbsttest des Wächters: stimmt die Zahl nicht, ist die Zerlegung an einer Klammer
    // gescheitert und JEDE Aussage darunter wertlos. Lieber hier rot als unten falsch grün.
    expect(sub, "Sub-Pfad: (tx, created, opts, at)").toHaveLength(4);
    expect(admin, "Keyholder-Pfad: (tx, created, opts, at)").toHaveLength(4);
  });

  it("der Sub-Pfad übergibt die SERVER-Uhr, nie eine Zeit aus dem Eintrag", () => {
    // Exakt das letzte Argument, nicht „irgendwo im Aufruf": `created.startTime` ist die frei
    // gewählte Zeit, und `new Date(startTime)` — in derselben Datei dreimal vorhanden — wäre
    // dieselbe Lücke in Tarnung. Beide fallen hier durch.
    // Wird das Argument je zu einer Variablen (`const at = new Date()` darüber), schlägt dieser
    // Test an: dann prüfen, ob sie WIRKLICH die Server-Uhr trägt, und den Vergleich nachziehen.
    expect(sub[3]).toBe("new Date()");
  });

  it("der Keyholder-Pfad darf rückdatieren — ausser er erfasst für sich selbst", () => {
    expect(admin[3]).toBe("fulfilAt");
    // Die RICHTUNG des Ternärs ist die Eigenschaft, nicht sein Vorhandensein: erfasst die
    // Keyholderin für SICH, ist sie der Sub und es gilt die Server-Uhr. Vertauscht bedeutete
    // dieselbe Zeile das Gegenteil — und wäre die offene Hintertür.
    const decl = readFileSync("src/app/api/admin/entries/route.ts", "utf8")
      .match(/const fulfilAt = .*/)?.[0] ?? "";
    expect(decl).toMatch(/userId === session\.user\.id\s*\?\s*new Date\(\)\s*:\s*entryTime/);
  });
});
