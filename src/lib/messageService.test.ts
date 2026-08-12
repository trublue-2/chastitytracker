import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";

// Der Service liest Nachrichten + die vier Bezugsobjekte und schreibt Lese-Kennzeichen.
vi.mock("@/lib/prisma", () => ({
  prisma: {
    // Die Lese-Kennzeichen laufen seit v5.1 in EINER Transaktion statt in N Einzel-Upserts.
    $transaction: vi.fn((ops: unknown[]) => Promise.all(ops)),
    message: { create: vi.fn(), findMany: vi.fn(), findFirst: vi.fn(), deleteMany: vi.fn(), count: vi.fn() },
    messageRead: { upsert: vi.fn(), deleteMany: vi.fn(), createMany: vi.fn() },
    strafeRecord: { findMany: vi.fn() },
    kontrollAnforderung: { findMany: vi.fn() },
    verschlussAnforderung: { findMany: vi.fn() },
    orgasmusAnforderung: { findMany: vi.fn() },
    task: { findMany: vi.fn() },
    // Der Service fragt sie NICHT (mehr): der Name des Trägers kommt mit dem Scope herein. Der
    // Doppelgänger bleibt stehen, damit die Tests unten belegen können, dass nichts nachgeschlagen
    // wird — ohne ihn wäre ein `not.toHaveBeenCalled()` gar nicht formulierbar.
    user: { findMany: vi.fn() },
  },
}));

import {
  MESSAGE_BODY_KEYS,
  recordSystemMessage,
  listMessages,
  unreadCount,
  markAllRead,
  setRead,
  setReadMany,
  deleteMessage,
  subInbox,
  keyholderInbox,
} from "./messageService";
import { prisma } from "@/lib/prisma";

const mock = (fn: unknown) => fn as unknown as ReturnType<typeof vi.fn>;

/** Der Posteingang des Trägers — er ist Betreff UND Leser. */
const sub = subInbox;
/**
 * Der Posteingang eines Keyholders, aus blossen Ids gebaut.
 *
 * Im Betrieb kommen Id UND Benutzername aus derselben Abfrage (`getControllableSubs`, über den
 * Guard) — hier ist der Name meist gleichgültig, also steht die Id an seiner Stelle. Wo er zählt,
 * gibt der Test ihn ausdrücklich mit.
 */
const kh = (readerId: string, subIds: string[], names: Record<string, string> = {}) =>
  keyholderInbox(readerId, subIds.map((id) => ({ id, username: names[id] ?? id })));

beforeEach(() => {
  vi.clearAllMocks();
  mock(prisma.message.create).mockResolvedValue({ id: "m-new" });
  // Der Posteingang blättert seit v5.1 über Seiten: die Zählung entscheidet, wie viele es gibt.
  mock(prisma.message.count).mockResolvedValue(1);
  // `vi.clearAllMocks()` leert nur die Aufruf-Listen, NICHT die hinterlegten Rückgaben. Ohne diesen
  // Startwert erbt ein Test still das `mockResolvedValue` des vorherigen — und allein stehend
  // (`it.only`, andere Datei-Reihenfolge) liefert `findMany` dann `undefined`, woran die Auflösung
  // stirbt statt eine leere Liste zu sehen. Genau daran sind hier schon Tests gescheitert.
  mock(prisma.message.findMany).mockResolvedValue([]);
  for (const m of [prisma.strafeRecord, prisma.kontrollAnforderung, prisma.verschlussAnforderung, prisma.orgasmusAnforderung, prisma.user]) {
    mock(m.findMany).mockResolvedValue([]);
  }
});

/**
 * Eine Nachrichten-Zeile, wie sie `findMany` liefert.
 *
 * `subjectUserId` gehört dazu, seit der Referenz-Schlüssel den TRÄGER trägt (`subjectUserId:typ:id`):
 * ohne ihn schlüge jede Zeile unter `undefined:…` nach und die Tests belegten nur, dass zwei
 * Undefinierte zusammenpassen. Die Bezugsobjekte weiter unten tragen ihr `userId` aus demselben
 * Grund — beide Seiten müssen denselben Träger nennen, sonst löst sich nichts auf.
 */
function row(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: "m1",
    subjectUserId: "u1",
    createdAt: new Date("2026-07-28T10:00:00Z"),
    senderKind: "keyholder",
    bodyKey: "penaltyMessageNoReason",
    bodyParams: null,
    body: null,
    refEntityType: null,
    refEntityId: null,
    reads: [],
    ...over,
  };
}

describe("Nachrichten-Texte sind übersetzt", () => {
  // Ohne diesen Test landet ein Schlüssel ohne Übersetzung als roher Token im Posteingang — der
  // Compiler prüft nur, dass der Schlüssel DEKLARIERT ist, nicht dass er existiert.
  it("jeder MESSAGE_BODY_KEY hat einen Eintrag in de.json UND en.json", () => {
    const namespaces = ["de", "en"].map(
      (loc) => JSON.parse(readFileSync(`messages/${loc}.json`, "utf8")).emails as Record<string, string>,
    );
    expect(MESSAGE_BODY_KEYS.length).toBeGreaterThan(0);
    for (const key of MESSAGE_BODY_KEYS) {
      for (const ns of namespaces) expect(ns[key], key).toBeTruthy();
    }
  });
});

describe("recordSystemMessage", () => {
  it("schreibt IMMER den Schlüssel-Zweig und nie den Freitext — die Trennung hängt an der Factory", async () => {
    await recordSystemMessage({ subjectUserId: "u1", bodyKey: "penaltyMessage", params: { reason: "x" } });
    const data = mock(prisma.message.create).mock.calls[0][0].data;
    expect(data.bodyKey).toBe("penaltyMessage");
    expect(data.bodyParams).toBe(JSON.stringify({ reason: "x" }));
    expect(data.body).toBeUndefined();
  });

  it("reisst die auslösende Direktive nicht mit, wenn das Schreiben scheitert", async () => {
    mock(prisma.message.create).mockRejectedValue(new Error("db weg"));
    await expect(recordSystemMessage({ subjectUserId: "u1", bodyKey: "penaltyMessage" })).resolves.toBeNull();
  });
});

describe("verborgene Direktiven bleiben verborgen", () => {
  // Der teuerste Fehler, den dieses Feature machen kann: eine Nachricht, die eine terminierte, noch
  // nicht ausgelöste Direktive verrät. Deshalb filtert die ABFRAGE, nicht erst die Anzeige.
  const hiddenControl = { id: "ka1", userId: "u1", kommentar: null, wirksamAb: new Date("2026-08-01T10:00:00Z"), benachrichtigtAt: null };
  const messageOnHiddenControl = row({ refEntityType: "control", refEntityId: "ka1" });

  it("die Liste liefert eine Nachricht zu einer noch nicht ausgelösten Kontrolle nicht aus", async () => {
    mock(prisma.message.findMany).mockResolvedValue([messageOnHiddenControl]);
    mock(prisma.kontrollAnforderung.findMany).mockResolvedValue([hiddenControl]);
    const { messages } = await listMessages(sub("u1"));
    expect(messages).toEqual([]);
  });

  it("der Zähler zählt sie ebenfalls nicht — sonst verriete schon die Glocke sie", async () => {
    mock(prisma.message.findMany).mockResolvedValue([messageOnHiddenControl]);
    mock(prisma.kontrollAnforderung.findMany).mockResolvedValue([hiddenControl]);
    expect(await unreadCount(sub("u1"))).toBe(0);
  });

  it("nach der Auslösung (benachrichtigtAt gesetzt) erscheint sie", async () => {
    mock(prisma.message.findMany).mockResolvedValue([messageOnHiddenControl]);
    mock(prisma.kontrollAnforderung.findMany).mockResolvedValue([
      { ...hiddenControl, benachrichtigtAt: new Date("2026-08-01T10:00:00Z") },
    ]);
    const { messages } = await listMessages(sub("u1"));
    expect(messages).toHaveLength(1);
  });

  it("alsoCount zählt die eben zugestellte Nachricht mit, solange der Poller den Stempel noch setzt", async () => {
    mock(prisma.message.findMany).mockResolvedValue([messageOnHiddenControl]);
    mock(prisma.kontrollAnforderung.findMany).mockResolvedValue([hiddenControl]);
    expect(await unreadCount(sub("u1"), ["m1"])).toBe(1);
  });
});

describe("Freitexte werden live gelesen, nicht kopiert", () => {
  it("der Straftext kommt aus dem StrafeRecord, nicht aus der Nachricht", async () => {
    mock(prisma.message.findMany).mockResolvedValue([row({ refEntityType: "offense", refEntityId: "s1" })]);
    mock(prisma.strafeRecord.findMany).mockResolvedValue([{ id: "s1", userId: "u1", reason: "korrigierter Text", status: "PUNISHED" }]);
    const { messages } = await listMessages(sub("u1"));
    expect(messages[0].refText).toBe("korrigierter Text");
    expect(messages[0].refMissing).toBe(false);
  });

  it("die GLOCKE zählt ein verworfenes Urteil ebenso wenig — sonst stünde ein Badge über einem leeren Posteingang", async () => {
    // Zähler und Liste müssen dieselbe Sichtbarkeit haben. Liefen sie auseinander, sähe der Sub
    // dauerhaft „1 ungelesen" und fände nichts, was er lesen könnte.
    mock(prisma.message.findMany).mockResolvedValue([row({ refEntityType: "offense", refEntityId: "s1" })]);
    mock(prisma.strafeRecord.findMany).mockResolvedValue([{ id: "s1", userId: "u1", status: "DISMISSED" }]);
    expect(await unreadCount(sub("u1"))).toBe(0);
  });

  it("ein VERWORFENES Urteil erreicht den Sub nicht — auch nicht über eine alte Nachricht", async () => {
    // `writeJudgment` upsertet auf `refId`: eine Korrektur PUNISHED→DISMISSED behält die Zeile, und
    // die alte „Strafe verhängt"-Nachricht zeigte danach die VERWERFUNGS-Begründung. Genau die
    // Nachricht ist dann nicht mehr wahr und wird ausgeblendet (`judgmentMessageStillApplies`).
    mock(prisma.message.findMany).mockResolvedValue([row({ refEntityType: "offense", refEntityId: "s1" })]);
    mock(prisma.strafeRecord.findMany).mockResolvedValue([{ id: "s1", userId: "u1", reason: "war abgesprochen", status: "DISMISSED" }]);
    const { messages } = await listMessages(sub("u1"));
    expect(messages).toHaveLength(0);
  });

  it("ein gelöschtes Bezugsobjekt wird als solches gemeldet, statt still zu verschwinden", async () => {
    mock(prisma.message.findMany).mockResolvedValue([row({ refEntityType: "offense", refEntityId: "weg" })]);
    const { messages } = await listMessages(sub("u1"));
    expect(messages[0].refMissing).toBe(true);
  });

  it("die ANWEISUNG einer Aufgabe kommt aus der Aufgabe — sie stand vorher gar nicht im Posteingang", async () => {
    // Der Titel bleibt bewusst ein Parameter der Nachricht (eine Nachricht ist die Aufzeichnung
    // dessen, was damals gesagt wurde); die Beschreibung ist der Freitext und wird live gelesen.
    mock(prisma.message.findMany).mockResolvedValue([row({ refEntityType: "task", refEntityId: "t1" })]);
    mock(prisma.task.findMany).mockResolvedValue([{ id: "t1", userId: "u1", description: "die ganze Wohnung, nicht nur das Wohnzimmer" }]);
    const { messages } = await listMessages(sub("u1"));
    expect(messages[0].refText).toBe("die ganze Wohnung, nicht nur das Wohnzimmer");
    expect(messages[0].refMissing).toBe(false);
  });

  it("eine Aufgabe ist nie verborgen — sie kennt keine Terminierung", async () => {
    mock(prisma.message.findMany).mockResolvedValue([row({ refEntityType: "task", refEntityId: "t1" })]);
    mock(prisma.task.findMany).mockResolvedValue([{ id: "t1", userId: "u1", description: null }]);
    const { messages } = await listMessages(sub("u1"));
    expect(messages).toHaveLength(1);
  });

  it("auch die Aufgabe wird auf den Sub eingegrenzt", async () => {
    mock(prisma.message.findMany).mockResolvedValue([row({ refEntityType: "task", refEntityId: "t1" })]);
    mock(prisma.task.findMany).mockResolvedValue([{ id: "t1", userId: "u1", description: null }]);
    await listMessages(sub("u1"));
    expect(mock(prisma.task.findMany).mock.calls[0][0].where).toMatchObject({ userId: { in: ["u1"] } });
  });

  it("Bezugsobjekte werden IMMER auf den Sub eingegrenzt (kein Blick in fremde Zeilen)", async () => {
    mock(prisma.message.findMany).mockResolvedValue([row({ refEntityType: "offense", refEntityId: "s1" })]);
    await listMessages(sub("u1"));
    expect(mock(prisma.strafeRecord.findMany).mock.calls[0][0].where).toMatchObject({ userId: { in: ["u1"] } });
  });
});

describe("die Verwerfungs-Meldung überlebt ihr Urteil nicht", () => {
  // Wird ein Urteil revidiert (reopen → erneut bestraft), behält die Zeile ihre `refId`
  // (`writeJudgment` upsertet darauf) und trägt danach PUNISHED samt STRAFtext. Die alte
  // „fallengelassen"-Nachricht behauptet dann mit der Strafe darunter das Gegenteil dessen, was
  // gilt — spiegelbildlich zur „Strafe verhängt"-Nachricht bei der umgekehrten Korrektur.
  const punished = [{ id: "s1", userId: "u1", refId: "e1", reason: "20 Schläge", status: "PUNISHED" }];
  const dismissal = row({ bodyKey: "offenseDismissedMessage", refEntityType: "detectedOffense", refEntityId: "e1" });
  const detection = row({ bodyKey: "offenseDetectedMessage", refEntityType: "detectedOffense", refEntityId: "e1" });

  it("steht in beiden, solange das Urteil verworfen BLEIBT — mit dem Grund aus demselben Urteil", async () => {
    // Der Gegenpol zu den drei Fällen darunter: ohne ihn bestünde die ganze Gruppe auch dann noch,
    // wenn die Meldung IMMER verschwände — also genau dann, wenn es das Feature nicht mehr gäbe.
    mock(prisma.message.findMany).mockResolvedValue([dismissal]);
    mock(prisma.strafeRecord.findMany).mockResolvedValue([{ id: "s1", userId: "u1", refId: "e1", reason: "war abgesprochen", status: "DISMISSED" }]);
    const { messages } = await listMessages(sub("u1"));
    expect(messages).toHaveLength(1);
    expect(messages[0].refText).toBe("war abgesprochen");
    expect(messages[0].refMissing).toBe(false);
    expect(await unreadCount(sub("u1"))).toBe(1);
  });

  it("verschwindet aus der Liste, sobald das Urteil wieder auf Strafe steht", async () => {
    mock(prisma.message.findMany).mockResolvedValue([dismissal]);
    mock(prisma.strafeRecord.findMany).mockResolvedValue(punished);
    const { messages } = await listMessages(sub("u1"));
    expect(messages).toEqual([]);
  });

  it("verschwindet auch aus dem Zähler — sonst stünde ein Badge über einem leeren Posteingang", async () => {
    // Anzeige und Zähler MÜSSEN dieselbe Sichtbarkeit haben: liefen sie auseinander, sähe der Sub
    // dauerhaft „1 ungelesen" und fände nichts, was er lesen könnte.
    mock(prisma.message.findMany).mockResolvedValue([dismissal]);
    mock(prisma.strafeRecord.findMany).mockResolvedValue(punished);
    expect(await unreadCount(sub("u1"))).toBe(0);
  });

  it("auch ein blosses Wieder-Eröffnen lässt sie verschwinden — es LÖSCHT das Urteil", async () => {
    // `reopen` entfernt den `StrafeRecord`. Ohne Urteil ist das Vergehen wieder offen, nicht
    // fallengelassen — und ohne diesen Fall bliebe die Meldung stehen, solange die Keyholderin nicht
    // erneut urteilt.
    mock(prisma.message.findMany).mockResolvedValue([dismissal]);
    mock(prisma.strafeRecord.findMany).mockResolvedValue([]);
    expect((await listMessages(sub("u1"))).messages).toEqual([]);
    expect(await unreadCount(sub("u1"))).toBe(0);
  });

  it("die FESTSTELLUNG auf derselben Referenz bleibt in beiden stehen", async () => {
    // Sie sagt „ein Vergehen wurde festgestellt", und das bleibt wahr, egal was daraus wird. Sie
    // mit zu verbergen wäre genau das lautlose Verschwinden, gegen das die Meldung gebaut ist —
    // deshalb hängt die Sichtbarkeit am `bodyKey`, nicht am Referenz-Typ.
    mock(prisma.message.findMany).mockResolvedValue([detection]);
    mock(prisma.strafeRecord.findMany).mockResolvedValue(punished);
    const { messages } = await listMessages(sub("u1"));
    expect(messages).toHaveLength(1);
    expect(await unreadCount(sub("u1"))).toBe(1);
  });
});

describe("Gelesen-Kennzeichen ist an den Besitzer gebunden", () => {
  it("setRead sucht die Nachricht mit subjectUserId — eine fremde id findet nichts", async () => {
    mock(prisma.message.findFirst).mockResolvedValue(null);
    expect(await setRead(sub("u1"), "fremde-id", true)).toBe(false);
    expect(mock(prisma.message.findFirst).mock.calls[0][0].where).toEqual({
      id: "fremde-id", subjectUserId: { in: ["u1"] }, audience: "sub",
    });
    expect(prisma.messageRead.upsert).not.toHaveBeenCalled();
  });

  it("setRead ist idempotent (upsert statt create)", async () => {
    mock(prisma.message.findFirst).mockResolvedValue({ id: "m1" });
    expect(await setRead(sub("u1"), "m1", true)).toBe(true);
    expect(mock(prisma.messageRead.upsert).mock.calls[0][0].update).toEqual({});
  });
});

describe("Alle-als-gelesen lässt das Verborgene in Ruhe", () => {
  // Ohne diesen Filter käme die Nachricht einer terminierten Direktive beim Auslösen bereits
  // gelesen an — ohne Punkt, ohne Badge. Genau der Fall, für den es den Posteingang gibt.
  it("quittiert eine Nachricht zu einer noch nicht ausgelösten Kontrolle NICHT", async () => {
    mock(prisma.message.findMany).mockResolvedValue([
      row({ id: "sichtbar" }),
      row({ id: "verborgen", refEntityType: "control", refEntityId: "ka1" }),
    ]);
    mock(prisma.kontrollAnforderung.findMany).mockResolvedValue([
      { id: "ka1", userId: "u1", wirksamAb: new Date("2026-08-01T10:00:00Z"), benachrichtigtAt: null },
    ]);

    await markAllRead(sub("u1"));
    // Genau eine Quittung, und zwar für die sichtbare Zeile.
    const quittiert = mock(prisma.messageRead.upsert).mock.calls.map((c) => c[0].where.messageId_userId.messageId);
    expect(quittiert).toEqual(["sichtbar"]);
  });
});

describe("Alle-als-gelesen bleibt beschränkt", () => {
  /**
   * Der SQLite-Connector fährt mit `connection_limit=1`: eine Transaktion hält JEDE andere Anfrage
   * der Instanz an. Ein globaler Admin, der nach Monaten „alle als gelesen" drückt, hätte damit die
   * ganze App angehalten — beide Wege sind deshalb in Blöcken geschnitten.
   */
  const unreadRows = (n: number) => Array.from({ length: n }, (_, i) => row({ id: `m${i}` }));

  it("die Lese-Kennzeichen gehen in Blöcken raus, nicht in EINER Transaktion über alles", async () => {
    mock(prisma.message.findMany).mockResolvedValue(unreadRows(250));
    mock(prisma.message.count).mockResolvedValue(0);

    await markAllRead(sub("u1"));

    const blocks = mock(prisma.$transaction).mock.calls.map((c) => (c[0] as unknown[]).length);
    expect(blocks).toEqual([200, 50]);
  });

  it("beim Keyholder läuft es über die indizierte Ungelesen-Abfrage, Block für Block", async () => {
    // Wo nichts zu verbergen ist, gibt es auch nichts aufzulösen: es werden nur Ids geholt, und zwar
    // höchstens ein Block auf einmal — statt jede ungelesene Zeile des Posteingangs zu materialisieren.
    mock(prisma.message.findMany).mockResolvedValue(unreadRows(3));
    mock(prisma.message.count).mockResolvedValue(0);

    expect(await markAllRead(kh("kh1", ["sub1"]))).toBe(0);

    expect(prisma.message.findMany).toHaveBeenCalledOnce();
    const { take, select } = mock(prisma.message.findMany).mock.calls[0][0];
    expect(take).toBe(200);
    expect(select).toEqual({ id: true });
  });

  it("ein VOLLER Block zieht den nächsten nach — die quittierten fallen aus der Bedingung", async () => {
    mock(prisma.message.findMany)
      .mockResolvedValueOnce(unreadRows(200))
      .mockResolvedValueOnce(unreadRows(5));
    mock(prisma.message.count).mockResolvedValue(0);

    await markAllRead(kh("kh1", ["sub1"]));

    expect(prisma.message.findMany).toHaveBeenCalledTimes(2);
  });

  it("ein Keyholder ohne Träger fragt gar nicht erst", async () => {
    expect(await markAllRead(kh("kh1", []))).toBe(0);
    expect(prisma.message.findMany).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe("Zustellung ist retry-sicher", () => {
  // Der Poller sendet ZUERST und stempelt `benachrichtigtAt` danach (damit ein Fehlschlag erneut
  // versucht wird). Ohne `once` hinterliesse jeder Retry eine zweite, dauerhafte Zeile.
  it("once: eine bereits geschriebene Zustell-Nachricht wird nicht verdoppelt", async () => {
    mock(prisma.message.findFirst).mockResolvedValue({ id: "schon-da" });
    const id = await recordSystemMessage({
      subjectUserId: "u1",
      bodyKey: "inspectionRequestedMessage",
      ref: { type: "control", id: "ka1" },
      once: true,
    });
    expect(id).toBe("schon-da");
    expect(prisma.message.create).not.toHaveBeenCalled();
  });

  it("zwei Poller-Läufe hinterlassen GENAU EINE Keyholder-Zeile — nicht zwei", async () => {
    // Der Fall, den `notifyControllers` bis v5.1 offen liess: die Zeile des Trägers war über
    // `inbox.once` geschützt, die geteilte Keyholder-Zeile daneben nicht. Bricht der Poller nach
    // dem Versand und vor dem Stempel ab, läuft er erneut hier durch — und eine doppelte Zeile
    // bleibt stehen, anders als eine doppelte Mail.
    const params = {
      subjectUserId: "sub1",
      audience: "keyholders",
      bodyKey: "taskDoneMessageKeyholder",
      ref: { type: "task", id: "t1" },
      once: true,
    } as const;

    mock(prisma.message.findFirst).mockResolvedValue(null);
    await recordSystemMessage(params);
    // Zweiter Lauf: die Zeile von eben steht schon da.
    mock(prisma.message.findFirst).mockResolvedValue({ id: "m-new" });
    expect(await recordSystemMessage(params)).toBe("m-new");

    expect(prisma.message.create).toHaveBeenCalledTimes(1);
    // Die Suche trägt `audience` mit: sonst hielte die Sub-Zeile zum selben Vorgang die
    // Keyholder-Zeile für ihr eigenes Duplikat und unterdrückte sie.
    expect(mock(prisma.message.findFirst).mock.calls[1][0].where).toMatchObject({
      subjectUserId: "sub1", audience: "keyholders", refEntityType: "task", refEntityId: "t1",
    });
  });

  it("ohne once bleibt die Wiederholung erlaubt (geänderte Frist, Rückzug)", async () => {
    mock(prisma.message.findFirst).mockResolvedValue({ id: "schon-da" });
    await recordSystemMessage({
      subjectUserId: "u1",
      bodyKey: "lockRequestChangedMessage",
      ref: { type: "lockRequest", id: "va1" },
    });
    expect(prisma.message.create).toHaveBeenCalled();
  });
});

describe("Verlinkung — nur wo eine Seite etwas beiträgt", () => {
  const control = (over: Record<string, unknown> = {}) => ({
    id: "ka1", userId: "u1", kommentar: null, code: "12345", entryId: null, withdrawnAt: null,
    deadline: new Date("2099-01-01T00:00:00Z"), wirksamAb: null, benachrichtigtAt: new Date(),
    autoMarkedRemovedAt: null, ...over,
  });

  async function codeOf(controlRow: Record<string, unknown>) {
    mock(prisma.message.findMany).mockResolvedValue([row({ refEntityType: "control", refEntityId: "ka1" })]);
    mock(prisma.kontrollAnforderung.findMany).mockResolvedValue([controlRow]);
    const { messages } = await listMessages(sub("u1"));
    return messages[0]?.refActionCode ?? null;
  }

  it("offene Kontrolle → Code für das Prüfungs-Formular", async () => {
    expect(await codeOf(control())).toBe("12345");
  });

  it("erfüllte Kontrolle → kein Ziel", async () => {
    expect(await codeOf(control({ entryId: "e1" }))).toBeNull();
  });

  it("abgelaufene Kontrolle → kein Ziel (das Formular nimmt sie nicht mehr an)", async () => {
    expect(await codeOf(control({ deadline: new Date("2000-01-01T00:00:00Z") }))).toBeNull();
  });

  it("zurückgezogene Kontrolle → kein Ziel", async () => {
    expect(await codeOf(control({ withdrawnAt: new Date() }))).toBeNull();
  });

  // Der Strafen-Block des Dashboards LISTET nur — es gibt dort nichts
  // einzureichen, also auch kein Ziel für den Handlungs-Link der Nachricht.
  it("Strafe → kein Ziel (der Strafen-Block nimmt keine Handlung entgegen)", async () => {
    mock(prisma.message.findMany).mockResolvedValue([row({ refEntityType: "offense", refEntityId: "s1" })]);
    mock(prisma.strafeRecord.findMany).mockResolvedValue([{ id: "s1", userId: "u1", reason: "Text", status: "PUNISHED" }]);
    const { messages } = await listMessages(sub("u1"));
    expect(messages[0].refActionCode).toBeNull();
  });
});

describe("Löschen ist an den Besitzer gebunden", () => {
  it("eine fremde id löscht nichts", async () => {
    mock(prisma.message.deleteMany).mockResolvedValue({ count: 0 });
    expect(await deleteMessage(sub("u1"), "fremde-id")).toBe(false);
  });

  it("gelöscht wird genau die eigene Zeile — eingegrenzt auf subjectUserId UND audience", async () => {
    mock(prisma.message.deleteMany).mockResolvedValue({ count: 1 });
    expect(await deleteMessage(sub("u1"), "m1")).toBe(true);
    // `deleteMessage` delegiert an `deleteMessages` — die id steht deshalb als Liste da. Der Scope
    // (subjectUserId + audience) ist derselbe und genau das, was dieser Test festhält.
    expect(mock(prisma.message.deleteMany).mock.calls[0][0].where).toEqual({
      id: { in: ["m1"] }, subjectUserId: { in: ["u1"] }, audience: "sub",
    });
  });

  // Zwei überlappende Aufrufe: der zweite findet nichts mehr und muss ein sauberes „nein" liefern,
  // keinen Fehler — sonst sieht der Nutzer einen Fehler, obwohl der Zustand stimmt.
  it("ein zweiter Aufruf auf dieselbe Zeile ist kein Fehler", async () => {
    mock(prisma.message.deleteMany).mockResolvedValue({ count: 0 });
    await expect(deleteMessage(sub("u1"), "m1")).resolves.toBe(false);
  });
});

/**
 * Der Keyholder-Kanal. Eine Nachricht an die Keyholder ist EINE Zeile je Sub
 * (`subjectUserId` = der Sub, `audience: "keyholders"`), geteilt von allen seinen Keyholdern — das
 * geht nur auf, weil der Gelesen-Stand am LESER hängt (`MessageRead.userId`) und nicht am Träger.
 * Genau diese Kopplung („Betreff ist auch der Leser") war bis hierher überall verdrahtet.
 */
describe("Keyholder-Posteingang", () => {
  /** Die where-Klausel des N-ten `message.findMany`. */
  const whereOf = (n = 0) => mock(prisma.message.findMany).mock.calls[n][0].where;
  /** Die where-Klausel des N-ten `message.count`. Der Keyholder-Zähler ist eine ZÄHLUNG: ohne
   *  Verbergen-Regel gibt es nichts aufzulösen, also holt er keine Zeilen. */
  const countWhereOf = (n = 0) => mock(prisma.message.count).mock.calls[n][0].where;

  it("die Sicht des Subs zeigt NUR audience=sub, die des Keyholders NUR audience=keyholders", async () => {
    // Der Kern der Trennung: dieselbe `subjectUserId` trägt beide Sorten. Ohne `audience` in der
    // Abfrage läse jede Seite die Meldungen der anderen — der Träger sähe die Meldung ÜBER sich.
    await listMessages(sub("sub1"));
    expect(whereOf()).toMatchObject({ subjectUserId: { in: ["sub1"] }, audience: "sub" });

    vi.clearAllMocks();
    mock(prisma.message.count).mockResolvedValue(1);
    await listMessages(kh("kh1", ["sub1"]));
    expect(whereOf()).toMatchObject({ subjectUserId: { in: ["sub1"] }, audience: "keyholders" });
  });

  it("der Gelesen-Stand wird gegen den LESER aufgelöst, nicht gegen den Träger", async () => {
    await listMessages(kh("kh1", ["sub1"]));
    expect(mock(prisma.message.findMany).mock.calls[0][0].select.reads.where).toEqual({ userId: "kh1" });
  });

  it("zwei Keyholder lesen dieselbe Zeile unabhängig voneinander", async () => {
    // Eine Zeile, zwei Lese-Kennzeichen: `kh1` quittiert, `kh2` sieht sie weiterhin ungelesen.
    const shared = row({ id: "m-kh", reads: [] });
    mock(prisma.message.findMany).mockResolvedValue([shared]);
    mock(prisma.message.findFirst).mockResolvedValue({ id: "m-kh" });

    expect(await setRead(kh("kh1", ["sub1"]), "m-kh", true)).toBe(true);
    expect(mock(prisma.messageRead.upsert).mock.calls[0][0].create).toEqual({ messageId: "m-kh", userId: "kh1" });

    // Für kh2 liefert dieselbe Zeile ein leeres `reads` — sein Stand ist von kh1s Quittung unberührt.
    const { messages } = await listMessages(kh("kh2", ["sub1"]));
    expect(messages[0].read).toBe(false);
    // Beide Richtungen, sonst ist die Zeile darüber wertlos: `reads: []` käme auch dann heraus, wenn
    // gegen den TRÄGER statt gegen den Leser aufgelöst würde. Erst der Gegenfall zeigt, dass die
    // Zuordnung `reads → read` überhaupt etwas abbildet.
    mock(prisma.message.findMany).mockResolvedValue([row({ id: "m-kh", reads: [{ id: "r1" }] })]);
    expect((await listMessages(kh("kh1", ["sub1"]))).messages[0].read).toBe(true);
    mock(prisma.message.findMany).mockResolvedValue([shared]);
    // Und sein Zähler fragt gegen IHN: der Ungelesen-Filter läuft ebenfalls über `readerId`.
    mock(prisma.message.count).mockResolvedValue(1);
    expect(await unreadCount(kh("kh2", ["sub1"]))).toBe(1);
    expect(countWhereOf(mock(prisma.message.count).mock.calls.length - 1).reads).toEqual({
      none: { userId: "kh2" },
    });
  });

  it("Liste und Zähler sehen NUR die übergebenen Subs — ein fremder Träger ist nicht dabei", async () => {
    // Die Sub-Liste IST die Rechte-Grenze (sie kommt vom Aufrufer, nie aus der Anfrage). Landete
    // hier ein `subjectUserId`-loses `where`, sähe jeder Keyholder die Meldungen aller Träger.
    // Deshalb wird die Bedingung EXAKT geprüft (`toEqual`, nicht `toMatchObject`): jede Erweiterung
    // um ein `OR` oder ein `NOT` fiele hier auf, statt still mehr Zeilen einzulassen.
    const scoped = ["sub1", "sub2"];
    const fremd = "fremder-sub";

    await listMessages(kh("kh1", scoped));
    expect(whereOf().subjectUserId).toEqual({ in: scoped });
    expect(whereOf().subjectUserId.in).not.toContain(fremd);

    // Der Zähler ist an denselben Ausschnitt gebunden — er zählt nur, statt Zeilen zu holen.
    await unreadCount(kh("kh1", scoped));
    const zaehler = countWhereOf(mock(prisma.message.count).mock.calls.length - 1);
    expect(zaehler.subjectUserId).toEqual({ in: scoped });
    expect(zaehler.audience).toBe("keyholders");

    // Und mit genau EINEM Sub bleibt es bei genau diesem — kein Schlupfloch für einen zweiten.
    await listMessages(kh("kh1", ["sub1"]));
    expect(whereOf(1).subjectUserId).toEqual({ in: ["sub1"] });
  });

  it("ein Keyholder ohne Subs bekommt nichts — und es wird gar nicht erst gefragt", async () => {
    // Leere Träger-Liste heisst „garantiert leeres Ergebnis" (die Zusicherung an `InboxScope`). Ein
    // `IN ()` an SQLite zu schicken wäre keine Sicherheitslücke, aber eine Abfrage, deren Antwort
    // vorher feststeht — und der Zähler läuft im Header auf JEDER Seite.
    const { messages, pageCount } = await listMessages(kh("kh1", []));
    expect(messages).toEqual([]);
    expect(pageCount).toBe(1);
    expect(await unreadCount(kh("kh1", []))).toBe(0);
    expect(prisma.message.findMany).not.toHaveBeenCalled();
    expect(prisma.message.count).not.toHaveBeenCalled();
  });

  it("die Zeile sagt, um WEN es geht — und nur im Keyholder-Posteingang", async () => {
    // Eine Liste über mehrere Träger ist ohne Namen unbrauchbar. Im Posteingang des Trägers wäre er
    // sein eigener: dort bleibt das Feld leer.
    //
    // Der Name kommt aus dem SCOPE, nicht aus einer zweiten Abfrage: der Guard hat die Zuordnung
    // (`getControllableSubs`) samt Namen ohnehin schon gelesen. Ein `user.findMany` hier wäre
    // dieselbe Auskunft ein zweites Mal.
    mock(prisma.message.findMany).mockResolvedValue([row({ subjectUserId: "sub1" })]);
    const list = await listMessages(kh("kh1", ["sub1"], { sub1: "alice" }));
    expect(list.messages[0].subjectUsername).toBe("alice");
    expect(prisma.user.findMany).not.toHaveBeenCalled();

    mock(prisma.message.findMany).mockResolvedValue([row({ subjectUserId: "sub1" })]);
    expect((await listMessages(sub("sub1"))).messages[0].subjectUsername).toBeNull();
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  it("Lesen und Löschen suchen mit dem Scope — eine geratene Id trifft nichts", async () => {
    mock(prisma.message.findFirst).mockResolvedValue(null);
    expect(await setRead(kh("kh1", ["sub1"]), "fremde-id", true)).toBe(false);
    expect(mock(prisma.message.findFirst).mock.calls[0][0].where).toEqual({
      id: "fremde-id", subjectUserId: { in: ["sub1"] }, audience: "keyholders",
    });

    mock(prisma.message.deleteMany).mockResolvedValue({ count: 0 });
    expect(await deleteMessage(kh("kh1", ["sub1"]), "fremde-id")).toBe(false);
    expect(mock(prisma.message.deleteMany).mock.calls[0][0].where).toEqual({
      id: { in: ["fremde-id"] }, subjectUserId: { in: ["sub1"] }, audience: "keyholders",
    });
  });

  it("das Ent-Quittieren trägt den Scope in der VERSCHACHTELTEN Bedingung mit", async () => {
    // Der einzige Schreibpfad, dessen Eingrenzung nicht in einer eigenen Spalte steht, sondern im
    // Relations-Filter `message: { … }` — `messageRead` kennt keine `subjectUserId`. Genau deshalb
    // ist er der am leichtesten zu verlierende: fiele er weg, räumte eine geratene Id die
    // Lese-Kennzeichen fremder Zeilen ab, und keine andere Zusicherung würde das bemerken.
    mock(prisma.messageRead.deleteMany).mockResolvedValue({ count: 0 });
    await setReadMany(kh("kh1", ["sub1", "sub2"]), ["m1", "m2"], false);
    expect(mock(prisma.messageRead.deleteMany).mock.calls[0][0].where).toEqual({
      userId: "kh1",
      messageId: { in: ["m1", "m2"] },
      message: { subjectUserId: { in: ["sub1", "sub2"] }, audience: "keyholders" },
    });
  });

  it("über MEHRERE Träger wird JEDER Bezug aufgelöst — jede Zeile bekommt den Text IHRES Trägers", async () => {
    // Bis v5.1 schaltete sich die Auflösung ab zwei Trägern ganz ab, weil der Schlüssel `typ:id`
    // über mehrere Subs hätte kollidieren können. Der Preis war unverhältnismässig: auf jeder
    // Instanz mit zwei Subs — und beim globalen Admin IMMER — verlor jede Keyholder-Zeile ihren
    // Bezugs-Block. Jetzt steht der Träger IM Schlüssel, und die Zuordnung ist nachweislich die
    // richtige: zwei Aufgaben mit demselben Text-Nachbarn, jede Zeile bekommt ihre eigene.
    mock(prisma.message.findMany).mockResolvedValue([
      row({ id: "m-sub1", subjectUserId: "sub1", refEntityType: "task", refEntityId: "t1" }),
      row({ id: "m-sub2", subjectUserId: "sub2", refEntityType: "task", refEntityId: "t2" }),
    ]);
    mock(prisma.task.findMany).mockResolvedValue([
      { id: "t1", userId: "sub1", description: "Text von sub1" },
      { id: "t2", userId: "sub2", description: "Text von sub2" },
    ]);
    const { messages } = await listMessages(kh("kh1", ["sub1", "sub2"]));
    expect(messages.map((m) => [m.id, m.refText])).toEqual([
      ["m-sub1", "Text von sub1"],
      ["m-sub2", "Text von sub2"],
    ]);
    expect(messages.every((m) => !m.refMissing)).toBe(true);
    // Die Eingrenzung bleibt Teil der SUCHE — gefragt wird nur nach den Trägern des Scopes.
    expect(mock(prisma.task.findMany).mock.calls[0][0].where).toMatchObject({ userId: { in: ["sub1", "sub2"] } });
  });

  it("eine Referenz auf ein FREMDES Objekt löst nicht auf — der Träger steht mit im Schlüssel", async () => {
    // Der Grund, aus dem der Riegel überhaupt einmal existierte: dieselbe Id, anderer Träger. Fiele
    // der Träger aus dem Schlüssel, bekäme die Zeile über sub2 den Text von sub1 zu sehen.
    mock(prisma.message.findMany).mockResolvedValue([
      row({ id: "m-sub2", subjectUserId: "sub2", refEntityType: "task", refEntityId: "t1" }),
    ]);
    mock(prisma.task.findMany).mockResolvedValue([{ id: "t1", userId: "sub1", description: "Text von sub1" }]);
    const { messages } = await listMessages(kh("kh1", ["sub1", "sub2"]));
    expect(messages[0].refText).toBeNull();
    // Und die Zeile SAGT das jetzt auch, statt den Bezugs-Block stumm wegzulassen: eine tote
    // Referenz war vorher von einer nie gesetzten nicht zu unterscheiden.
    expect(messages[0].refMissing).toBe(true);
  });

  it("bei GENAU EINEM Träger steht der Freitext da — der häufigste Fall", async () => {
    // Eine Keyholderin, ein Träger. Die Eingrenzung auf den Träger bleibt Teil der SUCHE, sie ist
    // nicht dadurch entbehrlich, dass es nur einer ist.
    mock(prisma.message.findMany).mockResolvedValue([row({ refEntityType: "task", refEntityId: "t1" })]);
    mock(prisma.task.findMany).mockResolvedValue([{ id: "t1", userId: "u1", description: "die ganze Wohnung" }]);
    const { messages } = await listMessages(kh("kh1", ["sub1"]));
    expect(messages[0].refText).toBe("die ganze Wohnung");
    expect(mock(prisma.task.findMany).mock.calls[0][0].where).toMatchObject({ userId: { in: ["sub1"] } });
  });

  it("die Verbergen-Regel gilt NICHT für den Keyholder — er hat die Direktive selbst gestellt", async () => {
    // `refDetails` löst für ihn jetzt auf (ein Träger), liefert an einer terminierten Kontrolle also
    // auch `hidden: true`. Angewendet wird das trotzdem nur beim TRÄGER: die Überraschung ist vor
    // IHM zu schützen, nicht vor dem, der sie angeordnet hat.
    mock(prisma.message.findMany).mockResolvedValue([row({ refEntityType: "control", refEntityId: "ka1" })]);
    mock(prisma.kontrollAnforderung.findMany).mockResolvedValue([
      { id: "ka1", userId: "u1", kommentar: null, code: null, categoryId: null, entryId: null, withdrawnAt: null,
        deadline: new Date("2099-01-01T00:00:00Z"), wirksamAb: new Date("2099-01-01T00:00:00Z"),
        benachrichtigtAt: null, autoMarkedRemovedAt: null },
    ]);
    expect((await listMessages(kh("kh1", ["sub1"]))).messages).toHaveLength(1);
  });

  it("recordSystemMessage schreibt die Zielgruppe mit — und bleibt ohne Angabe beim Sub", async () => {
    await recordSystemMessage({ subjectUserId: "sub1", audience: "keyholders", bodyKey: "taskDoneMessageKeyholder" });
    expect(mock(prisma.message.create).mock.calls[0][0].data.audience).toBe("keyholders");

    await recordSystemMessage({ subjectUserId: "sub1", bodyKey: "taskDoneMessage" });
    expect(mock(prisma.message.create).mock.calls[1][0].data.audience).toBe("sub");
  });
});
