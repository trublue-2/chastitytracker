import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Die Guards des Aufgaben-Services. Wichtigster Fall: eine Aufgabe darf nicht so knapp gestellt
 * werden, dass sie im Moment ihrer Erstellung bereits gescheitert ist — dieselbe Fehlerklasse, die
 * `checkOrgasmWindowEnd` seinerzeit für die Orgasmus-Anforderung behoben hat.
 */

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    device: { findMany: vi.fn() },
    deviceCategory: { findMany: vi.fn() },
    task: { create: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn(), count: vi.fn() },
  },
}));
vi.mock("@/lib/notify", () => ({ notifyUser: vi.fn() }));
// Nur den Zufall festnageln — `utils` ist sonst reine Arithmetik und soll echt laufen.
vi.mock("@/lib/utils", async (orig) => ({ ...(await orig<object>()), generateKontrollCode: () => "12345" }));

import { createTask, updateTask, withdrawTask, completeTask, mergeTaskPatch, effectivePenaltyReason } from "./taskService";
import { prisma } from "@/lib/prisma";
import { notifyUser } from "@/lib/notify";

const userMock = prisma.user.findUnique as unknown as ReturnType<typeof vi.fn>;
const catMock = prisma.deviceCategory.findMany as unknown as ReturnType<typeof vi.fn>;
const devMock = prisma.device.findMany as unknown as ReturnType<typeof vi.fn>;
const taskCreateMock = prisma.task.create as unknown as ReturnType<typeof vi.fn>;
const taskFindMock = prisma.task.findFirst as unknown as ReturnType<typeof vi.fn>;
const taskUpdateMock = prisma.task.updateMany as unknown as ReturnType<typeof vi.fn>;
const taskCountMock = prisma.task.count as unknown as ReturnType<typeof vi.fn>;
const notifyMock = notifyUser as unknown as ReturnType<typeof vi.fn>;

const JETZT = new Date("2026-07-25T12:00:00Z");
const IN_DREI_STUNDEN = new Date("2026-07-25T15:00:00Z");

const base = { userId: "u1", title: "Wohnung staubsaugen", holdUntil: IN_DREI_STUNDEN };

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(JETZT);
  userMock.mockResolvedValue({ id: "u1" });
  taskCreateMock.mockResolvedValue({ id: "t1", title: "Wohnung staubsaugen", holdUntil: IN_DREI_STUNDEN });
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
});

describe("withdrawTask", () => {
  it("zieht zurück und meldet es", async () => {
    taskFindMock.mockResolvedValue({ id: "t1", userId: "u1", title: "T", withdrawnAt: null, completedAt: null });
    const res = await withdrawTask("t1", "u1", "herrin");

    expect(res.ok).toBe(true);
    expect(notifyMock).toHaveBeenCalledWith("u1", expect.objectContaining({ subjectKey: "taskWithdrawnSubject" }));
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
  const current = { title: "A", description: "d", holdUntil: JETZT, isPunishment: false, penaltyReason: null };

  it("undefined lässt unverändert, null löscht", () => {
    expect(mergeTaskPatch(current, {}).description).toBe("d");
    expect(mergeTaskPatch(current, { description: null }).description).toBeNull();
  });

  it("trimmt Texte", () => {
    expect(mergeTaskPatch(current, { title: "  B  " }).title).toBe("B");
  });
});
