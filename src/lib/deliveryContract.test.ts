import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * WER bekommt WAS auf WELCHEM Kanal — quer durch alle Versandstellen.
 *
 * Die Versand-Enden der Meldungen (`notifyUser`, die Direktiven Verschluss/Orgasmus/Kontrolle) bauten
 * dasselbe Ende fünfmal mit verschiedenem Warteverhalten. Dieser Test hält fest, was bei ALLEN gleich
 * bleiben muss, wie auch immer das Ende gebaut ist: je Kanal die Adressaten, Betreff, Titel, Text,
 * Ziel und Badge. Er prüft deshalb an den BLÄTTERN (Mail, Push, Telegram), nicht an der Aufrufform.
 *
 * Echtes SMTP, Push und Telegram sind hier nicht erreichbar; geprüft wird, was an sie GEHT.
 */

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    message: { create: vi.fn(async () => ({ id: "m1" })), findFirst: vi.fn(async () => null) },
  },
}));
vi.mock("@/lib/mail", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/mail")>()),
  sendMailSafe: vi.fn(),
}));
vi.mock("@/lib/push", () => ({ sendPushToUser: vi.fn(), hasPushTarget: vi.fn() }));
vi.mock("@/lib/telegram", () => ({ sendTelegram: vi.fn() }));
vi.mock("@/lib/emailI18n", async () => (await import("@/test/notifyLeafMocks")).emailI18nLeaf());
vi.mock("next-intl/server", async () => (await import("@/test/notifyLeafMocks")).intlServerLeaf());
vi.mock("@/lib/serverLog", () => ({ structuredLog: vi.fn() }));
vi.mock("@/lib/appMeta", () => ({ markLastAction: vi.fn(), touchAppMeta: vi.fn() }));
vi.mock("@/lib/heimdallNotify", () => ({ notifyHeimdallForUserId: vi.fn(), notifyHeimdall: vi.fn() }));
vi.mock("@/lib/auth/keyholder", () => ({ getControllersOfUser: vi.fn(async () => []) }));

// Die Kanal-ENTSCHEIDUNG ist anderswo geprüft (`deliveryChannels`) — hier kommt sie als Vorgabe.
let CHANNELS = { mail: true, push: true, telegram: true };
vi.mock("@/lib/deliveryChannels", () => ({
  deliveryChannels: vi.fn(async () => CHANNELS),
  deliveryChannelsForUser: vi.fn(async () => CHANNELS),
}));
vi.mock("@/lib/messageService", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./messageService")>()),
  recordSystemMessage: vi.fn(async () => "m-new"),
  recordInboxDelivery: vi.fn(async () => ({ badge: 3, channels: CHANNELS })),
}));

import { notifyUser } from "./notify";
import { sendKontrolleNotification } from "./kontrollen/kontrolleService";
import { sendVerschlussAnforderungNotifications } from "./verschlussAnforderungService";
import { sendOrgasmusAnforderungNotifications } from "./orgasmusAnforderungService";
import { prisma } from "@/lib/prisma";
import { recordInboxDelivery } from "@/lib/messageService";
import * as mailModule from "@/lib/mail";
import * as pushModule from "@/lib/push";
import * as telegramModule from "@/lib/telegram";
import { APP_NAME } from "@/lib/constants";

type Spy = ReturnType<typeof vi.fn>;

const CHAT = "chat-1";
const USER: {
  id: string; email: string | null; username: string; locale: string; telegramChatId: string | null;
  notifyMail: string; notifyPush: string; notifyTelegram: string; orgasmusArtenConfig: string | null;
} = {
  id: "u1", email: "sub@example.org", username: "sub", locale: "de", telegramChatId: CHAT,
  notifyMail: "all", notifyPush: "all", notifyTelegram: "all", orgasmusArtenConfig: null,
};

/** Alles, was an die Mail ging: [Adresse, Betreff, HTML]. */
const mails = () => (mailModule.sendMailSafe as unknown as Spy).mock.calls;
/** Alles, was an die Push ging: [Nutzer, Titel, Text, Ziel, Badge]. */
const pushes = () => (pushModule.sendPushToUser as unknown as Spy).mock.calls;
/** Die Zeile, die die Datenbank für `u1` liefert. */
let DB_USER = USER;
const NO_CONTACT = { ...USER, email: null, telegramChatId: null };
/** Alles, was an Telegram ging: [Chat, Text]. */
const telegrams = () => (telegramModule.sendTelegram as unknown as Spy).mock.calls;

/** Warten, bis fire-and-forget-Enden durch sind. */
const settle = () => new Promise((r) => setTimeout(r, 0));

const CHANNEL_CASES = [
  ["alle Kanäle", { mail: true, push: true, telegram: true }],
  ["nur Mail", { mail: true, push: false, telegram: false }],
  ["nur Push", { mail: false, push: true, telegram: false }],
  ["nur Telegram", { mail: false, push: false, telegram: true }],
  ["nichts", { mail: false, push: false, telegram: false }],
] as const;

beforeEach(() => {
  vi.clearAllMocks();
  CHANNELS = { mail: true, push: true, telegram: true };
  DB_USER = USER;
  (prisma.user.findUnique as unknown as Spy).mockImplementation(async () => DB_USER);
});

/** Was jeder Versand liefern muss, gegeben die Kanäle — der gemeinsame Vertrag. */
function expectChannelsRespected(channels: { mail: boolean; push: boolean; telegram: boolean }) {
  expect(mails().length).toBe(channels.mail ? 1 : 0);
  expect(pushes().length).toBe(channels.push ? 1 : 0);
  expect(telegrams().length).toBe(channels.telegram ? 1 : 0);
  if (channels.mail) expect(mails()[0][0]).toBe(USER.email);
  if (channels.push) expect(pushes()[0][0]).toBe(USER.id);
  if (channels.telegram) expect(telegrams()[0][0]).toBe(CHAT);
}

describe("notifyUser", () => {
  const CONTENT = { subjectKey: "taskReviewSubjectKeyholder", messageKey: "lockRequestBody", url: "/dashboard/x" } as const;

  it("Mail, Push und Telegram tragen denselben aufgelösten Betreff und Text", async () => {
    await notifyUser("u1", { ...CONTENT });
    await settle();
    expect(mails()[0][1]).toBe(`${APP_NAME} – taskReviewSubjectKeyholder`);
    expect(mails()[0][2]).toContain("lockRequestBody");
    expect(pushes()[0]).toEqual(["u1", "taskReviewSubjectKeyholder", "lockRequestBody", "/dashboard/x", 3]);
    expect(telegrams()[0]).toEqual([CHAT, "taskReviewSubjectKeyholder\n\nlockRequestBody"]);
  });

  it.each(CHANNEL_CASES)("%s", async (_name, channels) => {
    CHANNELS = { ...channels };
    await notifyUser("u1", { ...CONTENT });
    await settle();
    expectChannelsRespected(channels);
  });

  it("ohne Adresse entfällt nur die Mail, ohne verknüpften Chat nur Telegram", async () => {
    DB_USER = NO_CONTACT;
    await notifyUser("u1", { ...CONTENT });
    await settle();
    expect(mails()).toHaveLength(0);
    expect(telegrams()).toHaveLength(0);
    expect(pushes()).toHaveLength(1);
  });
});

/** Die geladene Zeile geht an `recordInboxDelivery` weiter — sie wird nicht für die Kanal-Frage und
 *  den Telegram-Versand je ein weiteres Mal von der Platte geholt. */
const recipientPassedOn = () => (recordInboxDelivery as unknown as Spy).mock.calls[0][1];

describe("Verschluss-Direktive", () => {
  const BASE = {
    user: USER, endsAtDate: new Date("2026-08-13T12:00:00Z"), lockSpec: null, requestId: "va1", actor: "herrin",
  };

  it.each(CHANNEL_CASES)("Sperrzeit: %s", async (_name, channels) => {
    CHANNELS = { ...channels };
    await sendVerschlussAnforderungNotifications({ ...BASE, art: "SPERRZEIT", message: "Hinweis" });
    await settle();
    expectChannelsRespected(channels);
  });

  it("Sperrzeit: Betreff, Push-Titel/Text/Ziel/Badge und Telegram-Text", async () => {
    await sendVerschlussAnforderungNotifications({ ...BASE, art: "SPERRZEIT", message: "Hinweis" });
    await settle();
    expect(mails()[0][1]).toBe(`${APP_NAME} – lockPeriodSetSubject`);
    const [id, title, body, url, badge] = pushes()[0];
    expect([id, title, url, badge]).toEqual(["u1", "lockPushPeriodTitle", "/dashboard", 3]);
    expect(body).toContain("lockPushUntil");
    expect(body.endsWith("Hinweis")).toBe(true);
    expect(telegrams()[0]).toEqual([CHAT, `${title}\n\n${body}`]);
  });

  it("reicht die geladene Zeile des Empfängers durch", async () => {
    await sendVerschlussAnforderungNotifications({ ...BASE, art: "SPERRZEIT", message: null });
    expect(recipientPassedOn()).toBe(USER);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("Anforderung: eigener Betreff und Push-Titel", async () => {
    await sendVerschlussAnforderungNotifications({ ...BASE, art: "ANFORDERUNG", message: null });
    await settle();
    expect(mails()[0][1]).toBe(`${APP_NAME} – lockRequestSubject`);
    expect(pushes()[0][1]).toBe("lockPushRequestTitle");
    expect(telegrams()[0][1]).toContain("lockPushRequestTitle");
  });

  it("ohne Adresse und ohne Chat bleibt die Push", async () => {
    DB_USER = NO_CONTACT;
    await sendVerschlussAnforderungNotifications({
      ...BASE, user: NO_CONTACT, art: "SPERRZEIT", message: null,
    });
    await settle();
    expect(mails()).toHaveLength(0);
    expect(telegrams()).toHaveLength(0);
    expect(pushes()).toHaveLength(1);
  });
});

describe("Orgasmus-Direktive", () => {
  const BASE = {
    user: USER, art: "ANWEISUNG" as const, message: "Hinweis",
    beginsAtDate: new Date("2026-08-13T10:00:00Z"), endsAtDate: new Date("2026-08-13T12:00:00Z"),
    requiredType: null, openingAllowed: false, directiveId: "oa1", actor: "herrin",
  };

  it.each(CHANNEL_CASES)("%s", async (_name, channels) => {
    CHANNELS = { ...channels };
    await sendOrgasmusAnforderungNotifications(BASE);
    await settle();
    expectChannelsRespected(channels);
  });

  it("reicht die geladene Zeile des Empfängers durch", async () => {
    await sendOrgasmusAnforderungNotifications(BASE);
    expect(recipientPassedOn()).toBe(USER);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("Betreff, Push-Titel/Text/Ziel/Badge und Telegram-Text", async () => {
    await sendOrgasmusAnforderungNotifications(BASE);
    await settle();
    expect(mails()[0][1]).toBe(`${APP_NAME} – orgasmAnweisungSubject`);
    const [id, title, body, url, badge] = pushes()[0];
    expect([id, title, url, badge]).toEqual(["u1", "orgasmAnweisungSubject", "/dashboard", 3]);
    expect(body.endsWith("Hinweis")).toBe(true);
    expect(telegrams()[0]).toEqual([CHAT, `${title}\n\n${body}`]);
  });
});

describe("Kontrolle", () => {
  const BASE = {
    user: USER, code: "12345", sealCode: null, kommentar: null,
    deadline: new Date("2026-08-12T15:00:00Z"), controlId: "ka1", actor: "herrin",
  };

  it.each(CHANNEL_CASES)("%s", async (_name, channels) => {
    CHANNELS = { ...channels };
    await sendKontrolleNotification(BASE);
    await settle();
    expectChannelsRespected(channels);
  });

  it("reicht die geladene Zeile des Empfängers durch", async () => {
    await sendKontrolleNotification(BASE);
    expect(recipientPassedOn()).toBe(USER);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("Push-Ziel trägt den Code, Titel/Text/Badge stimmen mit Telegram überein", async () => {
    await sendKontrolleNotification(BASE);
    await settle();
    const [id, title, body, url, badge] = pushes()[0];
    expect([id, badge]).toEqual(["u1", 3]);
    expect(url).toContain("12345");
    expect(telegrams()[0]).toEqual([CHAT, `${title}\n\n${body}`]);
  });
});
