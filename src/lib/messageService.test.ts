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
  },
}));

import {
  MESSAGE_BODY_KEYS,
  recordSystemMessage,
  listMessagesFor,
  unreadCountFor,
  markAllRead,
  setRead,
  deleteMessage,
} from "./messageService";
import { prisma } from "@/lib/prisma";

const mock = (fn: unknown) => fn as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mock(prisma.message.create).mockResolvedValue({ id: "m-new" });
  // Der Posteingang blättert seit v5.1 über Seiten: die Zählung entscheidet, wie viele es gibt.
  mock(prisma.message.count).mockResolvedValue(1);
  for (const m of [prisma.strafeRecord, prisma.kontrollAnforderung, prisma.verschlussAnforderung, prisma.orgasmusAnforderung]) {
    mock(m.findMany).mockResolvedValue([]);
  }
});

/** Eine Nachrichten-Zeile, wie sie `findMany` liefert. */
function row(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: "m1",
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
  const hiddenControl = { id: "ka1", kommentar: null, wirksamAb: new Date("2026-08-01T10:00:00Z"), benachrichtigtAt: null };
  const messageOnHiddenControl = row({ refEntityType: "control", refEntityId: "ka1" });

  it("listMessagesFor liefert eine Nachricht zu einer noch nicht ausgelösten Kontrolle nicht aus", async () => {
    mock(prisma.message.findMany).mockResolvedValue([messageOnHiddenControl]);
    mock(prisma.kontrollAnforderung.findMany).mockResolvedValue([hiddenControl]);
    const { messages } = await listMessagesFor("u1");
    expect(messages).toEqual([]);
  });

  it("unreadCountFor zählt sie ebenfalls nicht — sonst verriete schon die Glocke sie", async () => {
    mock(prisma.message.findMany).mockResolvedValue([messageOnHiddenControl]);
    mock(prisma.kontrollAnforderung.findMany).mockResolvedValue([hiddenControl]);
    expect(await unreadCountFor("u1")).toBe(0);
  });

  it("nach der Auslösung (benachrichtigtAt gesetzt) erscheint sie", async () => {
    mock(prisma.message.findMany).mockResolvedValue([messageOnHiddenControl]);
    mock(prisma.kontrollAnforderung.findMany).mockResolvedValue([
      { ...hiddenControl, benachrichtigtAt: new Date("2026-08-01T10:00:00Z") },
    ]);
    const { messages } = await listMessagesFor("u1");
    expect(messages).toHaveLength(1);
  });

  it("alsoCount zählt die eben zugestellte Nachricht mit, solange der Poller den Stempel noch setzt", async () => {
    mock(prisma.message.findMany).mockResolvedValue([messageOnHiddenControl]);
    mock(prisma.kontrollAnforderung.findMany).mockResolvedValue([hiddenControl]);
    expect(await unreadCountFor("u1", { alsoCount: ["m1"] })).toBe(1);
  });
});

describe("Freitexte werden live gelesen, nicht kopiert", () => {
  it("der Straftext kommt aus dem StrafeRecord, nicht aus der Nachricht", async () => {
    mock(prisma.message.findMany).mockResolvedValue([row({ refEntityType: "offense", refEntityId: "s1" })]);
    mock(prisma.strafeRecord.findMany).mockResolvedValue([{ id: "s1", reason: "korrigierter Text", status: "PUNISHED" }]);
    const { messages } = await listMessagesFor("u1");
    expect(messages[0].refText).toBe("korrigierter Text");
    expect(messages[0].refMissing).toBe(false);
  });

  it("die GLOCKE zählt ein verworfenes Urteil ebenso wenig — sonst stünde ein Badge über einem leeren Posteingang", async () => {
    // Zähler und Liste müssen dieselbe Sichtbarkeit haben. Liefen sie auseinander, sähe der Sub
    // dauerhaft „1 ungelesen" und fände nichts, was er lesen könnte.
    mock(prisma.message.findMany).mockResolvedValue([row({ refEntityType: "offense", refEntityId: "s1" })]);
    mock(prisma.strafeRecord.findMany).mockResolvedValue([{ id: "s1", status: "DISMISSED" }]);
    expect(await unreadCountFor("u1")).toBe(0);
  });

  it("ein VERWORFENES Urteil erreicht den Sub nicht — auch nicht über eine alte Nachricht", async () => {
    // `writeJudgment` upsertet auf `refId`: eine Korrektur PUNISHED→DISMISSED behält die Zeile, und
    // die alte „Strafe verhängt"-Nachricht zeigte danach die VERWERFUNGS-Begründung. Genau die
    // Nachricht ist dann nicht mehr wahr und wird ausgeblendet (`judgmentMessageStillApplies`).
    mock(prisma.message.findMany).mockResolvedValue([row({ refEntityType: "offense", refEntityId: "s1" })]);
    mock(prisma.strafeRecord.findMany).mockResolvedValue([{ id: "s1", reason: "war abgesprochen", status: "DISMISSED" }]);
    const { messages } = await listMessagesFor("u1");
    expect(messages).toHaveLength(0);
  });

  it("ein gelöschtes Bezugsobjekt wird als solches gemeldet, statt still zu verschwinden", async () => {
    mock(prisma.message.findMany).mockResolvedValue([row({ refEntityType: "offense", refEntityId: "weg" })]);
    const { messages } = await listMessagesFor("u1");
    expect(messages[0].refMissing).toBe(true);
  });

  it("die ANWEISUNG einer Aufgabe kommt aus der Aufgabe — sie stand vorher gar nicht im Posteingang", async () => {
    // Der Titel bleibt bewusst ein Parameter der Nachricht (eine Nachricht ist die Aufzeichnung
    // dessen, was damals gesagt wurde); die Beschreibung ist der Freitext und wird live gelesen.
    mock(prisma.message.findMany).mockResolvedValue([row({ refEntityType: "task", refEntityId: "t1" })]);
    mock(prisma.task.findMany).mockResolvedValue([{ id: "t1", description: "die ganze Wohnung, nicht nur das Wohnzimmer" }]);
    const { messages } = await listMessagesFor("u1");
    expect(messages[0].refText).toBe("die ganze Wohnung, nicht nur das Wohnzimmer");
    expect(messages[0].refMissing).toBe(false);
  });

  it("eine Aufgabe ist nie verborgen — sie kennt keine Terminierung", async () => {
    mock(prisma.message.findMany).mockResolvedValue([row({ refEntityType: "task", refEntityId: "t1" })]);
    mock(prisma.task.findMany).mockResolvedValue([{ id: "t1", description: null }]);
    const { messages } = await listMessagesFor("u1");
    expect(messages).toHaveLength(1);
  });

  it("auch die Aufgabe wird auf den Sub eingegrenzt", async () => {
    mock(prisma.message.findMany).mockResolvedValue([row({ refEntityType: "task", refEntityId: "t1" })]);
    mock(prisma.task.findMany).mockResolvedValue([{ id: "t1", description: null }]);
    await listMessagesFor("u1");
    expect(mock(prisma.task.findMany).mock.calls[0][0].where).toMatchObject({ userId: "u1" });
  });

  it("Bezugsobjekte werden IMMER auf den Sub eingegrenzt (kein Blick in fremde Zeilen)", async () => {
    mock(prisma.message.findMany).mockResolvedValue([row({ refEntityType: "offense", refEntityId: "s1" })]);
    await listMessagesFor("u1");
    expect(mock(prisma.strafeRecord.findMany).mock.calls[0][0].where).toMatchObject({ userId: "u1" });
  });
});

describe("die Verwerfungs-Meldung überlebt ihr Urteil nicht", () => {
  // Wird ein Urteil revidiert (reopen → erneut bestraft), behält die Zeile ihre `refId`
  // (`writeJudgment` upsertet darauf) und trägt danach PUNISHED samt STRAFtext. Die alte
  // „fallengelassen"-Nachricht behauptet dann mit der Strafe darunter das Gegenteil dessen, was
  // gilt — spiegelbildlich zur „Strafe verhängt"-Nachricht bei der umgekehrten Korrektur.
  const punished = [{ id: "s1", refId: "e1", reason: "20 Schläge", status: "PUNISHED" }];
  const dismissal = row({ bodyKey: "offenseDismissedMessage", refEntityType: "detectedOffense", refEntityId: "e1" });
  const detection = row({ bodyKey: "offenseDetectedMessage", refEntityType: "detectedOffense", refEntityId: "e1" });

  it("steht in beiden, solange das Urteil verworfen BLEIBT — mit dem Grund aus demselben Urteil", async () => {
    // Der Gegenpol zu den drei Fällen darunter: ohne ihn bestünde die ganze Gruppe auch dann noch,
    // wenn die Meldung IMMER verschwände — also genau dann, wenn es das Feature nicht mehr gäbe.
    mock(prisma.message.findMany).mockResolvedValue([dismissal]);
    mock(prisma.strafeRecord.findMany).mockResolvedValue([{ id: "s1", refId: "e1", reason: "war abgesprochen", status: "DISMISSED" }]);
    const { messages } = await listMessagesFor("u1");
    expect(messages).toHaveLength(1);
    expect(messages[0].refText).toBe("war abgesprochen");
    expect(messages[0].refMissing).toBe(false);
    expect(await unreadCountFor("u1")).toBe(1);
  });

  it("verschwindet aus der Liste, sobald das Urteil wieder auf Strafe steht", async () => {
    mock(prisma.message.findMany).mockResolvedValue([dismissal]);
    mock(prisma.strafeRecord.findMany).mockResolvedValue(punished);
    const { messages } = await listMessagesFor("u1");
    expect(messages).toEqual([]);
  });

  it("verschwindet auch aus dem Zähler — sonst stünde ein Badge über einem leeren Posteingang", async () => {
    // Anzeige und Zähler MÜSSEN dieselbe Sichtbarkeit haben: liefen sie auseinander, sähe der Sub
    // dauerhaft „1 ungelesen" und fände nichts, was er lesen könnte.
    mock(prisma.message.findMany).mockResolvedValue([dismissal]);
    mock(prisma.strafeRecord.findMany).mockResolvedValue(punished);
    expect(await unreadCountFor("u1")).toBe(0);
  });

  it("auch ein blosses Wieder-Eröffnen lässt sie verschwinden — es LÖSCHT das Urteil", async () => {
    // `reopen` entfernt den `StrafeRecord`. Ohne Urteil ist das Vergehen wieder offen, nicht
    // fallengelassen — und ohne diesen Fall bliebe die Meldung stehen, solange die Keyholderin nicht
    // erneut urteilt.
    mock(prisma.message.findMany).mockResolvedValue([dismissal]);
    mock(prisma.strafeRecord.findMany).mockResolvedValue([]);
    expect((await listMessagesFor("u1")).messages).toEqual([]);
    expect(await unreadCountFor("u1")).toBe(0);
  });

  it("die FESTSTELLUNG auf derselben Referenz bleibt in beiden stehen", async () => {
    // Sie sagt „ein Vergehen wurde festgestellt", und das bleibt wahr, egal was daraus wird. Sie
    // mit zu verbergen wäre genau das lautlose Verschwinden, gegen das die Meldung gebaut ist —
    // deshalb hängt die Sichtbarkeit am `bodyKey`, nicht am Referenz-Typ.
    mock(prisma.message.findMany).mockResolvedValue([detection]);
    mock(prisma.strafeRecord.findMany).mockResolvedValue(punished);
    const { messages } = await listMessagesFor("u1");
    expect(messages).toHaveLength(1);
    expect(await unreadCountFor("u1")).toBe(1);
  });
});

describe("Gelesen-Kennzeichen ist an den Besitzer gebunden", () => {
  it("setRead sucht die Nachricht mit subjectUserId — eine fremde id findet nichts", async () => {
    mock(prisma.message.findFirst).mockResolvedValue(null);
    expect(await setRead("u1", "fremde-id", true)).toBe(false);
    expect(mock(prisma.message.findFirst).mock.calls[0][0].where).toEqual({
      id: "fremde-id", subjectUserId: "u1", audience: "sub",
    });
    expect(prisma.messageRead.upsert).not.toHaveBeenCalled();
  });

  it("setRead ist idempotent (upsert statt create)", async () => {
    mock(prisma.message.findFirst).mockResolvedValue({ id: "m1" });
    expect(await setRead("u1", "m1", true)).toBe(true);
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
      { id: "ka1", wirksamAb: new Date("2026-08-01T10:00:00Z"), benachrichtigtAt: null },
    ]);

    await markAllRead("u1");
    // Genau eine Quittung, und zwar für die sichtbare Zeile.
    const quittiert = mock(prisma.messageRead.upsert).mock.calls.map((c) => c[0].where.messageId_userId.messageId);
    expect(quittiert).toEqual(["sichtbar"]);
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
    id: "ka1", kommentar: null, code: "12345", entryId: null, withdrawnAt: null,
    deadline: new Date("2099-01-01T00:00:00Z"), wirksamAb: null, benachrichtigtAt: new Date(),
    autoMarkedRemovedAt: null, ...over,
  });

  async function codeOf(controlRow: Record<string, unknown>) {
    mock(prisma.message.findMany).mockResolvedValue([row({ refEntityType: "control", refEntityId: "ka1" })]);
    mock(prisma.kontrollAnforderung.findMany).mockResolvedValue([controlRow]);
    const { messages } = await listMessagesFor("u1");
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
    mock(prisma.strafeRecord.findMany).mockResolvedValue([{ id: "s1", reason: "Text", status: "PUNISHED" }]);
    const { messages } = await listMessagesFor("u1");
    expect(messages[0].refActionCode).toBeNull();
  });
});

describe("Löschen ist an den Besitzer gebunden", () => {
  it("eine fremde id löscht nichts", async () => {
    mock(prisma.message.deleteMany).mockResolvedValue({ count: 0 });
    expect(await deleteMessage("u1", "fremde-id")).toBe(false);
  });

  it("gelöscht wird genau die eigene Zeile — eingegrenzt auf subjectUserId UND audience", async () => {
    mock(prisma.message.deleteMany).mockResolvedValue({ count: 1 });
    expect(await deleteMessage("u1", "m1")).toBe(true);
    // `deleteMessage` delegiert an `deleteMessages` — die id steht deshalb als Liste da. Der Scope
    // (subjectUserId + audience) ist derselbe und genau das, was dieser Test festhält.
    expect(mock(prisma.message.deleteMany).mock.calls[0][0].where).toEqual({
      id: { in: ["m1"] }, subjectUserId: "u1", audience: "sub",
    });
  });

  // Zwei überlappende Aufrufe: der zweite findet nichts mehr und muss ein sauberes „nein" liefern,
  // keinen Fehler — sonst sieht der Nutzer einen Fehler, obwohl der Zustand stimmt.
  it("ein zweiter Aufruf auf dieselbe Zeile ist kein Fehler", async () => {
    mock(prisma.message.deleteMany).mockResolvedValue({ count: 0 });
    await expect(deleteMessage("u1", "m1")).resolves.toBe(false);
  });
});
