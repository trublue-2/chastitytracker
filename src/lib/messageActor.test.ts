import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Der/die HANDELNDE muss genannt werden — quer durch alle Dienste, die dem Träger etwas melden.
 *
 * Die Regel in einem Satz: eine Nachricht, die aus einem MENSCHLICHEN Knopfdruck entsteht, trägt den
 * Namen genau dieser einen Person; was die App selbst entscheidet, bleibt „System"; was über den MCP
 * kommt, bleibt die KI ohne persönlichen Namen.
 *
 * Warum EIN Test über alle Dienste statt je einer im Dienst-Test: die Regel ist quer, und ihr
 * Bruchmuster ist immer dasselbe (irgendwo bleibt eine hart gesetzte Absender-Art stehen). Nebeneinander
 * gelesen fällt eine fehlende Zeile auf; auf fünf Dateien verteilt fällt sie niemandem auf.
 *
 * Geprüft wird die WIRKUNG, nicht die Aufrufform: `notifyUser` UND die Schreibstelle
 * (`recordSystemMessage`, die die Absender-Achse aus dem Handelnden ableitet) laufen ECHT, nur ihre
 * Blätter sind ersetzt. Abgelesen wird deshalb an `prisma.message.create` — wörtlich das, was in der
 * Tabelle landet.
 */

const tx = {
  kontrollAnforderung: { create: vi.fn(), findFirst: vi.fn() },
  device: { findUnique: vi.fn() },
  task: { updateMany: vi.fn() },
  // Der Aufgaben-Rückzug liest die Urteils-Tabelle (er nimmt ein offenes Urteil mit).
  strafeRecord: { upsert: vi.fn(), findMany: vi.fn(async () => []) },
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    // Die Nachrichten-Tabelle selbst: `create` ist die Ablesestelle dieses Tests, `findFirst` die
    // Dubletten-Suche von `once` (hier immer „noch nichts da").
    message: { create: vi.fn(async () => ({ id: "m1" })), findFirst: vi.fn(async () => null) },
    entry: { update: vi.fn() },
    kontrollAnforderung: { findUnique: vi.fn(), update: vi.fn() },
    verschlussAnforderung: { findUnique: vi.fn(), update: vi.fn() },
    orgasmusAnforderung: { findFirst: vi.fn(), updateMany: vi.fn() },
    task: { findFirst: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
    strafeRecord: { updateMany: vi.fn() },
    $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  },
}));

// Die Blätter von `notifyUser` — Mail und Push sind für die Absender-Frage ohne Belang.
vi.mock("@/lib/mail", () => ({
  sendMailSafe: vi.fn(), escHtml: (s: string) => s, appBaseUrl: () => "https://x",
  noticeBoxHtml: () => "", dashboardEmailHtml: () => "",
}));
vi.mock("@/lib/push", () => ({ firePush: vi.fn() }));
vi.mock("@/lib/notificationPrefs", () => ({ getMessageChannels: vi.fn(async () => ({ mail: true, push: true })) }));
vi.mock("@/lib/emailI18n", () => ({ emailT: vi.fn(async () => (k: string) => k), emailGreeting: () => "" }));
vi.mock("next-intl/server", () => ({ getTranslations: vi.fn(async () => (k: string) => k) }));
vi.mock("@/lib/heimdallNotify", () => ({ notifyHeimdallForUserId: vi.fn(), notifyHeimdall: vi.fn() }));
vi.mock("@/lib/appMeta", () => ({ markLastAction: vi.fn(), touchAppMeta: vi.fn() }));
vi.mock("@/lib/keyholder", () => ({ getControllersOfUser: vi.fn(async () => []), getControllerAudience: vi.fn(async () => ({ controllers: [], username: "sub" })) }));
vi.mock("@/lib/serverLog", () => ({ structuredLog: vi.fn() }));
// Die Ziel-Auflösung der Kontrolle ist eine eigene, anderswo geprüfte Maschinerie — hier zählt nur,
// dass sie durchlässt.
vi.mock("@/lib/inspectionTarget", () => ({
  resolveInspectionTarget: vi.fn(async () => ({ ok: true, target: { categoryId: null, deviceId: null, activeDeviceId: "kg-1", active: true, lockEntry: null } })),
  inspectionPreconditionProblem: vi.fn(() => undefined),
  inspectionTargetLabel: vi.fn(() => null),
}));
vi.mock("@/lib/strafbuch", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/strafbuch")>()),
  buildStrafbuch: vi.fn(),
}));
// Partiell: ersetzt ist nur die SCHRANKE („wurde die Feststellung je gemeldet?"), nicht der
// Referenz-Typ daneben — den teilen Schreiben und Löschen der Verwerfungs-Meldung.
vi.mock("@/lib/offenseAnnounce", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./offenseAnnounce")>()),
  offenseWasAnnounced: vi.fn(async () => true),
}));

/**
 * Ersetzt ist NUR der Badge-Zähler: er fragt den ganzen Posteingang ab und hat mit der
 * Absender-Frage nichts zu tun. Das SCHREIBEN läuft echt — dort entsteht die Absender-Achse aus dem
 * Handelnden, und genau das ist die zu prüfende Abbildung.
 */
vi.mock("@/lib/messageService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./messageService")>();
  return {
    ...actual,
    recordMessageAndBadge: vi.fn(async (p: Parameters<typeof actual.recordSystemMessage>[0]) => {
      await actual.recordSystemMessage(p);
      return 1;
    }),
  };
});

import { AI_AUTHOR } from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import { buildStrafbuch } from "@/lib/strafbuch";
import { requestKontrolle, resolveKontrolle, sendKontrolleNotification } from "./kontrolleService";
import { sendVerschlussAnforderungNotifications, withdrawVerschlussAnforderungById } from "./verschlussAnforderungService";
import { withdrawOrgasmusAnforderungById } from "./orgasmusAnforderungService";
import { withdrawTask, settleTaskResult } from "./taskService";
import { judgeOffense } from "./strafurteilService";
import { emptyOffenseLists } from "@/test/strafbuchFixture";

const mock = (fn: unknown) => fn as unknown as ReturnType<typeof vi.fn>;
const userMock = mock(prisma.user.findUnique);

/** Der Name des Menschen, der in diesem Test den Knopf drückt. */
const HERRIN = "herrin";
/** Die Erwartungen als Paar — genau die zwei Spalten, die an der Nachricht landen. */
const NAMED = { senderKind: "keyholder", senderName: HERRIN };
const AI = { senderKind: "ai", senderName: null };
const SYSTEM = { senderKind: "system", senderName: null };

/** Die geschriebenen Nachrichten-Zeilen, so wie sie in die Tabelle gingen. */
const recorded = (): { bodyKey: string | null; senderKind: string; senderName: string | null }[] =>
  mock(prisma.message.create).mock.calls.map(([arg]) => (arg as { data: Record<string, unknown> }).data as never);

/** Die zuletzt geschriebene Nachricht — jeder Test löst genau eine an den Träger aus. */
const lastToSub = () => recorded().at(-1);

const USER = { id: "u1", email: "sub@example.org", username: "sub", locale: "de", role: "user", orgasmusArtenConfig: null };

beforeEach(() => {
  vi.clearAllMocks();
  userMock.mockResolvedValue(USER);
  tx.device.findUnique.mockResolvedValue({ requireInspectionCode: false });
  tx.kontrollAnforderung.findFirst.mockResolvedValue(null);
  tx.kontrollAnforderung.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "ka1", ...data }));
});

// ── Kontrolle ───────────────────────────────────────────────────────────────

describe("Kontrolle", () => {
  const NOTIFY = {
    user: USER, code: null, sealCode: null, kommentar: null,
    deadline: new Date("2026-08-12T15:00:00Z"), controlId: "ka1",
  };

  it("vom Menschen gestellt → seine Zeile, mit Namen", async () => {
    await sendKontrolleNotification({ ...NOTIFY, actor: HERRIN });
    expect(lastToSub()).toMatchObject({ bodyKey: "inspectionRequestedMessage", ...NAMED });
  });

  it("über den MCP gestellt → KI, ohne persönlichen Namen", async () => {
    await sendKontrolleNotification({ ...NOTIFY, actor: AI_AUTHOR });
    expect(lastToSub()).toMatchObject(AI);
  });

  it("Auto-Kontrolle (kein Autor an der Zeile) → System, ohne erfundenen Namen", async () => {
    // Genau der Wert, den der Poller aus einer Auto-Zeile liest: `createdBy` ist dort null.
    await sendKontrolleNotification({ ...NOTIFY, actor: null });
    expect(lastToSub()).toMatchObject(SYSTEM);
  });

  it("Rückzug nennt den, der zurückzieht", async () => {
    mock(prisma.kontrollAnforderung.findUnique).mockResolvedValue({
      id: "ka1", userId: "u1", withdrawnAt: null, wirksamAb: null, benachrichtigtAt: new Date(),
    });
    await resolveKontrolle("ka1", "withdraw", HERRIN);
    expect(lastToSub()).toMatchObject({ bodyKey: "inspectionResolvedWithdrawnMessage", ...NAMED });
  });

  /**
   * Der Kern der Spalte `createdBy`: bei einer TERMINIERTEN Kontrolle liegen Knopfdruck und Meldung
   * Stunden auseinander. Der Poller hat keine Sitzung mehr — er kann den Handelnden nur aus der
   * Zeile lesen, und `actor: ka.createdBy` ist wörtlich, was er übergibt.
   */
  it("terminiert gestellt, später vom Poller zugestellt — die Meldung nennt trotzdem den Steller", async () => {
    const res = await requestKontrolle({ userId: "u1", delayMinutes: 30 }, HERRIN);
    expect(res.ok).toBe(true);
    // Beim Anlegen wird NICHTS gemeldet (die Kontrolle ist noch verborgen) …
    expect(recorded()).toHaveLength(0);

    const { data } = tx.kontrollAnforderung.create.mock.calls[0][0] as { data: { createdBy: string | null } };
    expect(data.createdBy).toBe(HERRIN);

    // … und wenn der Poller sie zustellt, kommt der Absender aus genau dieser Spalte.
    await sendKontrolleNotification({ ...NOTIFY, actor: data.createdBy });
    expect(lastToSub()).toMatchObject({ bodyKey: "inspectionRequestedMessage", ...NAMED });
  });
});

// ── Verschluss / Sperrzeit ──────────────────────────────────────────────────

describe("Verschluss-Direktiven", () => {
  const NOTIFY = {
    userId: "u1", user: USER, art: "SPERRZEIT" as const,
    endetAtDate: new Date("2026-08-13T12:00:00Z"), requestId: "va1",
  };

  it("von der Keyholderin angeordnet → ihre Zeile, mit Namen", async () => {
    await sendVerschlussAnforderungNotifications({ ...NOTIFY, actor: HERRIN });
    expect(lastToSub()).toMatchObject({ bodyKey: "lockPeriodSetBody", ...NAMED });
  });

  it("über den MCP angeordnet → KI", async () => {
    await sendVerschlussAnforderungNotifications({ ...NOTIFY, actor: AI_AUTHOR });
    expect(lastToSub()).toMatchObject(AI);
  });

  it("Altzeile ohne Autor (so liest der Poller sie) → System", async () => {
    await sendVerschlussAnforderungNotifications({ ...NOTIFY, actor: null });
    expect(lastToSub()).toMatchObject(SYSTEM);
  });

  it("Rückzug nennt den, der zurückzieht", async () => {
    mock(prisma.verschlussAnforderung.findUnique).mockResolvedValue({
      userId: "u1", art: "SPERRZEIT", withdrawnAt: null, wirksamAb: null, benachrichtigtAt: new Date(),
    });
    await withdrawVerschlussAnforderungById("va1", HERRIN);
    expect(lastToSub()).toMatchObject({ bodyKey: "lockPeriodWithdrawnMessage", ...NAMED });
  });
});

// ── Orgasmus-Anweisung ──────────────────────────────────────────────────────

describe("Orgasmus-Anweisung", () => {
  beforeEach(() => {
    mock(prisma.orgasmusAnforderung.updateMany).mockResolvedValue({ count: 1 });
    // Ausgelöst und dem Sub bekannt — der Normalfall. Der terminierte Gegenfall steht unten.
    mock(prisma.orgasmusAnforderung.findFirst).mockResolvedValue({ wirksamAb: null, benachrichtigtAt: new Date() });
  });

  it("Rückzug durch einen Menschen → seine Zeile, mit Namen", async () => {
    await withdrawOrgasmusAnforderungById("oa1", "u1", HERRIN);
    expect(lastToSub()).toMatchObject({ bodyKey: "orgasmWithdrawnMessage", ...NAMED });
  });

  it("Rückzug über den MCP → KI", async () => {
    await withdrawOrgasmusAnforderungById("oa1", "u1", AI_AUTHOR);
    expect(lastToSub()).toMatchObject(AI);
  });

  // Die Kehrseite derselben Regel: eine terminierte, noch nicht ausgelöste Anweisung kennt der Sub
  // nicht — ihr Rückzug darf ihm nichts melden, sonst verrät die Meldung sie im selben Atemzug.
  it("Rückzug einer noch verborgenen Anweisung → gar keine Meldung", async () => {
    mock(prisma.orgasmusAnforderung.findFirst).mockResolvedValue({ wirksamAb: new Date(Date.now() + 3600_000), benachrichtigtAt: null });
    const before = mock(prisma.message.create).mock.calls.length;
    await withdrawOrgasmusAnforderungById("oa1", "u1", HERRIN);
    expect(mock(prisma.message.create).mock.calls.length).toBe(before);
  });
});

// ── Aufgaben ────────────────────────────────────────────────────────────────

describe("Aufgaben", () => {
  it("Rückzug durch einen Menschen → seine Zeile, mit Namen", async () => {
    mock(prisma.task.findFirst).mockResolvedValue({ title: "Wohnung putzen" });
    // Der Rückzug schreibt in einer Transaktion — er nimmt ein offenes Strafurteil mit.
    mock(tx.task.updateMany).mockResolvedValue({ count: 1 });
    await withdrawTask("t1", "u1", HERRIN);
    expect(lastToSub()).toMatchObject({ bodyKey: "taskWithdrawnMessage", ...NAMED });
  });

  it("Rückzug über den MCP → KI", async () => {
    mock(prisma.task.findFirst).mockResolvedValue({ title: "Wohnung putzen" });
    mock(tx.task.updateMany).mockResolvedValue({ count: 1 });
    await withdrawTask("t1", "u1", AI_AUTHOR);
    expect(lastToSub()).toMatchObject(AI);
  });

  /**
   * Das ERGEBNIS ist ein Befund der App (`evaluateTasks` rechnet ihn aus den Einträgen) und trägt
   * deshalb keinen Namen — auch dann nicht, wenn eine Sichtung ihn ausgelöst hat. Die Sichtung
   * selbst meldet sich getrennt und mit Namen (`taskProofAccepted/Rejected`).
   */
  it("Ergebnis-Meldung des Pollers → System, ohne Namen", async () => {
    mock(prisma.task.update).mockResolvedValue({});
    mock(prisma.strafeRecord.updateMany).mockResolvedValue({ count: 0 });
    await settleTaskResult({
      userId: "u1", taskId: "t1", title: "Wohnung putzen", done: true,
      controllers: [], username: "sub", now: new Date(), once: true,
    });
    expect(recorded().some((r) => r.bodyKey === "taskDoneMessage")).toBe(true);
    for (const r of recorded()) expect(r).toMatchObject(SYSTEM);
  });
});

// ── Urteile ─────────────────────────────────────────────────────────────────

describe("Urteile über Vergehen", () => {
  const REF = "t-1";

  beforeEach(() => {
    mock(buildStrafbuch).mockResolvedValue({
      ...emptyOffenseLists(),
      unfulfilledTasks: [{ id: REF, holdUntil: new Date("2026-08-01T10:00:00Z"), failedAt: null }],
    });
    tx.strafeRecord.upsert.mockResolvedValue({ id: "sr1" });
    tx.task.updateMany.mockResolvedValue({ count: 0 });
  });

  const judge = (actor: string) => judgeOffense({ userId: "u1", refId: REF, action: "punish", text: "20 Schläge" }, actor);

  it("Strafe von einem Menschen verhängt → seine Zeile, mit Namen", async () => {
    await judge(HERRIN);
    expect(lastToSub()).toMatchObject({ bodyKey: "penaltyMessageNoReason", ...NAMED });
  });

  it("Strafe über den MCP verhängt → KI, ohne persönlichen Namen", async () => {
    await judge(AI_AUTHOR);
    expect(lastToSub()).toMatchObject(AI);
  });

  it("Verwerfen nennt den, der verwirft", async () => {
    await judgeOffense({ userId: "u1", refId: REF, action: "dismiss" }, HERRIN);
    expect(lastToSub()).toMatchObject({ bodyKey: "offenseDismissedMessage", ...NAMED });
  });

  /**
   * Sitzung ohne Namen: die App erfindet keinen. Die Zeile bleibt trotzdem das Urteil eines
   * MENSCHEN — das Audit-Kürzel ist „admin", nur der Absender fällt auf System zurück.
   */
  it("Mensch ohne Namen in der Sitzung → System als Absender, aber „admin“ im Urteil", async () => {
    await judge("");
    expect(lastToSub()).toMatchObject(SYSTEM);
    const { create } = tx.strafeRecord.upsert.mock.calls[0][0] as { create: { judgedBy: string } };
    expect(create.judgedBy).toBe("admin");
  });

  it("das KI-Urteil trägt auch im Strafbuch die KI-Kennung", async () => {
    await judge(AI_AUTHOR);
    const { create } = tx.strafeRecord.upsert.mock.calls[0][0] as { create: { judgedBy: string } };
    expect(create.judgedBy).toBe(AI_AUTHOR);
  });
});
