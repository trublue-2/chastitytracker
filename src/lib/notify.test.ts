import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Die Meldung an die Keyholder eines Trägers.
 *
 * Sie hinterlässt jetzt EINE Posteingangs-Zeile — und die Zahl „eins" ist der eigentliche Vertrag:
 * die Zeile gehört dem SUB (`subjectUserId`) und wird von allen seinen Keyholdern geteilt, weil der
 * Gelesen-Stand am Leser hängt (`MessageRead.userId`). Schriebe sie jemand je Empfänger, stünde
 * dieselbe Meldung n-fach in der Tabelle, und niemand bekäme davon einen Fehler.
 */
vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: vi.fn() } },
}));
vi.mock("@/lib/mail", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/mail")>()),
  sendMailSafe: vi.fn(),
}));
vi.mock("@/lib/push", () => ({ firePush: vi.fn() }));
vi.mock("@/lib/deliveryChannels", () => ({
  deliveryChannels: vi.fn(async () => ({ mail: true, push: true, telegram: false })),
  deliveryChannelsForUser: vi.fn(async () => ({ mail: true, push: true, telegram: false })),
}));
// Nur die beiden Schreib-Funktionen werden ersetzt; alles andere bleibt echt (Absender-Abbildung &
// Co. sind reine Ableitung). Spread statt Aufzählung, siehe offenseAnnounce.test.ts.
vi.mock("@/lib/messageService", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./messageService")>()),
  recordSystemMessage: vi.fn(async () => "m-new"),
  // Die Kanäle kommen aus den (gemockten) Stufen des Empfängers — so bleibt das Gaten unten prüfbar.
  recordInboxDelivery: vi.fn(async (p: { subjectUserId: string }) => ({
    badge: 1,
    channels: await (await import("@/lib/deliveryChannels")).deliveryChannelsForUser(p.subjectUserId, "info"),
  })),
}));

import { notifyControllers, notifyUser } from "./notify";
import { prisma } from "@/lib/prisma";
import { sendMailSafe } from "@/lib/mail";
import { firePush } from "@/lib/push";
import { deliveryChannels, deliveryChannelsForUser } from "@/lib/deliveryChannels";
import { recordSystemMessage, recordInboxDelivery } from "@/lib/messageService";

const mock = (fn: unknown) => fn as unknown as ReturnType<typeof vi.fn>;

/** Ein Empfänger, wie ihn `getControllersOfUser` liefert — GELADEN, nicht als blosse id: genau das
 *  ist der Vertrag von `NotifyRecipient`, und der Fall unten hält fest, dass der Versand ihn dann
 *  auch nicht ein zweites Mal nachschlägt. */
const kh = (id: string) => ({
  id, username: id, email: `${id}@example.com`, locale: "de", telegramChatId: null,
  // Seine EIGENEN Stufen reisen mit der Zeile — seit sie auch über die Meldungen seiner Subs
  // entscheiden, braucht der Versand sie je Empfänger.
  notifyMail: "all", notifyPush: "all", notifyTelegram: "all",
});

const CONTENT = {
  subjectKey: "taskReviewSubjectKeyholder",
  messageKey: "taskReviewMessageKeyholder",
  params: { username: "traeger", title: "Wohnung putzen" },
} as const;

beforeEach(() => {
  vi.clearAllMocks();
  mock(prisma.user.findUnique).mockImplementation(async ({ where }: { where: { id: string } }) => ({
    email: `${where.id}@example.com`,
    username: where.id,
    locale: "de",
  }));
  mock(recordSystemMessage).mockResolvedValue("m-new");
});

describe("notifyControllers", () => {
  it("schreibt GENAU EINE Zeile — auch bei drei Keyholdern", async () => {
    await notifyControllers("sub1", [kh("kh1"), kh("kh2"), kh("kh3")], { ...CONTENT });
    expect(recordSystemMessage).toHaveBeenCalledOnce();
  });

  it("die Zeile trägt den SUB als Betreff und die Keyholder als Zielgruppe", async () => {
    await notifyControllers("sub1", [kh("kh1"), kh("kh2")], { ...CONTENT });
    expect(mock(recordSystemMessage).mock.calls[0][0]).toMatchObject({
      subjectUserId: "sub1",
      audience: "keyholders",
      bodyKey: "taskReviewMessageKeyholder",
      params: CONTENT.params,
    });
  });

  it("schreibt die Zeile auch dann, wenn es (noch) keinen Empfänger gibt", async () => {
    // Der Posteingang ist der bleibende Kanal: ein Keyholder ohne Mail-Adresse oder ein erst später
    // zugeordneter soll die Meldung nachlesen können. An der Empfängerliste hängt nur der Versand.
    await notifyControllers("sub1", [], { ...CONTENT });
    expect(recordSystemMessage).toHaveBeenCalledOnce();
    expect(sendMailSafe).not.toHaveBeenCalled();
  });

  it("Mail und Push gehen weiterhin an JEDEN Keyholder einzeln", async () => {
    await notifyControllers("sub1", [kh("kh1"), kh("kh2")], { ...CONTENT });
    expect(mock(sendMailSafe).mock.calls.map((c) => c[0])).toEqual(
      expect.arrayContaining(["kh1@example.com", "kh2@example.com"]),
    );
    expect(mock(firePush).mock.calls.map((c) => c[0])).toEqual(expect.arrayContaining(["kh1", "kh2"]));
  });

  it("reicht ref und once an die Keyholder-Zeile durch — sonst wäre der Poller-Retry ungeschützt", async () => {
    // Der Poller stempelt ERST NACH dem Versand (damit ein Fehlschlag erneut versucht wird). Bricht
    // er dazwischen ab, läuft die Meldung ein zweites Mal — und eine doppelte Posteingangs-Zeile
    // bleibt stehen, anders als eine doppelte Mail. Die Sub-Zeile war darüber längst geschützt;
    // diese hier bekam die Zusage erst, als `notifyControllers` `inbox` überhaupt annahm.
    // Dass `once` dann auch greift, hält `messageService.test.ts` fest.
    await notifyControllers("sub1", [kh("kh1")], {
      ...CONTENT,
      inbox: { ref: { type: "task", id: "t1" }, once: true },
    });
    expect(mock(recordSystemMessage).mock.calls[0][0]).toMatchObject({
      audience: "keyholders",
      ref: { type: "task", id: "t1" },
      once: true,
    });
  });

  it("schreibt KEINE Zeile, wenn der Träger selbst die Admin-Rolle trägt", async () => {
    // Der Leserkreis des Keyholder-Posteingangs ist `getControllableSubs`, und die Menge schliesst
    // Admins aus. Für einen Träger mit Admin-Rolle gäbe es also keinen einzigen Leser: die Zeile
    // wäre geschrieben, unsichtbar und dauerhaft. Auf einer Ein-Personen-Instanz ist das der
    // NORMALFALL — `scripts/seed.js` legt den ersten Nutzer als Admin an.
    mock(prisma.user.findUnique).mockImplementation(async ({ where }: { where: { id: string } }) => ({
      email: `${where.id}@example.com`,
      username: where.id,
      locale: "de",
      role: where.id === "sub1" ? "admin" : "user",
    }));

    await notifyControllers("sub1", [kh("kh1")], { ...CONTENT });

    expect(recordSystemMessage).not.toHaveBeenCalled();
  });

  it("Mail und Push gehen an denselben Träger trotzdem raus — die Meldung geht nicht verloren", async () => {
    // Die Zeile entfällt, der KANAL nicht: für diesen Fall ist die Mail der Weg, und sie ändert
    // sich durch die Regel oben um kein Byte.
    mock(prisma.user.findUnique).mockImplementation(async ({ where }: { where: { id: string } }) => ({
      email: `${where.id}@example.com`,
      username: where.id,
      locale: "de",
      role: where.id === "sub1" ? "admin" : "user",
    }));

    await notifyControllers("sub1", [kh("kh1"), kh("kh2")], { ...CONTENT });

    expect(mock(sendMailSafe).mock.calls.map((c) => c[0])).toEqual(
      expect.arrayContaining(["kh1@example.com", "kh2@example.com"]),
    );
    expect(mock(firePush).mock.calls.map((c) => c[0])).toEqual(expect.arrayContaining(["kh1", "kh2"]));
  });

  it("fällt die Rollen-Abfrage aus, wird geschrieben — eine Meldung darf nicht an einem Lesefehler hängen", async () => {
    mock(prisma.user.findUnique).mockImplementation(async ({ where }: { where: { id: string } }) => {
      if (where.id === "sub1") throw new Error("db weg");
      return { email: `${where.id}@example.com`, username: where.id, locale: "de" };
    });

    await notifyControllers("sub1", [kh("kh1")], { ...CONTENT });

    expect(recordSystemMessage).toHaveBeenCalledOnce();
    expect(sendMailSafe).toHaveBeenCalled();
  });

  it("schlägt die Empfänger NICHT ein zweites Mal nach", async () => {
    // Die Aufrufer holen ihre Keyholder über `getControllersOfUser` — mit Mail-Adresse und Sprache,
    // eben WEIL der Versand beides braucht. Reichten sie nur die ids herein, liefe je Kopf noch eine
    // Abfrage über dieselbe Zeile: bei drei Keyholdern vier statt einer. Die einzige `user`-Abfrage,
    // die hier bleiben darf, ist die Rollen-Prüfung am TRÄGER (`keyholderRowReadable`).
    await notifyControllers("sub1", [kh("kh1"), kh("kh2"), kh("kh3")], { ...CONTENT });
    expect(mock(prisma.user.findUnique).mock.calls.map((c) => c[0].where.id)).toEqual(["sub1"]);
  });

  it("schreibt KEINE Zeile in den persönlichen Posteingang des Keyholders", async () => {
    // `notifyUser` bekommt `inbox: false` — sonst landete die Meldung über einen fremden Träger im
    // eigenen Posteingang des Keyholders, als wäre sie seine eigene Direktive.
    await notifyControllers("sub1", [kh("kh1")], { ...CONTENT });
    expect(recordInboxDelivery).not.toHaveBeenCalled();
  });
});

/**
 * Die Kanal-Schalter des Empfängers (`MESSAGE_RECEIVED`) gaten JEDE Zustellung an ihn — auch das,
 * was früher über `alwaysNotify` an den Schaltern vorbei ging (Anforderungen, Fristen, Eskalation).
 * Der Gewinn und die Grenze zugleich: „Mail aus" heisst wirklich keine Mail, aber die
 * Posteingangs-Zeile bleibt der garantierte Nachweis — ein stummer Kanal dämpft, er löscht nicht.
 */
describe("notifyUser — die Kanal-Schalter des Empfängers gaten alles", () => {
  const RECIP = { subjectKey: "inspectionRequestedSubject", messageKey: "inspectionRequestedMessage" } as const;

  it("Mail aus: keine Mail, aber die Posteingangs-Zeile und Push bleiben", async () => {
    // Deckt zugleich die früheren `alwaysNotify`-Ereignisse ab: `notifyLoadedUser` verzweigt NICHT
    // nach `messageKey`, die Art der Meldung (Anforderung/Frist/„neue Nachricht") ändert am Gaten
    // also nichts. Genau das war vorher anders — eine Friständerung ging trotz Mail-aus per Mail raus.
    mock(deliveryChannelsForUser).mockResolvedValue({ mail: false, push: true, telegram: false });
    await notifyUser("sub1", { ...RECIP });
    expect(sendMailSafe).not.toHaveBeenCalled();
    expect(firePush).toHaveBeenCalledOnce();
    expect(recordInboxDelivery).toHaveBeenCalledOnce();
  });

  it("alle Kanäle aus: nichts wird zugestellt, die Posteingangs-Zeile bleibt trotzdem", async () => {
    mock(deliveryChannelsForUser).mockResolvedValue({ mail: false, push: false, telegram: false });
    await notifyUser("sub1", { ...RECIP });
    expect(sendMailSafe).not.toHaveBeenCalled();
    expect(firePush).not.toHaveBeenCalled();
    expect(recordInboxDelivery).toHaveBeenCalledOnce();
  });

  it("ein eigener Ereignis-Schalter VERENGT die Stufe", async () => {
    // Die Wiege-Erinnerung ist der letzte Fall mit eigenem Schalter. Er darf eine Meldung zusätzlich
    // abbestellen — hier: Push aus, obwohl die Stufe ihn zuliesse.
    mock(deliveryChannels).mockResolvedValue({ mail: true, push: true, telegram: false });
    await notifyUser("sub1", {
      subjectKey: "weightReminderSubject", messageKey: "weightReminderMessage",
      inbox: false, priority: "info", channels: { mail: true, push: false, telegram: false },
    });
    expect(sendMailSafe).toHaveBeenCalledOnce();
    expect(firePush).not.toHaveBeenCalled();
  });

  it("und erweitert sie nie: Mail auf Aus gilt auch für die Wiege-Erinnerung", async () => {
    // Der Fehler, den das Stufen-Modell zunächst mitbrachte: der Ereignis-Schalter wurde STATT der
    // Stufe gelesen. Ein Träger mit Mail auf „Aus" bekam die Erinnerung trotzdem per Mail.
    mock(deliveryChannels).mockResolvedValue({ mail: false, push: true, telegram: false });
    await notifyUser("sub1", {
      subjectKey: "weightReminderSubject", messageKey: "weightReminderMessage",
      inbox: false, priority: "info", channels: { mail: true, push: true, telegram: false },
    });
    expect(sendMailSafe).not.toHaveBeenCalled();
    expect(firePush).toHaveBeenCalledOnce();
  });

  it("ohne Posteingangs-Zeile (Keyholder-Pfad): die Stufen des EMPFÄNGERS entscheiden", async () => {
    // Umgekehrt zur früheren Regel: eine Meldung über einen fremden Träger folgte dem Raster DES
    // SUBS, der Empfänger konnte sie nicht dämpfen. Jetzt zählen seine eigenen Stufen — gelesen aus
    // der schon geladenen Zeile, ohne zweite Abfrage.
    // Die Stufen hier ausdrücklich setzen: `mockResolvedValue` eines früheren Falls bleibt sonst
    // stehen (`clearAllMocks` löscht die Aufrufe, nicht die hinterlegte Antwort).
    mock(deliveryChannels).mockResolvedValue({ mail: true, push: true, telegram: false });
    await notifyUser("sub1", { subjectKey: "inspectionRequestedSubject", messageKey: "inspectionRequestedMessage", inbox: false });
    expect(deliveryChannels).toHaveBeenCalledOnce();
    expect(sendMailSafe).toHaveBeenCalledOnce();
    expect(firePush).toHaveBeenCalledOnce();
  });
});
