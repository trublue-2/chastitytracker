import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Die Guards des Aufgaben-Services. Wichtigster Fall: eine Aufgabe darf nicht so knapp gestellt
 * werden, dass sie im Moment ihrer Erstellung bereits gescheitert ist — dieselbe Fehlerklasse, die
 * `checkOrgasmWindowEnd` seinerzeit für die Orgasmus-Anforderung behoben hat.
 */

// Der Rückzug läuft in einer Transaktion (er nimmt ein offenes Strafurteil mit) — `tx` ist hier
// derselbe Mock wie `prisma`, die Aufrufe sind damit an einer Stelle ablesbar.
vi.mock("@/lib/prisma", () => {
  const p = {
    user: { findUnique: vi.fn() },
    device: { findMany: vi.fn() },
    deviceCategory: { findMany: vi.fn() },
    task: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn(), count: vi.fn() },
    strafeRecord: { findMany: vi.fn(async () => []), deleteMany: vi.fn(async () => ({ count: 0 })), updateMany: vi.fn(async () => ({ count: 0 })) },
    message: { deleteMany: vi.fn() },
    $transaction: vi.fn(async (fn: (t: unknown) => unknown) => fn(p)),
  };
  return { prisma: p };
});
vi.mock("@/lib/notify", () => ({ notifyUser: vi.fn(), notifyControllers: vi.fn() }));
// Teilmock wie in `taskProofService.test.ts`: die Auswertung ist dort geprüft, hier zählt, was die
// App mit ihrem Ergebnis tut.
vi.mock("@/lib/taskIntervals", async (orig) => ({
  ...(await orig<object>()),
  evaluateTaskById: vi.fn(),
}));
vi.mock("@/lib/keyholder", () => ({ getControllerAudience: vi.fn(async () => ({ controllers: [], username: "sub" })) }));
vi.mock("@/lib/taskProofNotify", () => ({ notifyLateProofsForTask: vi.fn() }));
vi.mock("@/lib/imageUtils", () => ({ deleteUploadedFiles: vi.fn() }));
// Nur den Zufall festnageln — `utils` ist sonst reine Arithmetik und soll echt laufen.
vi.mock("@/lib/utils", async (orig) => ({ ...(await orig<object>()), generateKontrollCode: () => "12345" }));

import { createTask, updateTask, withdrawTask, deleteTask, completeTask, mergeTaskPatch, effectivePenaltyReason } from "./taskService";
import { deleteUploadedFiles } from "@/lib/imageUtils";
import { prisma } from "@/lib/prisma";
import { notifyUser, notifyControllers } from "@/lib/notify";
import { evaluateTaskById } from "@/lib/taskIntervals";
import { notifyLateProofsForTask } from "@/lib/taskProofNotify";

const userMock = prisma.user.findUnique as unknown as ReturnType<typeof vi.fn>;
const catMock = prisma.deviceCategory.findMany as unknown as ReturnType<typeof vi.fn>;
const devMock = prisma.device.findMany as unknown as ReturnType<typeof vi.fn>;
const taskCreateMock = prisma.task.create as unknown as ReturnType<typeof vi.fn>;
const taskFindMock = prisma.task.findFirst as unknown as ReturnType<typeof vi.fn>;
const taskUpdateMock = prisma.task.updateMany as unknown as ReturnType<typeof vi.fn>;
const taskCountMock = prisma.task.count as unknown as ReturnType<typeof vi.fn>;
const notifyMock = notifyUser as unknown as ReturnType<typeof vi.fn>;
const evalMock = evaluateTaskById as unknown as ReturnType<typeof vi.fn>;
const notifyControllersMock = notifyControllers as unknown as ReturnType<typeof vi.fn>;
const penaltyCloseMock = prisma.strafeRecord.updateMany as unknown as ReturnType<typeof vi.fn>;
const taskUpdateOneMock = prisma.task.update as unknown as ReturnType<typeof vi.fn>;
const lateSweepMock = notifyLateProofsForTask as unknown as ReturnType<typeof vi.fn>;
const taskDeleteMock = prisma.task.deleteMany as unknown as ReturnType<typeof vi.fn>;
const deleteFilesMock = deleteUploadedFiles as unknown as ReturnType<typeof vi.fn>;
// Die Urteils-Tabelle: der Rückzug einer Strafaufgabe liest sie und löscht daraus.
const judgmentFindMock = prisma.strafeRecord.findMany as unknown as ReturnType<typeof vi.fn>;
const judgmentDeleteMock = prisma.strafeRecord.deleteMany as unknown as ReturnType<typeof vi.fn>;

const JETZT = new Date("2026-07-25T12:00:00Z");
const IN_DREI_STUNDEN = new Date("2026-07-25T15:00:00Z");

const base = { userId: "u1", title: "Wohnung staubsaugen", holdUntil: IN_DREI_STUNDEN };

beforeEach(() => {
  vi.clearAllMocks();
  // Ohne ausdrückliches Ergebnis wertet der Nachlauf NICHTS aus — sonst hinge das Verhalten der
  // übrigen `completeTask`-Tests daran, dass `undefined` zufällig falsy ist.
  evalMock.mockResolvedValue(null);
  vi.useFakeTimers();
  vi.setSystemTime(JETZT);
  userMock.mockResolvedValue({ id: "u1" });
  taskCreateMock.mockResolvedValue({
    id: "t1", title: "Wohnung staubsaugen", holdUntil: IN_DREI_STUNDEN,
    holdDurationMin: null, createdAt: JETZT, startGraceMin: 30,
  });
  taskUpdateMock.mockResolvedValue({ count: 1 });
  taskCountMock.mockResolvedValue(1);
  devMock.mockResolvedValue([{ id: "d1", category: { isBuiltIn: false } }]);
  catMock.mockResolvedValue([{ id: "c1", isBuiltIn: false }]);
});
afterEach(() => vi.useRealTimers());

describe("createTask", () => {
  it("legt die Aufgabe an und benachrichtigt den Sub", async () => {
    const res = await createTask({ ...base, requirements: [{ type: "KG_LOCKED" }] }, "herrin");

    expect(res.ok).toBe(true);
    expect(notifyMock).toHaveBeenCalledWith("u1", expect.objectContaining({ subjectKey: "taskAssignedSubject" }));
  });

  it("Endzeit zu knapp für die Kulanzfrist → abgelehnt (sonst bei Erstellung schon gescheitert)", async () => {
    const res = await createTask({
      ...base,
      holdUntil: new Date("2026-07-25T12:20:00Z"), // in 20 Min, Kulanz ist 30
      requirements: [{ type: "KG_LOCKED" }],
    },
    "herrin");

    if (res.ok) throw new Error("erwartet: Fehler");
    expect(res.error).toBe("TASK_HOLD_UNTIL_TOO_SOON");
    expect(taskCreateMock).not.toHaveBeenCalled();
  });

  it("OHNE Bedingungen zählt die Kulanz nicht — eine kurze Frist ist erlaubt", async () => {
    // Ohne Geräte gibt es nichts anzulegen; holdUntil ist dann eine schlichte Erledigungs-Frist.
    const res = await createTask({ ...base, holdUntil: new Date("2026-07-25T12:20:00Z") }, "herrin");
    expect(res.ok).toBe(true);
  });

  it("KG als Trage-Kategorie wird abgewiesen (dafür gibt es KG_LOCKED)", async () => {
    catMock.mockResolvedValue([{ id: "kg", isBuiltIn: true }]);
    const res = await createTask({ ...base, requirements: [{ type: "WEAR", categoryId: "kg" }] }, "herrin");

    if (res.ok) throw new Error("erwartet: Fehler");
    expect(res.error).toBe("TASK_REQUIREMENT_KG_CATEGORY");
  });

  it("fremde Kategorie wird abgewiesen", async () => {
    catMock.mockResolvedValue([]); // fremde Kategorie wird von der userId-gefilterten Query nicht geliefert
    const res = await createTask({ ...base, requirements: [{ type: "WEAR", categoryId: "c1" }] }, "herrin");

    if (res.ok) throw new Error("erwartet: Fehler");
    expect(res.error).toBe("INVALID_CATEGORY");
  });

  it("fremdes Gerät wird abgewiesen", async () => {
    devMock.mockResolvedValue([]);
    const res = await createTask({ ...base, requirements: [{ type: "WEAR", deviceId: "d9" }] }, "herrin");

    if (res.ok) throw new Error("erwartet: Fehler");
    expect(res.error).toBe("INVALID_DEVICE");
  });

  it("dieselbe Bedingung doppelt → abgelehnt", async () => {
    const res = await createTask({
      ...base,
      requirements: [{ type: "WEAR", categoryId: "c1" }, { type: "WEAR", categoryId: "c1" }],
    },
    "herrin");

    if (res.ok) throw new Error("erwartet: Fehler");
    expect(res.error).toBe("TASK_DUPLICATE_REQUIREMENT");
  });

  it("WEAR ohne Kategorie und ohne Gerät ist keine Bedingung", async () => {
    const res = await createTask({ ...base, requirements: [{ type: "WEAR" }] }, "herrin");

    if (res.ok) throw new Error("erwartet: Fehler");
    expect(res.error).toBe("TASK_REQUIREMENT_INVALID");
  });

  it("leerer Titel → abgelehnt", async () => {
    const res = await createTask({ ...base, title: "   " }, "herrin");
    if (res.ok) throw new Error("erwartet: Fehler");
    expect(res.error).toBe("TASK_TITLE_REQUIRED");
  });

  it("zu langer Titel → abgelehnt", async () => {
    const res = await createTask({ ...base, title: "x".repeat(200) }, "herrin");
    if (res.ok) throw new Error("erwartet: Fehler");
    expect(res.error).toBe("TASK_TITLE_TOO_LONG");
  });

  it("Straf-Anlass wird nur bei isPunishment gespeichert", async () => {
    await createTask({ ...base, penaltyReason: "zu spät", isPunishment: false }, "herrin");
    expect(taskCreateMock.mock.calls[0][0].data.penaltyReason).toBeNull();
  });

  it("zu lange Beschreibung → abgelehnt", async () => {
    const res = await createTask({ ...base, description: "x".repeat(3000) }, "herrin");
    if (res.ok) throw new Error("erwartet: Fehler");
    expect(res.error).toBe("TASK_DESCRIPTION_TOO_LONG");
  });

  it("KG_LOCKED verwirft die Kategorie NICHT still, sondern lehnt sie ab", async () => {
    const res = await createTask({ ...base, requirements: [{ type: "KG_LOCKED", categoryId: "c1" }] }, "herrin");
    if (res.ok) throw new Error("erwartet: Fehler");
    expect(res.error).toBe("TASK_REQUIREMENT_INVALID");
  });

  it("das KG-GERÄT lässt sich auch nicht über deviceId als Trage-Bedingung fordern", async () => {
    // Sonst liesse sich die Regel über das Gerät statt über die Kategorie umgehen — die Aufgabe wäre
    // unerfüllbar, weil ein WEAR_BEGIN auf ein KG-Gerät abgewiesen wird.
    devMock.mockResolvedValue([{ id: "kgdev", category: { isBuiltIn: true } }]);
    const res = await createTask({ ...base, requirements: [{ type: "WEAR", deviceId: "kgdev" }] }, "herrin");
    if (res.ok) throw new Error("erwartet: Fehler");
    expect(res.error).toBe("TASK_REQUIREMENT_KG_CATEGORY");
  });

  it("negative Kulanz wird geklemmt statt die Endzeit-Prüfung umzudrehen", async () => {
    const res = await createTask({ ...base, startGraceMin: -600, requirements: [{ type: "KG_LOCKED" }] }, "herrin");
    expect(res.ok).toBe(true);
    expect(taskCreateMock.mock.calls[0][0].data.startGraceMin).toBe(0);
  });

  it("Bedingungen bekommen eine stabile Reihenfolge", async () => {
    await createTask({ ...base, requirements: [{ type: "KG_LOCKED" }, { type: "WEAR", categoryId: "c1" }] }, "herrin");
    const created = taskCreateMock.mock.calls[0][0].data.requirements.create;
    expect(created.map((r: { sortOrder: number }) => r.sortOrder)).toEqual([0, 1]);
    expect(created[0].categoryId).toBeNull(); // KG_LOCKED trägt keine Kategorie
  });
});

describe("createTask — Nachweis-Fotos (Issue #39)", () => {
  const proofsOf = () => taskCreateMock.mock.calls[0][0].data.proofs.create;

  it("die Eingabe-Reihenfolge IST die Soll-Reihenfolge", async () => {
    await createTask({ ...base, proofs: [
      { description: "Verschluss" }, { description: "Plug" }, { description: "Rechnungen" },
    ] },
    "herrin");
    expect(proofsOf().map((p: { sortOrder: number; description: string }) => [p.sortOrder, p.description]))
      .toEqual([[0, "Verschluss"], [1, "Plug"], [2, "Rechnungen"]]);
  });

  /** Der Code ist die VORGABE, die der Sub im Bild zeigen muss — er muss feststehen, bevor er die
   *  Aufgabe sieht. Deshalb entsteht er beim Stellen, nicht beim Einreichen. */
  it("Code-Pflicht vergibt einen Code, ohne Pflicht bleibt er leer", async () => {
    await createTask({ ...base, proofs: [
      { description: "mit Code", requireCode: true }, { description: "ohne Code" },
    ] },
    "herrin");
    expect(proofsOf()[0]).toMatchObject({ requireCode: true, code: "12345" });
    expect(proofsOf()[1]).toMatchObject({ requireCode: false, code: null });
  });

  it("Beschreibung ist Pflicht — eine leere Zeile ist ein Versehen, keine Forderung", async () => {
    const res = await createTask({ ...base, proofs: [{ description: "   " }] }, "herrin");
    if (res.ok) throw new Error("erwartet: Fehler");
    expect(res.error).toBe("TASK_PROOF_INVALID");
    expect(taskCreateMock).not.toHaveBeenCalled();
  });

  it("zu lange Beschreibung wird abgewiesen", async () => {
    const res = await createTask({ ...base, proofs: [{ description: "x".repeat(201) }] }, "herrin");
    if (res.ok) throw new Error("erwartet: Fehler");
    expect(res.error).toBe("TASK_PROOF_INVALID");
  });

  it("mehr als zehn Nachweise werden abgewiesen", async () => {
    const many = Array.from({ length: 11 }, (_, i) => ({ description: `N${i}` }));
    const res = await createTask({ ...base, proofs: many }, "herrin");
    if (res.ok) throw new Error("erwartet: Fehler");
    expect(res.error).toBe("TASK_TOO_MANY_PROOFS");
  });

  it("ohne Nachweise bleibt die Liste leer — der Normalfall zahlt nichts", async () => {
    await createTask(base, "herrin");
    expect(proofsOf()).toEqual([]);
  });

  /** B12 — die EIGENE Fälligkeit eines Nachweises (Minuten ab dem Nullpunkt der Aufgabe). */
  it("eine eigene Fälligkeit wandert als Minutenzahl in die Zeile, ohne sie bleibt sie leer", async () => {
    await createTask({ ...base, proofs: [{ description: "mittags", dueOffsetMin: 60 }, { description: "irgendwann" }] }, "herrin");
    expect(proofsOf()[0]).toMatchObject({ dueOffsetMin: 60 });
    expect(proofsOf()[1]).toMatchObject({ dueOffsetMin: null });
  });

  /** Eine Fälligkeit HINTER dem Ende der Aufgabe könnte nie greifen: `proofDeadline` deckelt sie auf
   *  das Ende, und der Poller sucht über die Spalte `holdUntil`. Abweisen statt still kappen — sonst
   *  bekäme die Keyholderin eine andere Frist, als sie gestellt hat. */
  it("eine Fälligkeit nach dem Ende der Aufgabe wird abgewiesen", async () => {
    // Ende in drei Stunden, Fälligkeit „nach vier Stunden".
    const res = await createTask({ ...base, proofs: [{ description: "zu spät", dueOffsetMin: 240 }] }, "herrin");
    if (res.ok) throw new Error("erwartet: Fehler");
    expect(res.error).toBe("TASK_PROOF_DUE_AFTER_END");
    expect(taskCreateMock).not.toHaveBeenCalled();
    // Genau auf dem Ende ist noch zulässig — dieselbe Kante wie beim Einreichen.
    expect((await createTask({ ...base, proofs: [{ description: "auf der Kante", dueOffsetMin: 180 }] }, "herrin")).ok).toBe(true);
  });

  /** Eine 0 heisst „keine eigene Frist" — NICHT „eine Minute". Über `clampHoldDuration` geklemmt
   *  (dessen `min: 1` für eine Haltedauer richtig ist) wäre die Aufgabe eine Minute nach dem
   *  Nullpunkt versäumt, ohne dass jemand eine Frist gewählt hätte. */
  it("eine Fälligkeit von 0 ist keine Fälligkeit", async () => {
    await createTask({ ...base, proofs: [
      { description: "ohne Frist", dueOffsetMin: 0 },
      { description: "unlesbar", dueOffsetMin: Number.NaN },
      { description: "negativ", dueOffsetMin: -30 },
    ] }, "herrin");
    expect(proofsOf().map((p: { dueOffsetMin: number | null }) => p.dueOffsetMin)).toEqual([null, null, null]);
  });

  /** Der Nullpunkt einer TERMINIERTEN Aufgabe ist ihr Auslöse-Zeitpunkt (B1). Gegen „jetzt" geprüft
   *  wäre eine Fälligkeit, die nach dem Wirksamwerden bequem in die Frist passt, hier abgewiesen. */
  it("bei einer terminierten Aufgabe zählt die Fälligkeit ab dem Wirksamwerden", async () => {
    const res = await createTask({
      ...base,
      // Wirksam in vier Stunden, Ende sechs Stunden später — „nach 60 Minuten" liegt bequem darin.
      wirksamAbAt: new Date(JETZT.getTime() + 4 * 3600_000).toISOString(),
      holdUntil: new Date(JETZT.getTime() + 10 * 3600_000),
      proofs: [{ description: "eine Stunde nach dem Start", dueOffsetMin: 60 }],
    }, "herrin");
    expect(res.ok).toBe(true);
    expect(proofsOf()[0]).toMatchObject({ dueOffsetMin: 60 });
  });
});

describe("updateTask — Endzeit während der Nutzung verschieben (Issue #29)", () => {
  // `startGraceMin` + `_count` gehören zur Zeile, die `updateTask` lädt: die neue Endzeit wird gegen
  // die Startfrist geprüft, und die gilt nur für Aufgaben MIT Bedingungen.
  const offen = { id: "t1", userId: "u1", title: "Wohnung staubsaugen", description: null, holdUntil: IN_DREI_STUNDEN, isPunishment: false, penaltyReason: null, createdAt: JETZT, startGraceMin: 30, completedAt: null, withdrawnAt: null, _count: { requirements: 1 } };

  it("verlängert die Endzeit und meldet es dem Sub", async () => {
    taskFindMock.mockResolvedValue(offen);
    const spaeter = new Date("2026-07-25T17:00:00Z");
    const res = await updateTask("t1", "u1", { holdUntil: spaeter }, "herrin");

    expect(res.ok).toBe(true);
    expect(taskUpdateMock.mock.calls[0][0].data.holdUntil).toEqual(spaeter);
    expect(notifyMock).toHaveBeenCalledWith("u1", expect.objectContaining({ subjectKey: "taskChangedSubject" }));
  });

  it("abgeschlossene oder zurückgezogene Aufgabe ist nicht mehr änderbar", async () => {
    taskFindMock.mockResolvedValue({ ...offen, withdrawnAt: JETZT });
    expect((await updateTask("t1", "u1", { title: "neu" }, "herrin")).ok).toBe(false);

    taskFindMock.mockResolvedValue({ ...offen, completedAt: JETZT });
    expect((await updateTask("t1", "u1", { title: "neu" }, "herrin")).ok).toBe(false);
    expect(taskUpdateMock).not.toHaveBeenCalled();
  });

  it("fremde Aufgabe wird nicht gefunden (IDOR-Schutz)", async () => {
    taskFindMock.mockResolvedValue(null); // findFirst ist bereits auf userId gefiltert
    const res = await updateTask("t1", "u1", { title: "neu" }, "herrin");
    if (res.ok) throw new Error("erwartet: Fehler");
    expect(res.error).toBe("TASK_NOT_FOUND");
  });

  it("Endzeit in die VERGANGENHEIT zu setzen wird abgelehnt", async () => {
    // Sonst bekäme der Sub durch einen Datums-Vertipper sofort ein Versäumnis, ohne je handeln zu können.
    taskFindMock.mockResolvedValue({ ...offen, createdAt: new Date("2026-07-22T12:00:00Z") });
    const res = await updateTask("t1", "u1", { holdUntil: new Date("2026-07-23T12:00:00Z") }, "herrin");
    if (res.ok) throw new Error("erwartet: Fehler");
    expect(res.error).toBe("TASK_HOLD_UNTIL_TOO_SOON");
  });

  /**
   * Eine Frist, die nach VORN rückt, macht aus einem rechtzeitig eingereichten Nachweis rückwirkend
   * einen verspäteten — und der zählt dann nur noch, wenn die Keyholderin ihn annimmt. Bis hierher
   * hing diese Meldung allein am Hochladen: ein Nachweis, den ihre eigene Änderung zu spät machte,
   * fiel still. Was gemeldet wird, prüft `taskProofNotify.test.ts`; hier zählt die Verdrahtung.
   */
  it("eine vorgezogene Endzeit meldet die dadurch verspäteten Nachweise", async () => {
    taskFindMock.mockResolvedValue(offen);
    const frueher = new Date("2026-07-25T14:00:00Z");
    await updateTask("t1", "u1", { holdUntil: frueher }, "herrin");

    // Mit dem NEUEN Ende: gegen das alte gemessen wäre kein einziger Nachweis zu spät.
    expect(lateSweepMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "t1", holdUntil: frueher }),
      "u1",
    );
  });

  it("eine verlängerte Endzeit meldet nichts — später kann kein Nachweis neu zu spät sein", async () => {
    taskFindMock.mockResolvedValue(offen);
    await updateTask("t1", "u1", { holdUntil: new Date("2026-07-25T17:00:00Z") }, "herrin");
    expect(lateSweepMock).not.toHaveBeenCalled();
  });

  it("Straf-Anlass fällt weg, wenn die Strafe zurückgenommen wird", async () => {
    taskFindMock.mockResolvedValue({ ...offen, isPunishment: true, penaltyReason: "zu spät" });
    await updateTask("t1", "u1", { isPunishment: false }, "herrin");
    expect(taskUpdateMock.mock.calls[0][0].data.penaltyReason).toBeNull();
  });

  /**
   * REGRESSION: `holdUntil` darf nicht unter die STARTFRIST (`createdAt + startGraceMin`) rutschen.
   *
   * Das ist kein strenger Sonderfall, sondern ein widersprüchlicher Zustand: die Aufgabe verlangt
   * Deckung bis zu einem Zeitpunkt, zu dem der Sub noch gar nicht angefangen haben muss.
   * `createTask` verbietet ihn; `updateTask` liess ihn zu. Dahinter lagen drei Fehlurteile, mit
   * `evaluateTask` nachgemessen (Aufgabe 12:00 erstellt, Kulanz 30 min, Frist auf 12:10 verkürzt):
   *   · Sub tut nichts       → `pending`, aber der Poller meldete „versäumt" und stempelte es fest
   *   · Sub legt 12:15 an    → `running`, obwohl die Frist um 12:10 ablief
   *   · dito + Selbstmeldung → **`done`** — erfüllt, ohne das Gerät je vor der Frist getragen zu
   *     haben (`coversContinuously` gibt bei `from >= until` früh `true` zurück)
   */
  it("REGRESSION: Endzeit unter die Startfrist zu verkürzen wird abgelehnt", async () => {
    taskFindMock.mockResolvedValue(offen); // erstellt 12:00, Kulanz 30 min → Startfrist 12:30
    const res = await updateTask("t1", "u1", { holdUntil: new Date("2026-07-25T12:10:00Z") }, "herrin");
    if (res.ok) throw new Error("erwartet: Fehler");
    expect(res.error).toBe("TASK_HOLD_UNTIL_TOO_SOON");
    expect(taskUpdateMock).not.toHaveBeenCalled();
  });

  it("nach Ablauf der Startfrist bleibt Verkürzen möglich (Issue #29)", async () => {
    // Vor drei Tagen gestellt: die Startfrist ist längst verstrichen, „gleich fällig" bleibt erlaubt.
    taskFindMock.mockResolvedValue({ ...offen, createdAt: new Date("2026-07-22T12:00:00Z") });
    const gleich = new Date("2026-07-25T12:30:00Z");
    const res = await updateTask("t1", "u1", { holdUntil: gleich }, "herrin");
    expect(res.ok).toBe(true);
    expect(taskUpdateMock.mock.calls[0][0].data.holdUntil).toEqual(gleich);
  });

  it("Aufgabe OHNE Bedingungen kennt keine Startfrist — nur „in der Zukunft“ zählt", async () => {
    // Ohne Bedingungen gibt es nichts anzulegen; die Kulanz ist bedeutungslos (wie in `createTask`).
    taskFindMock.mockResolvedValue({ ...offen, _count: { requirements: 0 } });
    const res = await updateTask("t1", "u1", { holdUntil: new Date("2026-07-25T12:10:00Z") }, "herrin");
    expect(res.ok).toBe(true);
  });
});

describe("completeTask — Selbstmeldung des Subs", () => {
  const offen = { id: "t1", userId: "u1", title: "T", description: null, holdUntil: IN_DREI_STUNDEN, isPunishment: false, penaltyReason: null, createdAt: JETZT, completedAt: null, completionNote: null, withdrawnAt: null };

  it("setzt den Zeitstempel", async () => {
    const res = await completeTask("t1", "u1", "fertig");

    expect(res.ok).toBe(true);
    expect(taskUpdateMock.mock.calls[0][0].data.completedAt).toEqual(JETZT);
    // Die Where-Klausel prüft BEWUSST nicht auf `completedAt: null` — siehe den Test darunter.
    // Was sie prüft, ist der Rückzug: eine zurückgezogene Aufgabe nimmt keine Meldung mehr an.
    expect(taskUpdateMock.mock.calls[0][0].where).toMatchObject({ id: "t1", userId: "u1", withdrawnAt: null });
    expect(taskUpdateMock.mock.calls[0][0].where.completedAt).toBeUndefined();
  });

  it("eine ERNEUTE Meldung setzt den Zeitstempel neu — sonst gäbe es eine Sackgasse", async () => {
    // `evaluateTask` verlangt `completedAt >= startedAt`, und `startedAt` ist abgeleitet: korrigiert
    // die Keyholderin einen Eintrag, kann der Beginn hinter eine bereits abgegebene Meldung rutschen.
    // Die Aufgabe fällt dann zurück auf „wartet auf Bestätigung" und der Knopf erscheint wieder.
    // Griffe die Where-Klausel weiterhin nur auf `completedAt: null`, träfe er null Zeilen, meldete
    // Erfolg und änderte nichts — beliebig oft.
    taskUpdateMock.mockResolvedValue({ count: 1 });
    expect((await completeTask("t1", "u1")).ok).toBe(true);
    expect(taskUpdateMock.mock.calls[0][0].data.completedAt).toEqual(JETZT);
  });

  it("rückt den Zeitstempel NICHT vor, wo er eine rechtzeitige Meldung zum Vergehen machen würde", async () => {
    // Eine Aufgabe OHNE Bedingungen misst `completedAt` gegen `holdUntil`, nicht gegen `startedAt`.
    // Ein Vorrücken kippt dort `done` → `missed`. Genau das kann über die Offline-Warteschlange
    // passieren: rechtzeitig gemeldet, Antwort verloren, beim Reconnect ein zweites Mal zugestellt.
    // Die Where-Klausel lässt das Vorrücken deshalb nur zu, wo es nichts kaputt machen kann.
    await completeTask("t1", "u1");

    expect(taskUpdateMock.mock.calls[0][0].where.OR).toEqual([
      { completedAt: null },
      { requirements: { some: {} } },
      { holdUntil: { gte: JETZT } },
    ]);
  });

  it("zurückgezogen oder gelöscht → Treffer auf null Zeilen, aber kein Fehler", async () => {
    taskUpdateMock.mockResolvedValue({ count: 0 });
    taskCountMock.mockResolvedValue(1);
    expect((await completeTask("t1", "u1")).ok).toBe(true);
  });

  it("fremde Aufgabe → nicht gefunden (IDOR-Schutz)", async () => {
    taskUpdateMock.mockResolvedValue({ count: 0 });
    taskCountMock.mockResolvedValue(0);
    const res = await completeTask("t1", "u2");
    if (res.ok) throw new Error("erwartet: Fehler");
    expect(res.error).toBe("TASK_NOT_FOUND");
  });

  /**
   * Die Selbstmeldung ist ein Sub-Pfad: eine terminierte, noch nicht zugestellte Aufgabe gibt es für
   * den Träger nicht, also kann er sie auch nicht melden. Geprüft wird die `where`-Klausel BEIDER
   * Abfragen — die Gegenprobe darunter entscheidet, was der Aufrufer zu hören bekommt.
   */
  it("eine noch nicht zugestellte Aufgabe nimmt keine Meldung an", async () => {
    const VISIBLE = { AND: [{ OR: [{ wirksamAb: null }, { benachrichtigtAt: { not: null } }] }] };
    // Die terminierte Zeile fällt aus beiden Abfragen: nichts geschrieben, nichts gezählt.
    taskUpdateMock.mockResolvedValue({ count: 0 });
    taskCountMock.mockResolvedValue(0);

    const res = await completeTask("t1", "u1");

    expect(taskUpdateMock.mock.calls[0][0].where).toMatchObject(VISIBLE);
    expect(taskCountMock.mock.calls[0][0].where).toMatchObject(VISIBLE);
    // Ununterscheidbar von einer fremden Aufgabe — ein „schon gemeldet" verriete, dass es sie gibt.
    if (res.ok) throw new Error("erwartet: Fehler");
    expect(res.error).toBe("TASK_NOT_FOUND");
  });
});

describe("withdrawTask", () => {
  it("zieht zurück und meldet es", async () => {
    taskFindMock.mockResolvedValue({ id: "t1", userId: "u1", title: "T", withdrawnAt: null, completedAt: null });
    const res = await withdrawTask("t1", "u1", "herrin");

    expect(res.ok).toBe(true);
    expect(notifyMock).toHaveBeenCalledWith("u1", expect.objectContaining({ subjectKey: "taskWithdrawnSubject" }));
  });
});

/** Der Rückzug einer STRAFaufgabe nimmt das Urteil mit — Begründung an `dropJudgments`. */
describe("withdrawTask — das Urteil geht mit", () => {
  const openJudgment = { refId: "off-1" };

  beforeEach(() => {
    taskFindMock.mockResolvedValue({ id: "t1", userId: "u1", title: "Strafe", withdrawnAt: null, completedAt: null });
    taskUpdateMock.mockResolvedValue({ count: 1 });
    judgmentFindMock.mockResolvedValue([openJudgment]);
    judgmentDeleteMock.mockResolvedValue({ count: 1 });
  });

  it("ein noch offenes Urteil wird fallen gelassen", async () => {
    await withdrawTask("t1", "u1", "herrin");

    expect(judgmentFindMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "u1", taskId: "t1", status: "PUNISHED", erledigtAt: null } }),
    );
    expect(judgmentDeleteMock).toHaveBeenCalledWith({ where: { userId: "u1", refId: { in: ["off-1"] } } });
  });

  it("eine vom Träger GEMELDETE Strafe behält ihr Urteil", async () => {
    // Die eigentliche Zusage, und sie hängt NICHT an `erledigtAt`: das stempelt erst der Poller nach
    // dem Ende der Aufgabe. Zwischen „Freitag gemeldet" und „Sonntag verbucht" läge sonst ein
    // Fenster, in dem der Rückzug eine abgeleistete Strafe tilgt.
    taskFindMock.mockResolvedValue({ id: "t1", userId: "u1", title: "Strafe", withdrawnAt: null, completedAt: JETZT });
    const res = await withdrawTask("t1", "u1", "herrin");

    expect(res.ok).toBe(true);
    expect(judgmentFindMock).not.toHaveBeenCalled();
    expect(judgmentDeleteMock).not.toHaveBeenCalled();
  });

  it("eine gewöhnliche Aufgabe lässt die Urteils-Tabelle unberührt", async () => {
    judgmentFindMock.mockResolvedValue([]);
    const res = await withdrawTask("t1", "u1", "herrin");

    expect(res.ok).toBe(true);
    expect(judgmentDeleteMock).not.toHaveBeenCalled();
  });
});

describe("effectivePenaltyReason — eine Regel für Anlegen und Ändern", () => {
  it("ohne Strafe kein Anlass", () => {
    expect(effectivePenaltyReason(false, "zu spät")).toBeNull();
  });
  it("mit Strafe getrimmt übernommen", () => {
    expect(effectivePenaltyReason(true, "  zu spät  ")).toBe("zu spät");
  });
});

describe("mergeTaskPatch — pure, teilt Vorschau und Commit", () => {
  const current = { title: "A", description: "d", holdUntil: JETZT, holdDurationMin: null, isPunishment: false, penaltyReason: null };
  const anchor = { createdAt: JETZT, startGraceMin: 30, wirksamAb: null };

  it("undefined lässt unverändert, null löscht", () => {
    expect(mergeTaskPatch(current, {}, anchor).description).toBe("d");
    expect(mergeTaskPatch(current, { description: null }, anchor).description).toBeNull();
  });

  it("trimmt Texte", () => {
    expect(mergeTaskPatch(current, { title: "  B  " }, anchor).title).toBe("B");
  });

  /**
   * Der Modus einer Aufgabe wechselt NIE — aus demselben Grund, aus dem sich Bedingungen und
   * Nachweise nicht ändern lassen: der Sub hätte etwas anderes zu erfüllen, als ihm gestellt wurde.
   * Die jeweils modus-fremde Angabe fällt deshalb still weg, statt umzuschalten.
   */
  it("eine Aufgabe mit festem Ende nimmt keine Dauer an", () => {
    const next = mergeTaskPatch(current, { holdDurationMin: 45 }, anchor);
    expect(next.holdDurationMin).toBeNull();
    expect(next.holdUntil).toBe(JETZT);
  });

  it("eine Dauer-Aufgabe ignoriert einen Endzeitpunkt und leitet ihr Ende neu ab", () => {
    const duration = { ...current, holdDurationMin: 30 };
    const next = mergeTaskPatch(duration, { holdUntil: new Date("2030-01-01T00:00:00Z"), holdDurationMin: 60 }, anchor);
    expect(next.holdDurationMin).toBe(60);
    // Spätestmögliches Ende = Startfrist (30 min Kulanz) + 60 min Dauer.
    expect(next.holdUntil.getTime()).toBe(JETZT.getTime() + 90 * 60_000);
  });
});

/**
 * Der Dauer-Modus auf der SCHREIB-Seite: die Keyholderin stellt eine Haltezeit, keinen Zeitpunkt.
 * Das gespeicherte `holdUntil` ist dann eine abgeleitete obere Schranke — sie muss stimmen, weil die
 * Vorauswahl des Pollers über die Spalte sucht.
 */
describe("createTask — Dauer-Modus (Haltezeit ab dem Anlegen)", () => {
  it("rechnet das spätestmögliche Ende aus Kulanz + Dauer", async () => {
    const res = await createTask({
      userId: "u1", title: "Halsband tragen",
      holdDurationMin: 30, startGraceMin: 15,
      requirements: [{ type: "WEAR", categoryId: "c1" }],
    }, "herrin");

    expect(res.ok).toBe(true);
    const data = taskCreateMock.mock.calls[0][0].data;
    expect(data.holdDurationMin).toBe(30);
    // 12:00 + 15 min Kulanz + 30 min Dauer.
    expect(data.holdUntil).toEqual(new Date("2026-07-25T12:45:00Z"));
  });

  it("braucht keinen Endzeitpunkt — die Dauer IST die Frist", async () => {
    const res = await createTask({
      userId: "u1", title: "Halsband tragen", holdDurationMin: 30,
      requirements: [{ type: "WEAR", categoryId: "c1" }],
    }, "herrin");
    expect(res.ok).toBe(true);
  });

  it("ohne Bedingungen abgelehnt — es gäbe kein Anlegen, an dem die Uhr starten könnte", async () => {
    const res = await createTask({ userId: "u1", title: "Staubsaugen", holdDurationMin: 30 }, "herrin");

    if (res.ok) throw new Error("erwartet: Fehler");
    expect(res.error).toBe("TASK_HOLD_DURATION_WITHOUT_REQUIREMENTS");
    expect(taskCreateMock).not.toHaveBeenCalled();
  });

  it("weder Zeitpunkt noch Dauer → abgelehnt, statt mit einer geratenen Frist anzulegen", async () => {
    const res = await createTask({ userId: "u1", title: "Staubsaugen" }, "herrin");

    if (res.ok) throw new Error("erwartet: Fehler");
    expect(res.error).toBe("TASK_HOLD_MISSING");
    expect(taskCreateMock).not.toHaveBeenCalled();
  });

  it("meldet dem Sub die DAUER, nicht das spätestmögliche Ende", async () => {
    taskCreateMock.mockResolvedValue({
      id: "t1", title: "Halsband tragen", holdUntil: new Date("2026-07-25T12:45:00Z"),
      holdDurationMin: 30, createdAt: JETZT, startGraceMin: 15,
    });
    await createTask({
      userId: "u1", title: "Halsband tragen", holdDurationMin: 30, startGraceMin: 15,
      requirements: [{ type: "WEAR", categoryId: "c1" }],
    }, "herrin");

    // „Frist: 12:45" wäre die Unwahrheit, die den ganzen Modus wieder aufhöbe: 12:45 gilt nur, wenn
    // er die Kulanz voll ausreizt. Was ihn bindet, sind die 30 Minuten und der späteste Beginn.
    expect(notifyMock.mock.calls[0][1]).toMatchObject({
      messageKey: "taskAssignedDurationMessage",
      params: expect.objectContaining({ minutes: 30 }),
    });
  });
});

/**
 * B1 — eine TERMINIERTE Aufgabe entsteht still: nichts geht raus, und jede ihrer Fristen ankert am
 * geplanten Zeitpunkt statt am Stellen.
 */
describe("createTask — terminiert (wirksamAb)", () => {
  /** Die Daten, die tatsächlich in die Zeile geschrieben würden. */
  const written = () => taskCreateMock.mock.calls[0][0].data;

  it("meldet NICHTS und schreibt den geplanten Zeitpunkt — benachrichtigt wird erst der Poller", async () => {
    const morgen = new Date("2026-07-26T07:00:00Z");
    const res = await createTask(
      { ...base, holdUntil: new Date("2026-07-26T09:00:00Z"), wirksamAbAt: morgen.toISOString() },
      "herrin",
    );

    expect(res.ok).toBe(true);
    // Die Meldung IST das, was die Terminierung verschiebt — sie hier zu verschicken verriete die Aufgabe.
    expect(notifyMock).not.toHaveBeenCalled();
    expect(written().wirksamAb).toEqual(morgen);
    expect(written().benachrichtigtAt).toBeNull();
    // Ohne diese Spalte wüsste der Poller morgen nicht, wer die Aufgabe gestellt hat.
    expect(written().createdBy).toBe("herrin");
  });

  it("eine SOFORTIGE Aufgabe bleibt unverändert: Meldung raus, wirksamAb null", async () => {
    await createTask(base, "herrin");
    expect(notifyMock).toHaveBeenCalledWith("u1", expect.objectContaining({ subjectKey: "taskAssignedSubject" }));
    expect(written().wirksamAb).toBeNull();
    expect(written().benachrichtigtAt).toEqual(JETZT);
  });

  it("delayMinutes ist der zweite Weg zur selben Terminierung", async () => {
    await createTask({ ...base, delayMinutes: 90 }, "herrin");
    expect(written().wirksamAb).toEqual(new Date(JETZT.getTime() + 90 * 60_000));
  });

  it("das spätestmögliche Ende im Dauer-Modus ankert am Wirksamwerden", async () => {
    const morgen = new Date("2026-07-26T07:00:00Z");
    const res = await createTask({
      userId: "u1", title: "Plug tragen", holdDurationMin: 45, startGraceMin: 30,
      requirements: [{ type: "WEAR", categoryId: "c1" }], wirksamAbAt: morgen,
    }, "herrin");

    expect(res.ok).toBe(true);
    // 07:00 + 30 min Kulanz + 45 min Dauer. Ab `createdAt` gerechnet wäre die Schranke einen halben
    // Tag zu früh — der Poller hätte die Aufgabe längst als entschieden gemeldet.
    expect(written().holdUntil).toEqual(new Date("2026-07-26T08:15:00Z"));
  });

  it("eine Frist VOR dem Wirksamwerden wird abgewiesen, nicht still gestellt", async () => {
    const res = await createTask({
      ...base, holdUntil: new Date("2026-07-25T15:00:00Z"), wirksamAbAt: new Date("2026-07-26T07:00:00Z"),
    }, "herrin");
    expect(res).toMatchObject({ ok: false, error: "TASK_HOLD_UNTIL_TOO_SOON" });
  });

  it("ein unlesbarer Zeitpunkt ist ein Fehler, kein „sofort“", async () => {
    const res = await createTask({ ...base, wirksamAbAt: "morgen früh" }, "herrin");
    expect(res).toMatchObject({ ok: false, error: "TASK_INVALID_SEND_TIME" });
    expect(taskCreateMock).not.toHaveBeenCalled();
  });
});

describe("Änderung und Rückzug einer noch nicht ausgelösten Aufgabe bleiben still", () => {
  const versteckt = {
    id: "t1", userId: "u1", title: "Plug tragen", description: null,
    holdUntil: new Date("2026-07-26T09:00:00Z"), holdDurationMin: null, startGraceMin: 30,
    isPunishment: false, penaltyReason: null, createdAt: JETZT,
    wirksamAb: new Date("2026-07-26T07:00:00Z"), benachrichtigtAt: null,
    _count: { requirements: 1 },
  };

  it("updateTask meldet nichts", async () => {
    taskFindMock.mockResolvedValue(versteckt);
    const res = await updateTask("t1", "u1", { title: "Anders" }, "herrin");
    expect(res.ok).toBe(true);
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it("withdrawTask meldet nichts — sonst erführe der Träger von der Aufgabe durch ihre Rücknahme", async () => {
    taskFindMock.mockResolvedValue(versteckt);
    const res = await withdrawTask("t1", "u1", "herrin");
    expect(res.ok).toBe(true);
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it("eine bereits ausgelöste Aufgabe meldet ihren Rückzug weiterhin", async () => {
    taskFindMock.mockResolvedValue({ ...versteckt, benachrichtigtAt: JETZT });
    await withdrawTask("t1", "u1", "herrin");
    expect(notifyMock).toHaveBeenCalledWith("u1", expect.objectContaining({ subjectKey: "taskWithdrawnSubject" }));
  });
});

/**
 * REGRESSION (code-review B1): eine relative Frist muss am NULLPUNKT hängen, nicht am Stellen.
 *
 * Der Befund war, dass „in vier Stunden wirksam, sechs Stunden Zeit" beim Träger als zwei Stunden
 * ankam — die Verzögerung ging der Spanne ab, weil `deadlineFromDispatch` bei der Zustellung genau
 * `holdUntil - wirksamAb` erhält. Bei einer Frist kürzer als die Verzögerung war die Spanne sogar
 * negativ und die Aufgabe wurde mit `TASK_HOLD_UNTIL_TOO_SOON` abgewiesen.
 */
describe("terminierte Aufgabe — die Spanne bis zur Frist bleibt erhalten", () => {
  const written = () => taskCreateMock.mock.calls[0][0].data;

  it("ein absolutes Ende bleibt absolut", async () => {
    const morgen = new Date("2026-07-26T07:00:00Z");
    const ende = new Date("2026-07-26T09:00:00Z");
    await createTask({ ...base, holdUntil: ende, wirksamAbAt: morgen }, "herrin");
    expect(written().holdUntil).toEqual(ende);
    // Zwei Stunden ab dem Wirksamwerden — genau das erhält die Zustellung.
    expect(written().holdUntil.getTime() - written().wirksamAb.getTime()).toBe(2 * 3600_000);
  });

  it("eine Aufgabe OHNE Bedingungen darf nach ihrem Wirksamwerden enden", async () => {
    // Der Fall, der vorher als `TASK_HOLD_UNTIL_TOO_SOON` scheiterte: reine Textaufgabe, morgen
    // wirksam, zwei Stunden Zeit. `minEnd` ist hier der Nullpunkt, nicht „jetzt".
    const res = await createTask({
      ...base, holdUntil: new Date("2026-07-26T09:00:00Z"), wirksamAbAt: new Date("2026-07-26T07:00:00Z"),
    }, "herrin");
    expect(res.ok).toBe(true);
  });
});

/**
 * Löschen ist die einzige Aktion an einer Aufgabe, die nichts zurücklässt — deshalb ist die Frage
 * nicht „darf dieser Nutzer", sondern „darf diese ZEILE". Eine laufende Aufgabe zu löschen nähme dem
 * Träger eine Anweisung unter den Händen weg, eine abgeschlossene tilgte ein Urteil über ihn.
 */
describe("deleteTask — nur zurückgezogene, und dann vollständig", () => {
  const zurueckgezogen = { withdrawnAt: JETZT, proofs: [{ imageUrl: "/api/uploads/a.jpg" }, { imageUrl: null }] };

  beforeEach(() => taskDeleteMock.mockResolvedValue({ count: 1 }));

  it("löscht eine zurückgezogene Aufgabe", async () => {
    taskFindMock.mockResolvedValue(zurueckgezogen);
    const res = await deleteTask("t1", "u1");
    expect(res.ok).toBe(true);
  });

  /** Der Zustand steht in der WHERE-Klausel, nicht nur in der Prüfung davor: wird die Aufgabe
   *  zwischen Lesen und Schreiben erledigt gemeldet, trifft das Löschen null Zeilen. */
  it("der Rückzug steht in der Where-Klausel des Löschens", async () => {
    taskFindMock.mockResolvedValue(zurueckgezogen);
    await deleteTask("t1", "u1");
    expect(taskDeleteMock.mock.calls[0][0].where).toMatchObject({
      id: "t1", userId: "u1", withdrawnAt: { not: null },
    });
  });

  it("nimmt die Nachweis-Fotos mit — sie gehören zu dieser Aufgabe und zu nichts sonst", async () => {
    taskFindMock.mockResolvedValue(zurueckgezogen);
    await deleteTask("t1", "u1");
    expect(deleteFilesMock).toHaveBeenCalledWith(["/api/uploads/a.jpg", null]);
  });

  /** Erst löschen, dann die Dateien: schlägt das Löschen fehl, stünde die Aufgabe sonst ohne ihre
   *  Bilder da. Das Aufräumen selbst läuft fire-and-forget — geprüft wird die REIHENFOLGE. */
  it("entfernt die Dateien NACH der Zeile", async () => {
    taskFindMock.mockResolvedValue(zurueckgezogen);
    await deleteTask("t1", "u1");
    expect(taskDeleteMock.mock.invocationCallOrder[0]).toBeLessThan(deleteFilesMock.mock.invocationCallOrder[0]);
  });

  it("eine laufende Aufgabe wird nicht gelöscht", async () => {
    taskFindMock.mockResolvedValue({ withdrawnAt: null, proofs: [] });
    const res = await deleteTask("t1", "u1");
    expect(res).toMatchObject({ ok: false, status: 400, error: "TASK_NOT_WITHDRAWN" });
    expect(taskDeleteMock).not.toHaveBeenCalled();
    expect(deleteFilesMock).not.toHaveBeenCalled();
  });

  /** Trifft die Where-Klausel nichts, bleiben auch die Bilder liegen — der Riegel schützt beides.
   *  (Heute kann das nur eintreten, wenn die Zeile zwischen Lesen und Schreiben verschwindet: ein
   *  Rückzug wird nirgends zurückgenommen.) */
  it("trifft das Löschen null Zeilen, bleiben auch die Bilder liegen", async () => {
    taskFindMock.mockResolvedValue(zurueckgezogen);
    taskDeleteMock.mockResolvedValue({ count: 0 });
    const res = await deleteTask("t1", "u1");
    expect(res).toMatchObject({ ok: false, error: "TASK_NOT_WITHDRAWN" });
    expect(deleteFilesMock).not.toHaveBeenCalled();
  });

  it("fremde Aufgabe wird nicht gefunden (IDOR-Schutz)", async () => {
    taskFindMock.mockResolvedValue(null); // findFirst ist bereits auf userId gefiltert
    const res = await deleteTask("t1", "u1");
    expect(res).toMatchObject({ ok: false, status: 404, error: "TASK_NOT_FOUND" });
  });
});


/**
 * Verbucht wird von der HANDLUNG, die das Ergebnis feststellt — nicht erst zur Frist.
 *
 * Befund 17.08.2026: Strafaufgabe ohne Bedingungen, Nachweis angenommen 21:03, Selbstmeldung 21:04,
 * Frist am Folgetag 20:00. Erfüllt war sie um 21:04, verbucht wurde sie nicht: der Poller wählt über
 * `holdUntil <= jetzt`, und die Sichtung sah eine Minute vorher noch kein `completedAt`. 23 Stunden
 * lang stand `pendingPenalties: 1` für eine abgeleistete und angenommene Strafe.
 */
describe("completeTask — steht das Ergebnis fest, wird sofort verbucht", () => {
  beforeEach(() => {
    taskUpdateMock.mockResolvedValue({ count: 1 });
    taskUpdateOneMock.mockResolvedValue({});
    penaltyCloseMock.mockResolvedValue({ count: 1 });
    // Noch nicht gemeldet — die Sperre gegen die zweite Ergebnis-Mail.
    taskFindMock.mockResolvedValue({ resultNotifiedAt: null });
  });

  /** Der Nachlauf läuft `void` (er darf den Request nicht am SMTP aufhalten) — abgewartet wird sein
   *  WIRKEN, nicht sein Promise. */
  const settled = (fn: () => void) => vi.waitFor(fn);

  it("erfüllt → Ergebnis-Meldung und die Strafe ist abgehakt", async () => {
    evalMock.mockResolvedValue({ task: { id: "t1", title: "Fünfzig Zeilen" }, evaluation: { state: "done" } });
    await completeTask("t1", "u1");

    // `once: true` — eine wiederholte Selbstmeldung (Offline-Warteschlange) ist dieselbe Sache und
    // darf keine zweite Zeile hinterlassen.
    await settled(() => expect(notifyMock).toHaveBeenCalledWith("u1", expect.objectContaining({
      subjectKey: "taskDoneSubject",
      inbox: expect.objectContaining({ once: true }),
    })));
    // Auch die Keyholder-Hälfte der Meldung.
    await settled(() => expect(notifyControllersMock).toHaveBeenCalled());
    // Und die Zeile, die im Befund 23 Stunden zu spät kam.
    await settled(() => expect(penaltyCloseMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { taskId: "t1", status: "PUNISHED", erledigtAt: null },
    })));
    // Der Stempel, der den Poller von der Zeile fernhält.
    await settled(() => expect(taskUpdateOneMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "t1" }, data: { resultNotifiedAt: expect.any(Date) },
    })));
  });

  /**
   * Die Schranke, die den Befund NICHT in Gegenrichtung wiederholt.
   *
   * `aborted` ist endgültig — und zwar oft lange vor der Frist. Früh gemeldet und gestempelt sähe
   * der Poller die Zeile nie wieder: räumt die Keyholderin danach den Trage-Eintrag, stünde die
   * Aufgabe zur Frist auf `done`, aber niemand meldete es und keine Strafe schlösse sich.
   */
  it("abgebrochen → NICHTS wird früh verbucht, der Poller bleibt zuständig", async () => {
    evalMock.mockResolvedValue({ task: { id: "t1", title: "Fünfzig Zeilen" }, evaluation: { state: "aborted" } });
    await completeTask("t1", "u1");

    await expect(vi.waitFor(() => expect(notifyMock).toHaveBeenCalled(), { timeout: 60 })).rejects.toThrow();
    expect(penaltyCloseMock).not.toHaveBeenCalled();
    expect(taskUpdateOneMock).not.toHaveBeenCalled();
  });

  it("läuft noch → nichts wird verbucht", async () => {
    evalMock.mockResolvedValue({ task: { id: "t1", title: "Fünfzig Zeilen" }, evaluation: { state: "running" } });
    await completeTask("t1", "u1");

    await expect(vi.waitFor(() => expect(notifyMock).toHaveBeenCalled(), { timeout: 60 })).rejects.toThrow();
    expect(penaltyCloseMock).not.toHaveBeenCalled();
  });

  /** Schon gemeldet: eine nachgereichte Offline-Meldung darf keine ZWEITE Ergebnis-Mail auslösen —
   *  `once` hält nur die Posteingangs-Zeile einmalig, Mail und Push gehen unbedingt raus. */
  it("bereits gemeldet → keine zweite Ergebnis-Meldung", async () => {
    evalMock.mockResolvedValue({ task: { id: "t1", title: "Fünfzig Zeilen" }, evaluation: { state: "done" } });
    taskFindMock.mockResolvedValue({ resultNotifiedAt: JETZT });
    await completeTask("t1", "u1");

    await expect(vi.waitFor(() => expect(notifyMock).toHaveBeenCalled(), { timeout: 60 })).rejects.toThrow();
  });

  it("eine gescheiterte Verbuchung reisst die Meldung des Trägers nicht mit", async () => {
    evalMock.mockRejectedValue(new Error("DB weg"));
    const res = await completeTask("t1", "u1");

    expect(res.ok).toBe(true);
  });
});
