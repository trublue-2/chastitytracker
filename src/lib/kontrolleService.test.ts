import { describe, it, expect, vi, beforeEach } from "vitest";

// hasActiveKontrolle nutzt nur prisma.kontrollAnforderung.findFirst; resolveInspectionEntry
// zusätzlich entry.findUnique/update — mocken.
vi.mock("@/lib/prisma", () => ({
  prisma: {
    kontrollAnforderung: { findFirst: vi.fn() },
    entry: { findUnique: vi.fn(), update: vi.fn() },
  },
}));
vi.mock("@/lib/notify", () => ({ notifyUser: vi.fn() }));
vi.mock("@/lib/appMeta", () => ({ markLastAction: vi.fn(), touchAppMeta: vi.fn() }));
vi.mock("@/lib/push", () => ({ firePush: vi.fn(), hasPushTarget: vi.fn() }));

import { hasActiveKontrolle, inspectionIntro, buildInspectionPush, buildInspectionCodePush, resolveInspectionEntry, resendOwnInspectionCode } from "./kontrolleService";
import { emailT } from "@/lib/emailI18n";
import { prisma } from "@/lib/prisma";
import { notifyUser } from "@/lib/notify";
import { firePush, hasPushTarget } from "@/lib/push";

/** Die Zone, in der die Erwartungswerte dieser Datei ausgedrückt sind. Als Konstante, damit der
 *  eine Test, der bewusst eine ANDERE Zone prüft, im Fliesstext sofort auffällt. */
const TZ = "Europe/Zurich";

const findFirstMock = prisma.kontrollAnforderung.findFirst as unknown as ReturnType<typeof vi.fn>;
const entryFindMock = prisma.entry.findUnique as unknown as ReturnType<typeof vi.fn>;
const entryUpdateMock = prisma.entry.update as unknown as ReturnType<typeof vi.fn>;
const notifyMock = notifyUser as unknown as ReturnType<typeof vi.fn>;
const firePushMock = firePush as unknown as ReturnType<typeof vi.fn>;
const pushTargetMock = hasPushTarget as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  findFirstMock.mockReset();
  entryFindMock.mockReset();
  entryUpdateMock.mockReset();
  notifyMock.mockReset();
});

describe("hasActiveKontrolle — Überschneidungs-Guard", () => {
  const NOW = new Date("2026-07-09T12:00:00Z");

  it("true, wenn eine sichtbare (unmittelbare) Kontrolle existiert", async () => {
    findFirstMock.mockResolvedValue({ id: "ka1" });
    const result = await hasActiveKontrolle("u1", NOW, { categoryId: null });
    expect(result).toBe(true);
  });

  it("false, wenn keine passende Zeile gefunden wird", async () => {
    findFirstMock.mockResolvedValue(null);
    const result = await hasActiveKontrolle("u1", NOW, { categoryId: null });
    expect(result).toBe(false);
  });

  it("Query filtert entryId:null, withdrawnAt:null und (wirksamAb:null ODER bereits erreicht)", async () => {
    findFirstMock.mockResolvedValue(null);
    await hasActiveKontrolle("u1", NOW, { categoryId: null });
    const arg = findFirstMock.mock.calls[0][0];
    expect(arg.where).toMatchObject({ userId: "u1", entryId: null, withdrawnAt: null });
    expect(arg.where.OR).toEqual([{ wirksamAb: null }, { wirksamAb: { lte: NOW } }]);
    // Eine noch in der Zukunft geplante (unsichtbare) Kontrolle darf NICHT als aktiv zählen —
    // sichergestellt dadurch, dass die Query wirksamAb explizit auf "erreicht" beschränkt statt
    // jede nicht-null wirksamAb zuzulassen.
    expect(arg.where.wirksamAb).toBeUndefined();
  });

  it("blockiert nur LAUFENDE: deadline muss noch in der Zukunft liegen (überfällige zählen nicht)", async () => {
    findFirstMock.mockResolvedValue(null);
    await hasActiveKontrolle("u1", NOW, { categoryId: null });
    const arg = findFirstMock.mock.calls[0][0];
    // deadline >= now grenzt Status "open" von "overdue" ab. Eine überfällige, nie beantwortete
    // Kontrolle (deadline < now) würde sonst jede künftige (auch Auto-)Kontrolle dauerhaft
    // blockieren — genau das verhindert diese Bedingung.
    expect(arg.where.deadline).toEqual({ gte: NOW });
  });

  it("excludeId schliesst die geprüfte Zeile selbst aus (Poller-Fall: 'irgendeine ANDERE aktive')", async () => {
    findFirstMock.mockResolvedValue(null);
    await hasActiveKontrolle("u1", NOW, { categoryId: null, excludeId: "self-id" });
    const arg = findFirstMock.mock.calls[0][0];
    expect(arg.where.id).toEqual({ not: "self-id" });
  });

  it("ohne excludeId wird kein id-Filter gesetzt (requestKontrolle-Fall: neue Zeile existiert noch nicht)", async () => {
    findFirstMock.mockResolvedValue(null);
    await hasActiveKontrolle("u1", NOW, { categoryId: null });
    const arg = findFirstMock.mock.calls[0][0];
    expect(arg.where.id).toBeUndefined();
  });

  it("filtert auf das ZIEL: eine Plug-Kontrolle blockiert keine KG-Kontrolle (v5.0.1)", async () => {
    findFirstMock.mockResolvedValue(null);
    await hasActiveKontrolle("u1", NOW, { categoryId: "cat-plug" });
    expect(findFirstMock.mock.calls[0][0].where.categoryId).toBe("cat-plug");

    // `null` ist der KG und wird EXPLIZIT gefiltert — ohne dieses Feld in der Where-Klausel würde
    // jede laufende Kategorie-Kontrolle auch die KG-Kontrolle blockieren.
    await hasActiveKontrolle("u1", NOW, { categoryId: null });
    expect(findFirstMock.mock.calls[1][0].where.categoryId).toBeNull();
  });
});

/**
 * Issue #42: Die Mail sagte „innert der nächsten 1 Stunde", während die Frist-Zeile darunter 10
 * Minuten nannte. Ursache war `Math.max(1, Math.round(ms / 3_600_000))` — alles unter einer halben
 * Stunde rundete auf 0 und wurde auf 1 angehoben, und 90 Minuten wurden zu „2 Stunden".
 * Auto-Kontrollen ziehen ihre Frist zufällig aus 5–240 Minuten (AUTO_INSPECTION_DEADLINE_*_RANGE),
 * das trifft also den Normalfall.
 */
describe("inspectionIntro — die genannte Dauer muss der echten Frist entsprechen", () => {
  const min = (n: number) => n * 60_000;
  const de = (ms: number) => inspectionIntro(emailT("de"), ms);
  const en = (ms: number) => inspectionIntro(emailT("en"), ms);

  it("nennt Minuten, wenn weniger als eine Stunde bleibt (der gemeldete Fall)", () => {
    expect(de(min(10))).toContain("10 Minuten");
    expect(de(min(10))).not.toContain("Stunde");
    expect(en(min(10))).toContain("10 minutes");
  });

  it("beugt die Einzahl korrekt", () => {
    expect(de(min(1))).toContain("1 Minute ");
    expect(en(min(1))).toContain(" 1 minute.");
  });

  it("nennt bei vollen Stunden nur Stunden", () => {
    expect(de(min(60))).toContain("1 Stunde ");
    expect(de(min(240))).toContain("4 Stunden");
    expect(en(min(240))).toContain(" 4 hours.");
  });

  it("zerlegt krumme Fristen statt sie zu runden", () => {
    // Vor dem Fix: „2 Stunden" — also 30 Minuten mehr versprochen, als die Frist hergab.
    expect(de(min(90))).toContain("1 Stunde und 30 Minuten");
    expect(de(min(150))).toContain("2 Stunden und 30 Minuten");
    expect(en(min(90))).toContain("1 hour and 30 minutes");
  });

  it("verspricht NIE mehr Zeit, als tatsächlich bleibt", () => {
    // Die Eigenschaft, an der der ursprüngliche Fehler gescheitert wäre — über die ganze Spannweite,
    // aus der die Auto-Kontrolle ihre Frist zieht.
    for (let m = 1; m <= 240; m++) {
      const text = de(min(m));
      const h = /(\d+) Stunden?/.exec(text);
      const mi = /(\d+) Minuten?/.exec(text);
      const genannt = (h ? Number(h[1]) * 60 : 0) + (mi ? Number(mi[1]) : 0);
      expect(genannt, `bei ${m} min stand „${text}"`).toBeLessThanOrEqual(m);
    }
  });

  it("kippt an der Stundengrenze nicht auf „60 Minuten“", () => {
    const s = de(min(59.6));  // rundet auf 60
    expect(s).not.toContain("60 Minuten");
    expect(s).toContain("1 Stunde ");
  });

  it("behauptet bei verstrichener oder kaputter Frist keine 0 und kein NaN", () => {
    expect(de(-min(5))).toContain("1 Minute ");
    expect(de(NaN)).toContain("1 Minute ");
    expect(de(NaN)).not.toContain("NaN");
  });
});

describe("buildInspectionPush — der Code muss auf dem Foto der Smartwatch lesbar sein", () => {
  const t = emailT("de");
  // Frist 19:43 Ortszeit (Europe/Zurich) am 05.08., Stichtag am selben Tag.
  const DEADLINE = new Date("2026-08-05T17:43:00Z");
  const NOW = new Date("2026-08-05T10:00:00Z");
  const base = {
    t, code: "70499", targetLabel: null, deadline: DEADLINE,
    deadlineStr: "05.08.2026, 19:43", sealRequired: false, kommentar: null, now: NOW,
  };

  it("stellt den Code in den TITEL — dort rendert die Uhr die grösste Schrift", () => {
    const { title, body } = buildInspectionPush(base);
    expect(title).toContain("70499");
    // Und NICHT zusätzlich in den Text: dort stünde er klein und als zweite Zahl, die die
    // Erkennung mit der Frist verwechseln kann.
    expect(body).not.toContain("70499");
  });

  it("hält den Text frei von Zahlen, die wie ein Code aussehen: Frist heute nur als Uhrzeit", () => {
    const { body } = buildInspectionPush(base);
    expect(body).toContain("19:43");
    expect(body).not.toContain("2026");
  });

  it("nennt die Frist voll, sobald sie nicht mehr heute liegt", () => {
    const { body } = buildInspectionPush({ ...base, deadline: new Date("2026-08-06T17:43:00Z") });
    expect(body).toContain("05.08.2026, 19:43");
  });

  it("ohne Code-Pflicht bleibt der bisherige Titel — keine Lücke, wo eine Zahl erwartet wird", () => {
    const { title } = buildInspectionPush({ ...base, code: null });
    expect(title).toBe(t("inspectionPushTitle"));
    expect(title).not.toContain("·");
  });

  it("Ziel, Siegel-Hinweis und Kommentar bleiben im Text", () => {
    const { body } = buildInspectionPush({
      ...base, targetLabel: "Käfig", sealRequired: true, kommentar: "Bitte zügig",
    });
    expect(body.startsWith("Käfig · ")).toBe(true);
    expect(body).toContain(t("inspectionPushSeal"));
    expect(body.endsWith("Bitte zügig")).toBe(true);
  });
});

describe("buildInspectionCodePush — die Wiederholung trägt Code und Uhrzeit", () => {
  const at = new Date("2026-08-17T12:32:00Z"); // 14:32 in Europe/Zurich

  it("stellt den blossen Code in den Titel, ohne Beiwerk", () => {
    const { title } = buildInspectionCodePush({ code: "70499", targetLabel: null, tz: TZ, now: at });
    // Kein Label, kein Trennzeichen: was im Titel steht, sind die Ziffern und sonst nichts. Jedes
    // Wort davor wäre im Foto eine Zeichenkette mehr, durch die die Erkennung suchen muss.
    expect(title).toBe("70499");
  });

  /** Der Grund, warum der Text überhaupt gefüllt ist — siehe `buildInspectionCodePush`: ein leerer
   *  Text erschien auf der Uhr als zweite Kopie des Titels. */
  it("nennt die Uhrzeit des Versands im Text", () => {
    const { body } = buildInspectionCodePush({ code: "70499", targetLabel: null, tz: TZ, now: at });
    expect(body).toBe("14:32");
  });

  /** Die Uhr am Handgelenk des Subs zeigt SEINE Zeit — die Meldung daneben muss dieselbe zeigen. */
  it("rechnet die Uhrzeit in die Zeitzone des Subs", () => {
    const { body } = buildInspectionCodePush({ code: "70499", targetLabel: null, tz: "America/New_York", now: at });
    expect(body).toBe("08:32");
  });

  /** Sekunden werden abgeschnitten — der Test oben belegt die Form nur für eine volle Minute. */
  it("bleibt 24-stündig und ohne Sekunden", () => {
    const { body } = buildInspectionCodePush({ code: "70499", targetLabel: null, tz: TZ, now: new Date("2026-08-17T16:05:07Z") });
    expect(body).toBe("18:05");
  });

  it("nennt das Ziel im TEXT vor der Uhrzeit, wenn der Aufrufer mehrere offene Kontrollen sieht", () => {
    const { title, body } = buildInspectionCodePush({ code: "70499", targetLabel: "Plug", tz: TZ, now: at });
    expect(title).toBe("70499");
    expect(body).toBe("Plug · 14:32");
  });
});

/**
 * Der Weg der SELBSTKONTROLLE: ihr Code steht in keiner Zeile, also kommt er vom Aufrufer.
 *
 * Was ihn eng hält, ist nicht die Herkunft des Codes, sondern die Richtung (die Meldung geht an den
 * Absender selbst) und die FORM. Die Form ist das einzige, was dieser Dienst prüfen kann — und sie
 * ist der Unterschied zwischen „schick mir meinen Code" und einer allgemeinen Route, deren Titel
 * jemand mit Freitext füllt.
 */
describe("resendOwnInspectionCode — der selbst gewählte Code", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pushTargetMock.mockResolvedValue(true);
  });

  /** Ohne Ziel-Untertitel: eine Selbstkontrolle steht für sich. Im Text steht nur die Uhrzeit — sie
   *  belegt im Foto, wann es entstanden ist, und ist als „HH:MM" nie mit dem Code zu verwechseln. */
  it("schickt Code und Uhrzeit als Meldung an den Absender selbst", async () => {
    const res = await resendOwnInspectionCode("u1", "70499", TZ);
    expect(res.ok).toBe(true);
    expect(firePushMock).toHaveBeenCalledWith("u1", "70499", expect.stringMatching(/^\d{2}:\d{2}$/), expect.any(String));
  });

  /**
   * Das ZIEL gehört in den Link, auch wenn es nicht in den Text gehört.
   *
   * Ohne es führt das Antippen der Meldung auf das KG-Formular, und der Sub reicht dort ein Foto
   * ein, das seine Trage-Kontrolle gar nicht beantwortet — dieselbe Falle, die `inspectionHref`
   * beschreibt. Bei einer ANGEFORDERTEN Kontrolle steht das Ziel an der Zeile; hier gibt es keine,
   * also muss es mitkommen.
   */
  it("der Link trägt das Ziel der Trage-Kontrolle", async () => {
    await resendOwnInspectionCode("u1", "70499", TZ, "cat-plug");
    expect(firePushMock.mock.calls[0][3]).toContain("cat=cat-plug");
  });

  it("ohne Ziel bleibt es beim KG — kein Parameter", async () => {
    await resendOwnInspectionCode("u1", "70499", TZ);
    expect(firePushMock.mock.calls[0][3]).not.toContain("cat=");
  });

  it.each([
    ["leer", ""],
    ["zu kurz", "704"],
    ["zu lang", "704991234"],
    ["keine Ziffern", "abcde"],
    ["Ziffern mit Beiwerk", "Code 70499"],
  ])("weist einen unbrauchbaren Code ab (%s)", async (_name, code) => {
    const res = await resendOwnInspectionCode("u1", code, TZ);
    expect(res).toMatchObject({ ok: false, status: 400, error: "INSPECTION_CODE_INVALID" });
    expect(firePushMock).not.toHaveBeenCalled();
  });

  /** Ohne angemeldetes Gerät ginge die Meldung ins Leere, und der Knopf meldete trotzdem Erfolg —
   *  der Sub soll erfahren, dass er Push erst einschalten muss. */
  it("ohne angemeldetes Gerät meldet sie das, statt still nichts zu senden", async () => {
    pushTargetMock.mockResolvedValue(false);
    const res = await resendOwnInspectionCode("u1", "70499", TZ);
    expect(res).toMatchObject({ ok: false, error: "PUSH_NOT_ENABLED" });
    expect(firePushMock).not.toHaveBeenCalled();
  });
});

/**
 * Die Regression vom 07.08.2026: eine freiwillige Selbstkontrolle (PRUEFUNG ohne Anforderung) war
 * nicht zu bestätigen. Der Weg über die Anforderung setzt eine `kontrolleId` voraus, die es dort
 * nicht gibt — der Klick lief still ins Leere. Deshalb die Adressierung über den EINTRAG.
 */
describe("resolveInspectionEntry — Urteil über den Eintrag statt über die Anforderung", () => {
  it("bestätigt eine Selbstkontrolle (ohne Anforderung) und meldet es dem Sub", async () => {
    entryFindMock.mockResolvedValue({ userId: "u1", type: "PRUEFUNG" });
    findFirstMock.mockResolvedValue(null);

    const result = await resolveInspectionEntry("e1", "manuallyVerify", "kh");

    // Gleiche Rückgabeform wie `resolveKontrolle` — dieselbe Operation, nur anders adressiert.
    expect(result).toEqual({ ok: true, data: { userId: "u1", notified: true } });
    expect(entryUpdateMock).toHaveBeenCalledWith({ where: { id: "e1" }, data: { verifikationStatus: "manual" } });
    expect(notifyMock).toHaveBeenCalledTimes(1);
    const [userId, content] = notifyMock.mock.calls[0];
    expect(userId).toBe("u1");
    expect(content.subjectKey).toBe("inspectionConfirmedSubject");
    // Ohne Anforderung gibt es kein Bezugsobjekt — die Nachricht darf auf nichts zeigen.
    expect(content.inbox).toEqual({ ref: undefined, actor: "kh" });
  });

  it("Ablehnen setzt 'rejected' und meldet den passenden Text", async () => {
    entryFindMock.mockResolvedValue({ userId: "u1", type: "PRUEFUNG" });
    findFirstMock.mockResolvedValue(null);

    await resolveInspectionEntry("e1", "reject", "kh");

    expect(entryUpdateMock).toHaveBeenCalledWith({ where: { id: "e1" }, data: { verifikationStatus: "rejected" } });
    expect(notifyMock.mock.calls[0][1].subjectKey).toBe("inspectionRejectedSubject");
  });

  it("gibt es doch eine Anforderung, trägt die Meldung deren Bezug — die Adressierung darf nichts ändern", async () => {
    entryFindMock.mockResolvedValue({ userId: "u1", type: "PRUEFUNG" });
    findFirstMock.mockResolvedValue({ id: "ka1" });

    await resolveInspectionEntry("e1", "manuallyVerify", "kh");

    expect(notifyMock.mock.calls[0][1].inbox).toEqual({
      ref: { type: "control", id: "ka1" }, actor: "kh",
    });
  });

  it("beurteilt nur Kontrollen: ein Verschluss-Eintrag wird nicht angefasst", async () => {
    entryFindMock.mockResolvedValue({ userId: "u1", type: "VERSCHLUSS" });

    const result = await resolveInspectionEntry("e1", "manuallyVerify", "kh");

    expect(result).toEqual({ ok: false, status: 404, error: "INSPECTION_NOT_FOUND" });
    expect(entryUpdateMock).not.toHaveBeenCalled();
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it("unbekannter Eintrag → 404, ohne Schreibversuch", async () => {
    entryFindMock.mockResolvedValue(null);

    const result = await resolveInspectionEntry("weg", "manuallyVerify", "kh");

    expect(result).toEqual({ ok: false, status: 404, error: "INSPECTION_NOT_FOUND" });
    expect(entryUpdateMock).not.toHaveBeenCalled();
  });

  it("'withdraw' gehört an die Anforderung — am Eintrag abgelehnt, bevor irgendetwas geladen wird", async () => {
    const result = await resolveInspectionEntry("e1", "withdraw", "kh");

    expect(result).toEqual({ ok: false, status: 400, error: "UNKNOWN_ACTION" });
    expect(entryFindMock).not.toHaveBeenCalled();
    expect(entryUpdateMock).not.toHaveBeenCalled();
  });
});
