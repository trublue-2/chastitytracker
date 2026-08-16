import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Die Meldung an die Keyholder über einen Eintrag des Trägers — in DEREN Sprache.
 *
 * Bis Issue #43 war dies die einzige Meldung im Projekt, die die Sprache des Empfängers ignorierte:
 * Titel und Beschriftungen standen als deutsche Literale im Code, die Gründe wurden mit
 * `locale: "de"` gerendert. Ein englischsprachiger Keyholder bekam sie auf Deutsch.
 */

vi.mock("@/lib/prisma", () => ({
  prisma: {
    device: { findUnique: vi.fn() },
  },
}));
// Die Schalter des Trägers kommen über `notificationPrefs`, nicht über eine eigene Abfrage — diese
// Meldung war die letzte, die daneben las (und dabei eine fehlende Zeile als „stumm" auslegte).
vi.mock("@/lib/notificationPrefs", () => ({ getEventChannelsAny: vi.fn() }));
vi.mock("@/lib/mail", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/mail")>()),
  sendMailSafe: vi.fn(),
  appBaseUrl: () => "https://kg.example",
}));
vi.mock("@/lib/push", () => ({ sendPushToUser: vi.fn() }));
vi.mock("@/lib/keyholder", () => ({ getControllersOfUser: vi.fn() }));

import { notifyControllersAboutEntry, type EntryNotifyParams } from "./entryNotify";
import { sendMailSafe } from "@/lib/mail";
import { sendPushToUser } from "@/lib/push";
import { getControllersOfUser } from "@/lib/keyholder";
import { getEventChannelsAny } from "@/lib/notificationPrefs";

const prefs = getEventChannelsAny as unknown as ReturnType<typeof vi.fn>;
const controllers = getControllersOfUser as unknown as ReturnType<typeof vi.fn>;
const mail = sendMailSafe as unknown as ReturnType<typeof vi.fn>;
const push = sendPushToUser as unknown as ReturnType<typeof vi.fn>;

const BASE: EntryNotifyParams = {
  userId: "sub1",
  username: "trublue",
  type: "VERSCHLUSS",
  startTime: new Date("2026-08-02T14:30:00Z"),
  reasonConfig: null,
};

/** Betreff der Mail an diese Adresse. */
const subjectTo = (email: string) => mail.mock.calls.find((c) => c[0] === email)?.[1] as string;

beforeEach(() => {
  vi.clearAllMocks();
  prefs.mockResolvedValue({ mail: true, push: true });
  controllers.mockResolvedValue([
    { id: "kh-de", email: "de@example.com", locale: "de" },
    { id: "kh-en", email: "en@example.com", locale: "en" },
  ]);
});

describe("notifyControllersAboutEntry", () => {
  it("schreibt jedem Keyholder in SEINER Sprache", async () => {
    await notifyControllersAboutEntry(BASE);

    expect(subjectTo("de@example.com")).toContain("trublue hat sich eingeschlossen");
    expect(subjectTo("en@example.com")).toContain("trublue locked up");
  });

  it("übersetzt auch die Detail-Beschriftungen, nicht nur den Titel", async () => {
    await notifyControllersAboutEntry({ ...BASE, keyInBoxDeclared: false, note: "eng" });

    const en = mail.mock.calls.find((c) => c[0] === "en@example.com")?.[2] as string;
    expect(en).toContain("Time:");
    expect(en).toContain("NOT in the box");
    expect(en).toContain("Note:");
    expect(en).not.toContain("Zeitpunkt:");
    expect(en).not.toContain("NICHT in der Box");
  });

  it("übersetzt den eingebauten Öffnungsgrund je Empfänger", async () => {
    // Der Grund liegt im `openForm`-Namensraum — genau der wurde vorher mit `locale: "de"` geholt.
    await notifyControllersAboutEntry({ ...BASE, type: "OEFFNEN", oeffnenGrund: "REINIGUNG" });

    const de = mail.mock.calls.find((c) => c[0] === "de@example.com")?.[2] as string;
    const en = mail.mock.calls.find((c) => c[0] === "en@example.com")?.[2] as string;
    expect(de).toContain("Reinigung");
    expect(en).toContain("Cleaning");
  });

  it("lässt das eigene Label des Trägers unübersetzt — es ist sein Text, keine Vorlage", async () => {
    await notifyControllersAboutEntry({
      ...BASE, type: "OEFFNEN", oeffnenGrund: "REINIGUNG",
      reasonConfig: { oeffnenGruendeConfig: JSON.stringify([{ code: "REINIGUNG", label: "Putzen" }]), orgasmusArtenConfig: null },
    });

    for (const to of ["de@example.com", "en@example.com"]) {
      expect(mail.mock.calls.find((c) => c[0] === to)?.[2]).toContain("Putzen");
    }
  });

  it("meldet auch per Push in der Sprache des Empfängers", async () => {
    await notifyControllersAboutEntry(BASE);

    const titles = Object.fromEntries(push.mock.calls.map((c) => [c[0], c[1]]));
    expect(titles["kh-de"]).toContain("hat sich eingeschlossen");
    expect(titles["kh-en"]).toContain("locked up");
  });

  it("schweigt, wenn der Träger diese Meldung abgeschaltet hat", async () => {
    prefs.mockResolvedValue({ mail: false, push: false });

    await notifyControllersAboutEntry(BASE);

    expect(mail).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it("ein einzelner Kanal bleibt einzeln abschaltbar", async () => {
    prefs.mockResolvedValue({ mail: false, push: true });

    await notifyControllersAboutEntry(BASE);

    expect(mail).not.toHaveBeenCalled();
    expect(push).toHaveBeenCalled();
  });

  /**
   * Eine Öffnung während einer zurückgezogenen Sperrzeit ist AUCH eine Öffnung — sie nennt deshalb
   * beide Schalter. Was aus zweien wird, entscheidet `notificationPrefs`; hier zählt nur, dass beide
   * genannt werden. Nennte diese Meldung nur den spezielleren, bliebe der allgemeine wirkungslos.
   */
  it("nennt alle Schalter, die der Eintrag auslöst", async () => {
    await notifyControllersAboutEntry({ ...BASE, type: "OEFFNEN", withdrawnSperrzeit: true });

    expect(prefs).toHaveBeenCalledWith("sub1", ["OEFFNUNG_IMMER", "OEFFNUNG_VERBOTEN"]);
  });

  it("wirft nie — eine gescheiterte Meldung darf den Eintrag nicht mitreissen", async () => {
    controllers.mockRejectedValue(new Error("db weg"));

    await expect(notifyControllersAboutEntry(BASE)).resolves.toBeUndefined();
  });
});

/**
 * WER meldet für WEN — und wer bekommt es dann.
 *
 * Der Auslöser (03.08.2026) war der zweite Fall: eine Keyholderin, die selbst getrackt wird, trug
 * über den Keyholder-Bereich ihren EIGENEN Verschluss ein. Actor und Träger sind dort dieselbe
 * Person, und ihr Sub — der über `AdminUserRelationship` ihr Keyholder ist — bekam nichts.
 */
describe("Empfängerkreis", () => {
  beforeEach(() => {
    prefs.mockResolvedValue({ mail: true, push: true });
  });

  it("erfasst jemand für SICH SELBST, bleibt die Empfängerliste vollständig", async () => {
    // LadyN ist Admin (steht damit in ihrer eigenen Kontrolleur-Liste) und hat einen Keyholder.
    controllers.mockResolvedValue([
      { id: "ladyN", email: "lady@example.test", locale: "de" },
      { id: "egberto", email: "sub@example.test", locale: "de" },
    ]);

    await notifyControllersAboutEntry({ ...BASE, userId: "ladyN", actorUserId: "ladyN" });

    const to = mail.mock.calls.map((c) => c[0]).sort();
    expect(to).toEqual(["lady@example.test", "sub@example.test"]);
  });

  it("erfasst jemand für JEMAND ANDEREN, fällt er selbst raus", async () => {
    controllers.mockResolvedValue([
      { id: "ladyN", email: "lady@example.test", locale: "de" },
      { id: "andere", email: "other@example.test", locale: "de" },
    ]);

    // Die Keyholderin trägt für ihren Sub nach — eine Mail an sich selbst wäre sinnlos.
    await notifyControllersAboutEntry({ ...BASE, userId: "sub1", actorUserId: "ladyN" });

    expect(mail.mock.calls.map((c) => c[0])).toEqual(["other@example.test"]);
    expect(push.mock.calls.map((c) => c[0])).toEqual(["andere"]);
  });

  it("ohne Actor-Angabe wird niemand gestrichen", async () => {
    controllers.mockResolvedValue([{ id: "kh", email: "kh@example.test", locale: "de" }]);

    await notifyControllersAboutEntry({ ...BASE });

    expect(mail.mock.calls.map((c) => c[0])).toEqual(["kh@example.test"]);
  });
});
