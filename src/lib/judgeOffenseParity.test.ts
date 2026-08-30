import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Über ein Vergehen zu urteilen gibt es nur noch EINMAL — und dieser Test hält fest, dass der
 * Browser-Knopf und der MCP wirklich durch dieselbe Umsetzung gehen.
 *
 * WARUM DIESE DATEI. `POST /api/admin/strafe` schrieb seinen `StrafeRecord` früher selbst. Was dabei
 * herauskam, sah aus wie dasselbe und war es nicht: das Verwerfen im Browser schickte dem Träger
 * keine Zeile (behoben, gepinnt in `offenseDismissedNotice.test.ts`), und ein Urteil zog die daran
 * hängende Strafaufgabe nicht zurück. Beides waren keine Entscheidungen, sondern Auslassungen —
 * unsichtbar, solange niemand beide Wege nebeneinander legt. Genau das tut dieser Test: er lässt
 * denselben Vorgang zweimal laufen und vergleicht, was zurückbleibt — die geschriebene Urteils-Zeile,
 * der Rückzug der Strafaufgabe, der Posteingang des Trägers, Mail und Push.
 *
 * Ein Vergleich allein liesse sich mit „beide tun nichts" erfüllen; deshalb steht neben jeder
 * Gleichheit auch, WAS dastehen muss.
 *
 * Dazu die beiden Regeln, in denen die Wege sich UNTERSCHEIDEN sollen — der Browser urteilt einmal,
 * der Agent darf revidieren — und die Auflösung einer geteilten Referenz. Zu Letzterer: `refId` ist
 * in `StrafeRecord` global eindeutig, es kann also auch bei zwei erkannten Arten nur EIN Urteil je
 * ref geben. Die Angabe der Art kauft kein zweites Urteil, sondern die richtige BESCHRIFTUNG des
 * einen möglichen.
 */

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

/** Der Posteingang als STAND — die Zusage ist „am Ende steht dieselbe Zeile da", nicht „es wurde
 *  gleich oft geschrieben". Warum als Tabelle statt als Aufrufprotokoll: siehe `messageTableMock`. */
const inbox = vi.hoisted(() => [] as import("@/test/messageTableMock").MessageRow[]);

vi.mock("@/lib/prisma", async () => {
  const { createMessageTablePrisma } = await import("@/test/messageTableMock");
  return { prisma: createMessageTablePrisma(inbox) };
});

vi.mock("@/lib/keyholder", () => ({
  isKeyholderOf: vi.fn(async () => false),
  getControllableSubsCached: vi.fn(async () => []),
  getControllersOfUser: vi.fn(async () => []),
  getControllerAudience: vi.fn(async () => ({ controllers: [], username: "sub" })),
}));

// Die Blätter der Benachrichtigung: als Mock lässt sich vergleichen, ob BEIDE Wege dasselbe
// verschicken — die Verwerfung nichts, die Strafe je eine Mail und einen Push. Geteilt mit
// `offenseDismissedNotice.test.ts`, siehe `notifyLeafMocks`.
vi.mock("@/lib/mail", async () => (await import("@/test/notifyLeafMocks")).mailLeaf());
vi.mock("@/lib/push", async () => (await import("@/test/notifyLeafMocks")).pushLeaf());
vi.mock("@/lib/emailI18n", async () => (await import("@/test/notifyLeafMocks")).emailI18nLeaf());
vi.mock("next-intl/server", async () => (await import("@/test/notifyLeafMocks")).intlServerLeaf());

vi.mock("@/lib/strafbuch", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/strafbuch")>()),
  buildStrafbuch: vi.fn(),
}));

import { POST, PATCH } from "@/app/api/admin/strafe/route";
import { judgeOffense } from "./strafurteilService";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildStrafbuch } from "@/lib/strafbuch";
import { sendMailSafe } from "@/lib/mail";
import { firePush } from "@/lib/push";
import { emptyOffenseLists } from "@/test/strafbuchFixture";
import { offenseAnnouncement } from "@/test/messageTableMock";

const mock = (fn: unknown) => fn as unknown as ReturnType<typeof vi.fn>;

const USER_ID = "u1";
/** Das Vergehen: eine versäumte Aufgabe. */
const REF = "t-1";
const TYPE = "AUFGABE";
const HERRIN = "herrin";
const PENALTY = "20 Schläge";
/** Eingefroren, damit der Urteilszeitpunkt beider Läufe VERGLEICHBAR ist statt bloss „irgendein
 *  Datum" — genau er steht als `bestraftDatum` in der Zeile. */
const NOW = new Date("2026-08-12T09:00:00Z");

/** Eine Anfrage an die Strafbuch-Route, mit dem Body, den das Formular schickt. */
const post = (body: Record<string, unknown>) =>
  POST({ json: async () => ({ userId: USER_ID, offenseType: TYPE, refId: REF, ...body }) } as unknown as Request);

const patch = (body: Record<string, unknown>) =>
  PATCH({ json: async () => ({ refId: REF, ...body }) } as unknown as Request);

/**
 * Derselbe Vorgang, einmal je Eingang. Als benannte Konstanten und nicht als Tabelle mit
 * Positions-Zugriff (`PATHS.dismiss[0][1]`): schlägt eine Zusage fehl, muss aus der Zeile hervorgehen,
 * WELCHER der beiden Wege abgewichen ist — eine Ziffer beantwortet das nicht.
 *
 * Der Handelnde ist beidesmal dieselbe Person, sonst verglichen die Zusagen unten Absender statt
 * Umsetzungen.
 */
const dismissViaRoute = () => post({ status: "DISMISSED" });
const dismissViaMcp = () => judgeOffense({ userId: USER_ID, refId: REF, action: "dismiss" }, HERRIN);
const punishViaRoute = () => post({ status: "PUNISHED", reason: PENALTY });
const punishViaMcp = () => judgeOffense({ userId: USER_ID, refId: REF, action: "punish", text: PENALTY }, HERRIN);

/** Die Feststellung hat den Träger erreicht — nur dann meldet ihm eine Verwerfung ihr Ende. */
const announce = () => inbox.push(offenseAnnouncement(USER_ID, REF));

/** Was ein Lauf hinterlassen hat. Die Nachrichten-ids fallen weg: sie zählen fortlaufend über beide
 *  Läufe und wären der einzige Unterschied zwischen zwei identischen Posteingängen.
 *
 *  `judgments` sammelt BEIDE Schreibformen: der Browser-Weg legt an (`create`, damit die
 *  Eindeutigkeit von `refId` über den Konflikt entscheidet), der MCP-Weg ersetzt (`upsert`). Was
 *  verglichen wird, ist die geschriebene ZEILE — die Form ist genau der erlaubte Unterschied. */
async function capture(run: () => Promise<unknown>) {
  vi.clearAllMocks();
  inbox.length = 0;
  announce();

  const res = await run();

  return {
    status: res instanceof Response ? res.status : null,
    judgments: [
      ...mock(prisma.strafeRecord.create).mock.calls.map(([arg]) => arg.data),
      ...mock(prisma.strafeRecord.upsert).mock.calls.map(([arg]) => arg.create),
    ],
    withdrawnTasks: mock(prisma.task.updateMany).mock.calls.map(([arg]) => arg),
    inbox: inbox.map(({ id: _id, ...row }) => row),
    mails: mock(sendMailSafe).mock.calls,
    pushes: mock(firePush).mock.calls,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.clearAllMocks();
  inbox.length = 0;
  mock(auth).mockResolvedValue({ user: { id: "kh1", role: "admin", name: HERRIN } });
  mock(buildStrafbuch).mockResolvedValue({
    ...emptyOffenseLists(),
    unfulfilledTasks: [{ id: REF, holdUntil: new Date("2026-08-01T10:00:00Z"), failedAt: null }],
  });
  mock(prisma.strafeRecord.create).mockResolvedValue({ id: "sr1" });
  mock(prisma.strafeRecord.upsert).mockResolvedValue({ id: "sr1" });
  mock(prisma.user.findUnique).mockResolvedValue({ email: "sub@example.invalid", username: "sub", locale: "de" });
  announce();
});

afterEach(() => {
  vi.useRealTimers();
});

/** Die eine Urteils-ZEILE, wie sie nach `action` aussehen muss — inklusive der Felder, die ein
 *  Freitext-Urteil ausdrücklich LÖSCHT (`taskId`, `erledigtAt`).
 *
 *  `judgedBy` bleibt das Kürzel, `judgedByName` trägt den Namen: beide Eingänge werden hier von
 *  DERSELBEN Person bedient, also muss auch der Name auf beiden Wegen gleich herauskommen. Genau
 *  das ist die Zusage dieses Tests — die KI-Variante ist ein anderer Handelnder, kein anderer Weg. */
const judgmentRow = (status: "PUNISHED" | "DISMISSED", reason: string | null) => ({
  userId: USER_ID, offenseType: TYPE, refId: REF,
  status, reason, judgedBy: "admin", judgedByName: HERRIN,
  erledigtAt: null, bestraftDatum: NOW, taskId: null,
});

/** Der Rückzug der Strafaufgabe, die am ersetzten Urteil hängt — über die BEZIEHUNG, nicht über
 *  eine vorher gelesene id. */
const TASK_WITHDRAWAL = {
  where: { userId: USER_ID, withdrawnAt: null, strafeRecords: { some: { refId: REF } } },
  data: { withdrawnAt: NOW },
};

describe("Urteil über beide Eingänge: eine Umsetzung, ein Ergebnis", () => {
  it("verwerfen hinterlässt auf beiden Wegen dasselbe", async () => {
    const [viaRoute, viaMcp] = [await capture(dismissViaRoute), await capture(dismissViaMcp)];

    expect(viaRoute).toEqual({ ...viaMcp, status: 201 });

    // … und das ist nicht zweimal dasselbe Nichts:
    expect(viaRoute.judgments).toEqual([judgmentRow("DISMISSED", null)]);
    // Die Auflösung für den Träger — unter dem Namen dessen, der verworfen hat.
    expect(viaRoute.inbox).toContainEqual(expect.objectContaining({
      bodyKey: "offenseDismissedMessage", refEntityType: "detectedOffense", refEntityId: REF,
      senderKind: "keyholder", senderName: HERRIN,
    }));
    // Der Rückzug einer verknüpften Strafaufgabe gehört zum Urteil — er lief bisher NUR auf dem
    // MCP-Weg. Er wird immer angefordert; ob er eine Zeile trifft, entscheidet die Beziehung.
    expect(viaRoute.withdrawnTasks).toEqual([TASK_WITHDRAWAL]);
    // Verwerfen nimmt eine Last weg, statt eine aufzuerlegen: kein Wecken.
    expect(viaRoute.mails).toEqual([]);
    expect(viaRoute.pushes).toEqual([]);
  });

  it("bestrafen hinterlässt auf beiden Wegen dasselbe", async () => {
    const [viaRoute, viaMcp] = [await capture(punishViaRoute), await capture(punishViaMcp)];

    expect(viaRoute).toEqual({ ...viaMcp, status: 201 });

    expect(viaRoute.judgments).toEqual([judgmentRow("PUNISHED", PENALTY)]);
    expect(viaRoute.withdrawnTasks).toEqual([TASK_WITHDRAWAL]);
    // Die Nachricht zeigt auf das URTEIL und holt den Straftext von dort — sie trägt ihn nicht als
    // Kopie. Mail und Push gehen raus, anders als beim Verwerfen.
    expect(viaRoute.inbox).toContainEqual(expect.objectContaining({
      bodyKey: "penaltyMessageNoReason", refEntityType: "offense", refEntityId: "sr1",
      senderKind: "keyholder", senderName: HERRIN,
    }));
    expect(viaRoute.mails).toHaveLength(1);
    expect(viaRoute.pushes).toHaveLength(1);
  });
});

describe("Ein zweites Urteil über dasselbe Vergehen", () => {
  /**
   * Ein bereits bestehendes Urteil — als KONFLIKT der Datenbank, nicht als Vorab-Antwort auf eine
   * Abfrage.
   *
   * Genau darin liegt die Zusage: die Schranke darf nicht davon abhängen, dass zwischen „gibt es
   * schon ein Urteil?" und dem Schreiben niemand dazwischenkommt. Das Strafbuch lässt „Wurde
   * bestraft" und „Verwerfen" an derselben Zeile GLEICHZEITIG aufklappen — zwei Anfragen im Abstand
   * von Millisekunden sind kein Grenzfall, sondern zwei Klicks. Deshalb steht hier der P2002 auf
   * `refId`, den ein `create` gegen die Eindeutigkeit auslöst, und nicht ein „findFirst gibt eine
   * Zeile zurück".
   */
  const alreadyJudged = () => {
    mock(prisma.strafeRecord.create).mockRejectedValue(
      Object.assign(new Error("Unique constraint failed"), { code: "P2002", meta: { target: ["refId"] } }),
    );
  };

  it("wird im Browser abgelehnt, statt ein fremdes Urteil still zu ersetzen", async () => {
    // Das Strafbuch bietet Bestrafen/Verwerfen nur an einer UNbeurteilten Zeile an — eine Anfrage
    // hierher kommt also aus einer veralteten Seite (zweiter Keyholder, zweiter Tab, Doppelklick).
    // Der Weg zurück ist ausdrücklich „Rückgängig", der die Strafaufgabe mitnimmt.
    alreadyJudged();

    const res = await dismissViaRoute();

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "JUDGMENT_ALREADY_EXISTS" });
    // Nichts gemeldet: der abgelehnte Vorgang darf im Posteingang des Trägers keine Spur
    // hinterlassen. (Der Aufgaben-Rückzug in derselben Transaktion rollt mit dem `create` zurück —
    // das kann nur die Datenbank, nicht der Mock.)
    expect(inbox.map((r) => r.bodyKey)).toEqual(["offenseDetectedMessage"]);
  });

  it("meldet dem Träger bei zwei Urteilen kurz nacheinander nur EINES", async () => {
    // DER Fall, für den die Schranke atomar sein muss: „Wurde bestraft" und „Verwerfen" sind im
    // selben Tab gleichzeitig aufklappbar, beide Formulare gehen ab. Ohne den Konflikt-Fehler des
    // zweiten Schreibens läse der Träger „Strafe verhängt" UND „Vergehen fallengelassen" zu einem
    // Vergehen, während die Datenbank nur eines davon hält.
    const first = await punishViaRoute();
    expect(first.status).toBe(201);

    // Ab jetzt liegt eine Zeile auf der ref — der zweite Schreibversuch bricht daran.
    alreadyJudged();
    const second = await dismissViaRoute();

    expect(second.status).toBe(409);
    // Genau eine Auflösung, und zwar die des Urteils, das wirklich steht.
    expect(inbox.map((r) => r.bodyKey)).toEqual(["offenseDetectedMessage", "penaltyMessageNoReason"]);
  });

  it("darf über den MCP revidieren — und nimmt die Strafaufgabe des alten Urteils mit", async () => {
    // Der Agent spricht seine Absicht aus, statt ein Formular abzuschicken; für ihn ist die
    // Korrektur eines eigenen Urteils der Normalfall. Die Schranke oben ist deshalb eine Regel des
    // BROWSER-Eingangs (`allowRevision: false`) und nicht die Vorgabe des gemeinsamen Kerns.
    alreadyJudged();

    const res = await judgeOffense({ userId: USER_ID, refId: REF, action: "dismiss" }, HERRIN);

    expect(res).toEqual({ ok: true, data: { status: "dismissed", done: false } });
    // Kein `create` — der MCP-Weg ersetzt, und genau deshalb trifft ihn der Konflikt oben nicht.
    expect(mock(prisma.strafeRecord.create)).not.toHaveBeenCalled();
    expect(mock(prisma.strafeRecord.upsert).mock.calls.map(([a]) => a.create)).toEqual([judgmentRow("DISMISSED", null)]);
    expect(mock(prisma.task.updateMany).mock.calls.map(([a]) => a)).toEqual([TASK_WITHDRAWAL]);
  });
});

describe("Erledigt-Schalter der Strafe", () => {
  beforeEach(() => {
    mock(prisma.strafeRecord.update).mockResolvedValue({});
  });

  it("verschiebt den Erledigt-Zeitpunkt bei einem zweiten Klick nicht", async () => {
    // Der Zeitpunkt sagt, WANN die Strafe abgeleistet war — nicht, wann zuletzt jemand auf den Knopf
    // gedrückt hat. Die Route rechnete das früher selbst und schrieb `new Date()`; seit sie durch
    // `judgeOffense` geht, gilt die idempotente Fassung des Dienstes auch im Browser.
    const ERLEDIGT = new Date("2026-08-10T07:00:00Z");
    mock(prisma.strafeRecord.findUnique).mockResolvedValue({ userId: USER_ID, refId: REF, status: "PUNISHED", erledigtAt: ERLEDIGT });

    const res = await patch({ done: true });

    expect(res.status).toBe(200);
    expect(mock(prisma.strafeRecord.update)).toHaveBeenCalledWith({
      where: { refId: REF }, data: { erledigtAt: ERLEDIGT },
    });
  });

  it("öffnet den Loop wieder", async () => {
    mock(prisma.strafeRecord.findUnique).mockResolvedValue({ userId: USER_ID, refId: REF, status: "PUNISHED", erledigtAt: NOW });

    const res = await patch({ done: false });

    expect(res.status).toBe(200);
    expect(mock(prisma.strafeRecord.update)).toHaveBeenCalledWith({
      where: { refId: REF }, data: { erledigtAt: null },
    });
  });

  it("erledigt nichts, was gar keine Strafe ist", async () => {
    // Die Schranke steht seit der Zusammenführung nur noch im Dienst — die Route reicht sie durch.
    mock(prisma.strafeRecord.findUnique).mockResolvedValue({ userId: USER_ID, refId: REF, status: "DISMISSED", erledigtAt: null });

    const res = await patch({ done: true });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "PENALTY_NOT_PUNISHED" });
    expect(mock(prisma.strafeRecord.update)).not.toHaveBeenCalled();
  });
});

describe("Zwei Vergehen an derselben Referenz", () => {
  // Eine Reinigungsöffnung über dem Tageskontingent während einer Sperrzeit ist BEIDES: unerlaubte
  // Öffnung und Reinigungs-Limit. Beide tragen die `Entry.id`, das Strafbuch zeigt sie in zwei
  // Abschnitten — und der geklickte Abschnitt sagt, worüber geurteilt wird. Ein zweites Urteil
  // entsteht dadurch nicht: `StrafeRecord.refId` ist global eindeutig, es gibt genau eines je ref.
  const ENTRY = "e-9";
  /** Wie `post`, aber auf die geteilte ref statt auf die versäumte Aufgabe. */
  const postAt = (body: Record<string, unknown>) => post({ refId: ENTRY, ...body });

  beforeEach(() => {
    mock(buildStrafbuch).mockResolvedValue({
      ...emptyOffenseLists(),
      unauthorizedOpenings: [{ id: ENTRY, startTime: NOW }],
      cleaningLimitViolations: [{ entryId: ENTRY, startTime: NOW }],
    });
  });

  it("urteilt über die Art, die der Aufrufer nennt — nicht über die zuerst erkannte", async () => {
    const res = await postAt({ offenseType: "REINIGUNG_LIMIT", status: "DISMISSED" });

    expect(res.status).toBe(201);
    // Ohne die Angabe stünde hier OEFFNEN_ENTRY — die Art des ersten Abschnitts.
    expect(mock(prisma.strafeRecord.create).mock.calls[0][0].data).toMatchObject({ offenseType: "REINIGUNG_LIMIT" });
  });

  it("weist eine Art zurück, die es an dieser Referenz nicht gibt", async () => {
    // 400 und nicht 404: das Vergehen ist da, nur eben ein anderes. Ein 404 verkaufte dem Absender
    // ein verschwundenes Vergehen und schickte ihn auf die falsche Fehlersuche.
    const res = await postAt({ offenseType: "AUFGABE", status: "DISMISSED" });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "OFFENSE_TYPE_MISMATCH" });
    expect(mock(prisma.strafeRecord.create)).not.toHaveBeenCalled();
  });
});
