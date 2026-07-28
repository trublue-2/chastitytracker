import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";

// Der Service liest Nachrichten + die vier Bezugsobjekte und schreibt Lese-Kennzeichen.
vi.mock("@/lib/prisma", () => ({
  prisma: {
    message: { create: vi.fn(), findMany: vi.fn(), findFirst: vi.fn() },
    messageRead: { upsert: vi.fn(), deleteMany: vi.fn(), createMany: vi.fn() },
    strafeRecord: { findMany: vi.fn() },
    kontrollAnforderung: { findMany: vi.fn() },
    verschlussAnforderung: { findMany: vi.fn() },
    orgasmusAnforderung: { findMany: vi.fn() },
  },
}));

import {
  MESSAGE_BODY_KEYS,
  recordSystemMessage,
  listMessagesFor,
  unreadCountFor,
  markAllRead,
  setRead,
} from "./messageService";
import { prisma } from "@/lib/prisma";

const mock = (fn: unknown) => fn as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mock(prisma.message.create).mockResolvedValue({ id: "m-new" });
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
    mock(prisma.strafeRecord.findMany).mockResolvedValue([{ id: "s1", reason: "korrigierter Text" }]);
    const { messages } = await listMessagesFor("u1");
    expect(messages[0].refText).toBe("korrigierter Text");
    expect(messages[0].refMissing).toBe(false);
  });

  it("ein gelöschtes Bezugsobjekt wird als solches gemeldet, statt still zu verschwinden", async () => {
    mock(prisma.message.findMany).mockResolvedValue([row({ refEntityType: "offense", refEntityId: "weg" })]);
    const { messages } = await listMessagesFor("u1");
    expect(messages[0].refMissing).toBe(true);
  });

  it("Bezugsobjekte werden IMMER auf den Sub eingegrenzt (kein Blick in fremde Zeilen)", async () => {
    mock(prisma.message.findMany).mockResolvedValue([row({ refEntityType: "offense", refEntityId: "s1" })]);
    await listMessagesFor("u1");
    expect(mock(prisma.strafeRecord.findMany).mock.calls[0][0].where).toMatchObject({ userId: "u1" });
  });
});

describe("Gelesen-Kennzeichen ist an den Besitzer gebunden", () => {
  it("setRead sucht die Nachricht mit subjectUserId — eine fremde id findet nichts", async () => {
    mock(prisma.message.findFirst).mockResolvedValue(null);
    expect(await setRead("u1", "fremde-id", true)).toBe(false);
    expect(mock(prisma.message.findFirst).mock.calls[0][0].where).toEqual({ id: "fremde-id", subjectUserId: "u1" });
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
