import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Das Verwerfen eines Vergehens meldet es dem Träger — auf BEIDEN Wegen, nur dann, wenn er die
 * Feststellung je erfahren hat, und IMMER unter dem Namen dessen, der gerade verworfen hat.
 *
 * WARUM DIESE DATEI. Über ein Vergehen zu urteilen GAB es zweimal: `judgeOffense` (MCP) und die
 * hand-gebaute Route `POST /api/admin/strafe` (Strafbuch im Browser). Sie waren auseinandergelaufen:
 * wer im Browser verwarf, schickte dem Träger NICHTS, während der MCP-Weg seine Zeile schrieb. Seine
 * Feststellungs-Meldung („ob und wie es beurteilt wird, entscheidet der Keyholder") blieb damit für
 * immer unbeantwortet. Die Route geht inzwischen selbst durch `judgeOffense` — was ein Test allein
 * nicht festhält: dass sie es auch morgen noch tut. Genau das ist hier gepinnt, indem beide Wege
 * durch dieselben Erwartungen laufen. (Der VOLLE Abgleich beider Eingänge — Urteils-Zeile, Rückzug
 * der Strafaufgabe, Mail und Push — steht in `judgeOffenseParity.test.ts`; hier geht es um die
 * Auflösungs-Zeile über mehrere Urteile hinweg.)
 *
 * Die Absender-Frage des MCP-Wegs steht bereits in `messageActor.test.ts` („Verwerfen nennt den, der
 * verwirft") und wird hier nicht wiederholt; dort ist allerdings `offenseWasAnnounced` pauschal auf
 * „ja" gemockt. Die SCHRANKE selbst läuft deshalb hier echt — gegen die Nachrichten-Tabelle.
 */

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

/**
 * Der Posteingang als STAND, nicht als Aufrufprotokoll (Doppelgänger siehe `messageTableMock`).
 *
 * Diese Datei prüft einen Ablauf über mehrere Urteile hinweg (verwerfen → wieder eröffnen → erneut
 * verwerfen), und die Zusagen dabei sind Aussagen über den Bestand: welche Zeile steht am Ende da,
 * von wem, und ist sie dieselbe wie vorher. Ein Mock, der nur die Aufrufe mitschreibt, kann das
 * nicht beantworten — er sähe die Einmal-Zusage (`once`) nie greifen, und genau an ihr hing der
 * Fehler.
 */
const inbox = vi.hoisted(() => [] as import("@/test/messageTableMock").MessageRow[]);

vi.mock("@/lib/prisma", async () => {
  const { createMessageTablePrisma } = await import("@/test/messageTableMock");
  return { prisma: createMessageTablePrisma(inbox) };
});

// Der Guard der Route entscheidet über die Rolle aus der Sitzung; die Zuordnungs-Abfrage wird für
// den globalen Admin gar nicht erst erreicht. Sie steht trotzdem im Mock, weil `authGuards` sie
// importiert.
vi.mock("@/lib/keyholder", () => ({
  isKeyholderOf: vi.fn(async () => false),
  getControllableSubsCached: vi.fn(async () => []),
  getControllersOfUser: vi.fn(async () => []),
  getControllerAudience: vi.fn(async () => ({ controllers: [], username: "sub" })),
}));

// Die Blätter von `notifyUser` — sonst liefe der Test in echte SMTP- und VAPID-Aufrufe. Geteilt mit
// `judgeOffenseParity.test.ts`: die Mail-Fabrik ist eine Export-Whitelist und gehört nicht zweimal
// gepflegt (siehe `notifyLeafMocks`).
vi.mock("@/lib/mail", async () => (await import("@/test/notifyLeafMocks")).mailLeaf());
vi.mock("@/lib/push", async () => (await import("@/test/notifyLeafMocks")).pushLeaf());
vi.mock("@/lib/emailI18n", async () => (await import("@/test/notifyLeafMocks")).emailI18nLeaf());
vi.mock("next-intl/server", async () => (await import("@/test/notifyLeafMocks")).intlServerLeaf());

vi.mock("@/lib/strafbuch", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/strafbuch")>()),
  buildStrafbuch: vi.fn(),
}));

import { POST, DELETE } from "@/app/api/admin/strafe/route";
import { judgeOffense } from "./strafurteilService";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildStrafbuch } from "@/lib/strafbuch";
import { AI_AUTHOR } from "@/lib/constants";
import { emptyOffenseLists } from "@/test/strafbuchFixture";
import { offenseAnnouncement } from "@/test/messageTableMock";

const mock = (fn: unknown) => fn as unknown as ReturnType<typeof vi.fn>;

/** Der Träger, das Vergehen (eine versäumte Aufgabe) und die Menschen, die im Browser urteilen. */
const USER_ID = "u1";
const REF = "t-1";
const HERRIN = "herrin";
/** Die ZWEITE Person am selben Vergehen — der ganze Grund, warum der Absender nachziehen muss. */
const ZWEITE = "zweite";

/** Der Body, den das Strafbuch beim Klick auf „Verwerfen" schickt. */
const dismissViaRoute = () =>
  POST({
    json: async () => ({ userId: USER_ID, offenseType: "AUFGABE", refId: REF, status: "DISMISSED" }),
  } as unknown as Request);

const dismissViaService = (actor: string = HERRIN) =>
  judgeOffense({ userId: USER_ID, refId: REF, action: "dismiss" }, actor);

/** Beide Umsetzungen desselben Vorgangs — jede Zusage unten gilt für BEIDE. */
const PATHS: [name: string, dismiss: () => Promise<unknown>][] = [
  ["die Strafbuch-Route (Browser)", dismissViaRoute],
  ["judgeOffense (MCP)", dismissViaService],
];

/** Hier zählt nur, DASS ein Urteil geschrieben wurde: eine ausgebliebene Meldung soll nicht an einem
 *  vorher abgebrochenen Aufruf liegen. Beide Schreibformen zählen — der Browser-Weg legt an
 *  (`create`, damit die Eindeutigkeit von `refId` über den Konflikt entscheidet), der MCP-Weg
 *  ersetzt (`upsert`). */
const judgmentWrites = () =>
  mock(prisma.strafeRecord.create).mock.calls.length + mock(prisma.strafeRecord.upsert).mock.calls.length;

/** Die „fallengelassen"-Zeilen, die gerade im Posteingang des Trägers stehen. */
const dismissals = () => inbox.filter((r) => r.bodyKey === "offenseDismissedMessage");

/** Die Feststellung hat den Träger erreicht: zu dieser refId steht eine Nachricht in seinem
 *  Posteingang — genau das liest `offenseWasAnnounced`. */
const announce = () => inbox.push(offenseAnnouncement(USER_ID, REF));

beforeEach(() => {
  vi.clearAllMocks();
  inbox.length = 0;
  mock(auth).mockResolvedValue({ user: { id: "kh1", role: "admin", name: HERRIN } });
  // Das Vergehen ist aktuell erkannt — sonst käme keiner der beiden Wege bis zum Urteil.
  mock(buildStrafbuch).mockResolvedValue({
    ...emptyOffenseLists(),
    unfulfilledTasks: [{ id: REF, holdUntil: new Date("2026-08-01T10:00:00Z"), failedAt: null }],
  });
  mock(prisma.strafeRecord.create).mockResolvedValue({ id: "sr1" });
  mock(prisma.strafeRecord.upsert).mockResolvedValue({ id: "sr1" });
  mock(prisma.strafeRecord.deleteMany).mockResolvedValue({ count: 1 });
  announce();
});

describe("Verwerfen eines Vergehens: der Träger erfährt es", () => {
  // Dass die Strafbuch-Route ihre Auflösung überhaupt schreibt — mit Namen, ohne Mail und ohne Push
  // — steht im vollen Abgleich beider Eingänge (`judgeOffenseParity.test.ts`) und nicht hier: was
  // dort für BEIDE Wege gilt, ein zweites Mal für einen zu behaupten, verdoppelt nur die Pflege.
  // Hier bleibt, was diese Datei allein trägt: die Schranke, die Einmal-Zusage und der Ablauf über
  // mehrere Urteile hinweg.

  it.each(PATHS)("%s schweigt, wenn die Feststellung den Träger nie erreicht hat", async (_name, dismiss) => {
    // Vor dem Melde-Stichtag abgeleitete Vergehen werden nie gemeldet. Eine Auflösung wäre dort das
    // Ende einer Geschichte, die der Posteingang nie erzählt hat.
    inbox.length = 0;

    await dismiss();

    expect(dismissals()).toEqual([]);
    // Das URTEIL fällt trotzdem — sonst prüfte der Test oben nur, dass der Aufruf vorher abbrach.
    expect(judgmentWrites()).toBe(1);
  });

  it("ein zweiter Anlauf desselben Verwerfens hinterlässt keine zweite Zeile", async () => {
    // Die Einmal-Zusage (`once`): ein Wiederholungsversuch nach einem Absturz darf im Posteingang
    // nichts Dauerhaftes verdoppeln.
    await dismissViaService();
    await dismissViaService();

    expect(dismissals()).toHaveLength(1);
  });

  /**
   * DER FALL, für den die Auflösung beim Wieder-Eröffnen gelöscht wird, statt bloss zu verblassen.
   *
   * Die KI verwirft, die Keyholderin nimmt das Urteil zurück und verwirft selbst. Ohne das Löschen
   * stünde die ERSTE Zeile weiter da: die Einmal-Zusage unterdrückte die neue, der Träger läse
   * dauerhaft die KI als Absenderin — mit deren Zeitpunkt und deren Gelesen-Stand, also ohne jedes
   * Zeichen für die zweite Entscheidung.
   */
  it("nach Rücknahme und erneutem Verwerfen steht der ZWEITE Urteilende da — und die Zeile ist wieder ungelesen", async () => {
    // 1. Die KI verwirft.
    await dismissViaService(AI_AUTHOR);
    const [erste] = dismissals();
    expect(erste).toMatchObject({ senderKind: "ai", senderName: null });

    // Der Träger liest sie — der Gelesen-Stand hängt an DIESER id (`MessageRead.messageId`).
    const gelesen = new Set([erste.id]);

    // 2. Die Keyholderin nimmt das Urteil zurück („Rückgängig" am Urteil) …
    mock(auth).mockResolvedValue({ user: { id: "kh1", role: "admin", name: ZWEITE } });
    mock(prisma.strafeRecord.findUnique).mockResolvedValue({ userId: USER_ID, refId: REF });
    const reopened = await DELETE({ json: async () => ({ refId: REF }) } as unknown as Request);

    expect(reopened.status).toBe(200);
    // Die überholte Aussage verschwindet mit dem Urteil, das sie behauptet hat …
    expect(dismissals()).toEqual([]);
    // … die FESTSTELLUNG bleibt: sie ist der Beleg und bleibt wahr, egal was aus dem Vergehen wird.
    expect(inbox.map((r) => r.bodyKey)).toEqual(["offenseDetectedMessage"]);

    // 3. … und verwirft selbst.
    await dismissViaRoute();

    const [zweite] = dismissals();
    expect(dismissals()).toHaveLength(1);
    expect(zweite).toMatchObject({ senderKind: "keyholder", senderName: ZWEITE });
    // Eine FRISCHE Zeile: an ihrer id hängt kein Gelesen-Stand, der Träger sieht also einen
    // ungelesenen Hinweis. Genau der fehlte, solange die alte Zeile stehen blieb.
    expect(gelesen.has(zweite.id)).toBe(false);
  });
});
