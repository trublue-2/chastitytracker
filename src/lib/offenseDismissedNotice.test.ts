import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Das Verwerfen eines Vergehens meldet es dem Träger — auf BEIDEN Wegen, nur dann, wenn er die
 * Feststellung je erfahren hat, und IMMER unter dem Namen dessen, der gerade verworfen hat.
 *
 * WARUM DIESE DATEI. Über ein Vergehen zu urteilen gibt es zweimal: `judgeOffense` (MCP) und die
 * hand-gebaute Route `POST /api/admin/strafe` (Strafbuch im Browser). Sie waren auseinandergelaufen:
 * wer im Browser verwarf, schickte dem Träger NICHTS, während der MCP-Weg seine Zeile schrieb. Seine
 * Feststellungs-Meldung („ob und wie es beurteilt wird, entscheidet der Keyholder") blieb damit für
 * immer unbeantwortet. Die Meldung liegt seither in EINER Funktion (`notifyJudgment`) — was ein Test
 * allein aber nicht festhält: dass auch die zweite Umsetzung sie WIRKLICH ruft. Genau das ist hier
 * gepinnt, indem beide Wege durch dieselben Erwartungen laufen.
 *
 * Die Absender-Frage des MCP-Wegs steht bereits in `messageActor.test.ts` („Verwerfen nennt den, der
 * verwirft") und wird hier nicht wiederholt; dort ist allerdings `offenseWasAnnounced` pauschal auf
 * „ja" gemockt. Die SCHRANKE selbst läuft deshalb hier echt — gegen die Nachrichten-Tabelle.
 */

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

/** Eine Zeile in `Message`, auf die Spalten reduziert, um die es hier geht. */
type MessageRow = {
  id: string;
  subjectUserId: string;
  audience: string;
  bodyKey: string | null;
  senderKind: string;
  senderName: string | null;
  refEntityType: string | null;
  refEntityId: string | null;
};

/**
 * Der Posteingang als STAND, nicht als Aufrufprotokoll.
 *
 * Diese Datei prüft einen Ablauf über mehrere Urteile hinweg (verwerfen → wieder eröffnen → erneut
 * verwerfen), und die Zusagen dabei sind Aussagen über den Bestand: welche Zeile steht am Ende da,
 * von wem, und ist sie dieselbe wie vorher. Ein Mock, der nur die Aufrufe mitschreibt, kann das
 * nicht beantworten — er sähe die Einmal-Zusage (`once`) nie greifen, und genau an ihr hing der
 * Fehler.
 */
const inbox = vi.hoisted(() => [] as MessageRow[]);

vi.mock("@/lib/prisma", async () => {
  const { createPrismaMock } = await import("@/test/prismaMock");
  const models = createPrismaMock();

  /** Die Where-Formen dieser Datei: Gleichheit je Spalte, dazu `{ in: [...] }`. */
  const matches = (row: MessageRow, where: Record<string, unknown> = {}) =>
    Object.entries(where).every(([col, cond]) => {
      const value = row[col as keyof MessageRow];
      return cond && typeof cond === "object" && "in" in cond
        ? (cond as { in: unknown[] }).in.includes(value)
        : value === cond;
    });

  // Aus einem Zähler, der nur steigt — nie aus der aktuellen Zeilenzahl: eine gelöschte Zeile gäbe
  // ihre id sonst an die nächste weiter. Daran hängt der Gelesen-Stand (`MessageRead.messageId`,
  // Cascade), und eine wiederverwendete id wäre genau die Verwechslung, die dieser Test ausschliesst.
  let seq = 0;
  models.message.create.mockImplementation(async ({ data }: { data: Omit<MessageRow, "id"> }) => {
    const row = { id: `m${++seq}`, ...data };
    inbox.push(row);
    return row;
  });
  models.message.findFirst.mockImplementation(async ({ where }: { where: Record<string, unknown> }) =>
    inbox.find((r) => matches(r, where)) ?? null);
  models.message.findMany.mockImplementation(async ({ where }: { where: Record<string, unknown> }) =>
    inbox.filter((r) => matches(r, where)));
  models.message.deleteMany.mockImplementation(async ({ where }: { where: Record<string, unknown> }) => {
    const keep = inbox.filter((r) => !matches(r, where));
    const count = inbox.length - keep.length;
    inbox.splice(0, inbox.length, ...keep);
    return { count };
  });

  // `createPrismaMock` deckt bewusst nur Modell-Pfade ab und wirft bei `$transaction` (siehe dort);
  // `judgeOffense` schreibt sein Urteil aber in einer Transaktion. Sie läuft hier gegen denselben
  // Doppelgänger — geprüft wird die Meldung, nicht die Isolation. Als Proxy und nicht als Kopie der
  // Modelle: nur so ist `prisma.strafeRecord.upsert` im Test dieselbe Funktion wie im Produktivcode.
  const prisma: unknown = new Proxy(models, {
    get: (target, prop) =>
      prop === "$transaction"
        ? (fn: (tx: unknown) => unknown) => fn(prisma)
        : Reflect.get(target, prop),
  });
  return { prisma };
});

// Der Guard der Route entscheidet über die Rolle aus der Sitzung; die Zuordnungs-Abfrage wird für
// den globalen Admin gar nicht erst erreicht. Sie steht trotzdem im Mock, weil `authGuards` sie
// importiert.
vi.mock("@/lib/keyholder", () => ({
  isKeyholderOf: vi.fn(async () => false),
  getControllableSubsCached: vi.fn(async () => []),
  getControllersOfUser: vi.fn(async () => []),
}));

// Die Blätter von `notifyUser`: das Verwerfen darf sie nicht anfassen (nur Posteingang, keine Mail,
// kein Push) — als Mock lässt sich genau das prüfen.
vi.mock("@/lib/mail", () => ({
  sendMailSafe: vi.fn(), escHtml: (s: string) => s, appBaseUrl: () => "https://x",
  noticeBoxHtml: () => "", dashboardEmailHtml: () => "",
}));
vi.mock("@/lib/push", () => ({ firePush: vi.fn() }));
vi.mock("@/lib/emailI18n", () => ({ emailT: vi.fn(async () => (k: string) => k), emailGreeting: () => "" }));
vi.mock("next-intl/server", () => ({ getTranslations: vi.fn(async () => (k: string) => k) }));

vi.mock("@/lib/strafbuch", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/strafbuch")>()),
  buildStrafbuch: vi.fn(),
}));

import { POST, DELETE } from "@/app/api/admin/strafe/route";
import { judgeOffense } from "./strafurteilService";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildStrafbuch } from "@/lib/strafbuch";
import { sendMailSafe } from "@/lib/mail";
import { firePush } from "@/lib/push";
import { AI_AUTHOR } from "@/lib/constants";
import { emptyOffenseLists } from "@/test/strafbuchFixture";

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

/** Die Route schreibt ihr Urteil mit `create`, der Service mit `upsert` — hier zählt nur, DASS es
 *  geschrieben wurde: eine ausgebliebene Meldung soll nicht an einem vorher abgebrochenen Aufruf
 *  liegen. */
const judgmentWrites = () =>
  mock(prisma.strafeRecord.create).mock.calls.length + mock(prisma.strafeRecord.upsert).mock.calls.length;

/** Die „fallengelassen"-Zeilen, die gerade im Posteingang des Trägers stehen. */
const dismissals = () => inbox.filter((r) => r.bodyKey === "offenseDismissedMessage");

/** Die Feststellung hat den Träger erreicht: zu dieser refId steht eine Nachricht in seinem
 *  Posteingang — genau das liest `offenseWasAnnounced`. */
const announce = () =>
  inbox.push({
    id: "announce", subjectUserId: USER_ID, audience: "sub",
    bodyKey: "offenseDetectedMessage", senderKind: "system", senderName: null,
    refEntityType: "detectedOffense", refEntityId: REF,
  });

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
  it("die Strafbuch-Route schreibt die Auflösung — mit dem Namen dessen, der verwirft", async () => {
    // DIE Regression: dieser Weg schickte dem Träger nichts, während der MCP-Weg meldete.
    const res = await dismissViaRoute();

    expect(res.status).toBe(201);
    expect(dismissals()).toMatchObject([{
      subjectUserId: USER_ID,
      audience: "sub",
      // Auf das VERGEHEN, nicht auf das Urteil — dieselbe Referenz wie die Feststellungs-Meldung.
      refEntityType: "detectedOffense",
      refEntityId: REF,
      senderKind: "keyholder",
      senderName: HERRIN,
    }]);
  });

  it("nimmt eine Last weg, statt eine aufzuerlegen — keine Mail, kein Push", async () => {
    await dismissViaRoute();

    expect(mock(sendMailSafe)).not.toHaveBeenCalled();
    expect(mock(firePush)).not.toHaveBeenCalled();
  });

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
