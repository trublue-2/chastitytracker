import { prisma } from "@/lib/prisma";
import { serviceFail, type ServiceResult, type ServiceFailure } from "@/lib/serviceResult";
import { notifyUser, notifyControllers } from "@/lib/notify";
import { getControllersOfUser } from "@/lib/keyholder";
import { evaluateTasks, TASK_INCLUDE } from "@/lib/taskIntervals";
import { startDeadline, isTaskOpen } from "@/lib/tasks";
import {
  TASK_TITLE_MAX_LENGTH, TASK_DESCRIPTION_MAX_LENGTH, TASK_DEFAULT_START_GRACE_MIN,
  TASK_START_GRACE_RANGE, TASK_REQUIREMENT_TYPES, type TaskRequirementType,
} from "@/lib/constants";
import { formatDateTime } from "@/lib/utils";

/**
 * Aufgaben-Service — Anlegen, Ändern, Zurückziehen, Erledigt-Melden.
 *
 * Form (nicht Tabelle) übernommen von `verschlussAnforderungService.ts`. Zwei Dinge bewusst NICHT
 * kopiert:
 *  - das `updateMany`-Ersetzen beim Anlegen: Aufgaben koexistieren, sie verdrängen einander nicht.
 *  - `notifyHeimdallForUserId`: eine Aufgabe bewegt keinen Riegel, die Box geht sie nichts an.
 *
 * Der Fortschritt wird NICHT hier gestempelt, sondern in `src/lib/tasks.ts` aus den Einträgen
 * abgeleitet. Dieser Service verwaltet nur die Aufgabe selbst.
 */

export interface TaskRequirementInput {
  type: TaskRequirementType;
  categoryId?: string | null;
  deviceId?: string | null;
}

/** Normalisiert eine Bedingung auf die Form, die auch in der DB landet — EINE Stelle für die
 *  Nullungen. Ohne sie driften Dubletten-Schlüssel und gespeicherte Zeile auseinander: zwei
 *  KG_LOCKED-Bedingungen mit verschiedener `categoryId` sähen unterschiedlich aus, würden aber
 *  identisch gespeichert. */
function normalizeRequirement(r: TaskRequirementInput) {
  return {
    type: r.type,
    // Die Kategorie beschreibt nur eine Trage-Bedingung; „verschlossen" braucht sie nicht.
    categoryId: r.type === "WEAR" ? (r.categoryId ?? null) : null,
    deviceId: r.deviceId ?? null,
  };
}

export interface CreateTaskParams {
  userId: string;
  title: string;
  description?: string | null;
  holdUntil: Date;
  startGraceMin?: number;
  isPunishment?: boolean;
  penaltyReason?: string | null;
  requirements?: TaskRequirementInput[];
}

/** Änderbare Felder. `undefined` = unverändert; `null` löscht (Beschreibung, Straf-Anlass). */
export interface UpdateTaskParams {
  title?: string;
  description?: string | null;
  holdUntil?: Date;
  isPunishment?: boolean;
  penaltyReason?: string | null;
}

export interface MergedTask {
  title: string;
  description: string | null;
  holdUntil: Date;
  isPunishment: boolean;
  penaltyReason: string | null;
}

export function effectivePenaltyReason(isPunishment: boolean, reason: string | null | undefined): string | null {
  // Ein Straf-Anlass ohne Strafe ist ein leeres Versprechen in der Zeile. Bewusst hier statt zweimal
  // im Service: sonst setzt der Änderungs-Pfad einen Anlass, den der Anlege-Pfad verworfen hätte —
  // dieselbe Divergenz-Klasse wie beim Reinigungs-Flag der Verschluss-Anforderung.
  return isPunishment ? (reason?.trim() || null) : null;
}

/**
 * Führt Bestand und Änderung zusammen — PURE, damit die dryRun-Vorschau des MCP exakt das zeigt, was
 * der Commit schreibt. (Genau diese Trennung war der Fund aus dem Review der Verschluss-Anforderung:
 * eine eigene Nachrechnung in der Vorschau läuft irgendwann auseinander.)
 */
export function mergeTaskPatch(current: MergedTask, patch: UpdateTaskParams): MergedTask {
  const isPunishment = patch.isPunishment ?? current.isPunishment;
  return {
    title: patch.title !== undefined ? patch.title.trim() : current.title,
    description: patch.description !== undefined ? (patch.description?.trim() || null) : current.description,
    holdUntil: patch.holdUntil ?? current.holdUntil,
    isPunishment,
    penaltyReason: effectivePenaltyReason(
      isPunishment,
      patch.penaltyReason !== undefined ? patch.penaltyReason : current.penaltyReason,
    ),
  };
}

/** Titel/Beschreibung/Endzeit prüfen — geteilt von Anlegen und Ändern, damit beide Wege dieselben
 *  Grenzen durchsetzen. `minEnd` ist der früheste zulässige Endzeitpunkt; die Aufrufer wissen, was
 *  das in ihrem Kontext heisst (Anlegen: jetzt + Kulanz · Ändern: nach der Erstellung). */
function checkTaskFields(
  fields: { title: string; description: string | null; holdUntil: Date },
  minEnd: Date,
): ServiceFailure | null {
  const title = fields.title.trim();
  if (!title) return serviceFail(400, "TASK_TITLE_REQUIRED");
  if (title.length > TASK_TITLE_MAX_LENGTH) return serviceFail(400, "TASK_TITLE_TOO_LONG");
  if ((fields.description?.trim().length ?? 0) > TASK_DESCRIPTION_MAX_LENGTH) {
    return serviceFail(400, "TASK_DESCRIPTION_TOO_LONG");
  }
  // Die Endzeit muss so weit weg sein, dass die Kulanzfrist überhaupt hineinpasst — sonst wäre die
  // Aufgabe im Moment ihrer Erstellung schon gescheitert. Dieselbe Klasse Fehler, die
  // `checkOrgasmWindowEnd` für die Orgasmus-Anforderung behoben hat.
  if (fields.holdUntil.getTime() <= minEnd.getTime()) {
    return serviceFail(400, "TASK_HOLD_UNTIL_TOO_SOON");
  }
  return null;
}

/** Die geprüften Bedingungen in Speicher-Form — was `checkRequirements` zurückgibt und `createTask`
 *  unverändert anlegt. */
type NormalizedRequirement = ReturnType<typeof normalizeRequirement>;

/**
 * Bedingungen prüfen: Form, Besitz, keine Dubletten, kein KG als Trage-Bedingung.
 *
 * Gebündelt statt je Bedingung einzeln — drei Bedingungen ergaben sonst bis zu sechs serielle
 * Round-Trips für eine Handvoll IDs.
 *
 * Normalisiert wird EINMAL, im Formular-Durchgang, und das Ergebnis wandert weiter bis in
 * `prisma.create`. Vorher lief `normalizeRequirement` vier Mal über dieselbe Liste, und zwei
 * benachbarte Zeilen lasen einmal den rohen und einmal den normalisierten Wert — heute derselbe,
 * aber die Zusicherung „die Nullungen stehen an genau einer Stelle" hing damit an vier Lesern.
 *
 * Die FORM-Prüfungen sehen bewusst weiter den Rohwert: eine `categoryId` an „verschlossen" ist eine
 * Falscheingabe, die abgewiesen gehört — nach der Normalisierung wäre sie unsichtbar weggeputzt.
 */
async function checkRequirements(
  userId: string,
  reqs: TaskRequirementInput[],
): Promise<ServiceFailure | { ok: true; normalized: NormalizedRequirement[] }> {
  const seen = new Set<string>();
  const normalized: NormalizedRequirement[] = [];
  for (const r of reqs) {
    if (!(TASK_REQUIREMENT_TYPES as readonly string[]).includes(r.type)) {
      return serviceFail(400, "TASK_REQUIREMENT_INVALID");
    }
    // Eine Trage-Bedingung braucht ein Ziel; „verschlossen" ist für sich vollständig.
    if (r.type === "WEAR" && !r.categoryId && !r.deviceId) {
      return serviceFail(400, "TASK_REQUIREMENT_INVALID");
    }
    // Eine Kategorie an „verschlossen" ist bedeutungslos — still zu schlucken hiesse, dem Aufrufer
    // etwas anderes zu speichern, als er geschickt hat.
    if (r.type === "KG_LOCKED" && r.categoryId) {
      return serviceFail(400, "TASK_REQUIREMENT_INVALID");
    }
    const n = normalizeRequirement(r);
    const key = `${n.type}:${n.deviceId ?? ""}:${n.categoryId ?? ""}`;
    if (seen.has(key)) return serviceFail(400, "TASK_DUPLICATE_REQUIREMENT");
    seen.add(key);
    normalized.push(n);
  }

  const deviceIds = [...new Set(normalized.map((r) => r.deviceId).filter((v): v is string => !!v))];
  const categoryIds = [...new Set(normalized.map((r) => r.categoryId).filter((v): v is string => !!v))];

  const [devices, categories] = await Promise.all([
    deviceIds.length
      ? prisma.device.findMany({
          where: { id: { in: deviceIds }, userId, archivedAt: null },
          select: { id: true, category: { select: { isBuiltIn: true } } },
        })
      : Promise.resolve([]),
    categoryIds.length
      ? prisma.deviceCategory.findMany({
          where: { id: { in: categoryIds }, userId },
          select: { id: true, isBuiltIn: true },
        })
      : Promise.resolve([]),
  ]);
  const deviceById = new Map(devices.map((d) => [d.id, d]));
  const categoryById = new Map(categories.map((c) => [c.id, c]));

  for (const n of normalized) {
    if (n.deviceId) {
      const dev = deviceById.get(n.deviceId);
      if (!dev) return serviceFail(400, "INVALID_DEVICE");
      // Auch an der GERÄTE-Tür: ein Trage-Auftrag auf das KG-Gerät wäre unerfüllbar, weil ein
      // WEAR_BEGIN darauf abgewiesen wird (prepareWearEntry → WEAR_DEVICE_KG). Ohne diese Prüfung
      // liesse sich die Regel über `deviceId` umgehen.
      if (n.type === "WEAR" && dev.category?.isBuiltIn) {
        return serviceFail(400, "TASK_REQUIREMENT_KG_CATEGORY");
      }
    }
    if (n.categoryId) {
      const cat = categoryById.get(n.categoryId);
      if (!cat) return serviceFail(400, "INVALID_CATEGORY");
      // Der KG ist keine Trage-Kategorie — er wird über type=KG_LOCKED gefordert.
      if (cat.isBuiltIn) return serviceFail(400, "TASK_REQUIREMENT_KG_CATEGORY");
    }
  }
  return { ok: true, normalized };
}

/** Legt eine Aufgabe samt Bedingungen an und benachrichtigt den Sub. */
export async function createTask(p: CreateTaskParams): Promise<ServiceResult<{ id: string }>> {
  const now = new Date();
  // Bewusst OHNE `clamp`: dessen `Math.round(value) || fallback` macht aus einer ausdrücklich
  // gesetzten 0 („sofort anfangen") den Default 30 — der dokumentierte Wertebereich beginnt aber bei
  // 0 und wäre damit unerreichbar.
  const graceMin = Math.min(
    TASK_START_GRACE_RANGE.max,
    Math.max(TASK_START_GRACE_RANGE.min, Math.round(p.startGraceMin ?? TASK_DEFAULT_START_GRACE_MIN)),
  );
  const reqs = p.requirements ?? [];

  // Erst die reinen Parameter, dann die DB — wie in `createVerschlussAnforderung`.
  // Ohne Bedingungen gibt es nichts anzulegen: `holdUntil` ist dann eine schlichte Frist, die
  // Kulanz spielt keine Rolle.
  const fieldError = checkTaskFields(
    { title: p.title, description: p.description ?? null, holdUntil: p.holdUntil },
    reqs.length > 0 ? new Date(now.getTime() + graceMin * 60_000) : now,
  );
  if (fieldError) return fieldError;

  const user = await prisma.user.findUnique({ where: { id: p.userId }, select: { id: true } });
  if (!user) return serviceFail(404, "USER_NOT_FOUND");

  const checked = await checkRequirements(p.userId, reqs);
  if (!checked.ok) return checked;

  const isPunishment = p.isPunishment ?? false;
  const task = await prisma.task.create({
    data: {
      userId: p.userId,
      title: p.title.trim(),
      description: p.description?.trim() || null,
      holdUntil: p.holdUntil,
      startGraceMin: graceMin,
      isPunishment,
      penaltyReason: effectivePenaltyReason(isPunishment, p.penaltyReason),
      requirements: {
        create: checked.normalized.map((r, i) => ({ ...r, sortOrder: i })),
      },
    },
  });

  await notifyUser(p.userId, {
    subjectKey: "taskAssignedSubject",
    messageKey: "taskAssignedMessage",
    params: { title: task.title, until: formatDateTime(task.holdUntil) },
    alwaysNotify: true,
    // Die Nachricht ZEIGT auf die Aufgabe, statt ihre Beschreibung zu kopieren — der Posteingang
    // liest sie beim Anzeigen frisch. Titel und Frist bleiben bewusst Parameter: eine Nachricht ist
    // die Aufzeichnung dessen, was zu diesem Zeitpunkt gesagt wurde, und eine spätere Änderung trägt
    // `taskChanged` als eigene Zeile nach.
    // `once`: eine Aufgabe wird genau einmal gestellt. Ein Retry nach einem Absturz darf keine
    // zweite, dauerhafte Zeile hinterlassen.
    inbox: { ref: { type: "task", id: task.id }, once: true },
  });

  return { ok: true, data: { id: task.id } };
}

/**
 * Ändert eine offene Aufgabe. Deckt „Endzeit während der Nutzung verschieben" (Issue #29) ab — weil
 * der Fortschritt abgeleitet und nicht eingefroren ist, wirkt das sofort korrekt.
 *
 * `userId` ist Pflicht, nicht optional: ein vergessener Besitz-Check wäre ein IDOR, den kein
 * Typfehler auffängt.
 */
export async function updateTask(
  id: string,
  userId: string,
  patch: UpdateTaskParams,
): Promise<ServiceResult<{ id: string; userId: string }>> {
  const t = await prisma.task.findFirst({
    where: { id, userId },
    include: { _count: { select: { requirements: true } } },
  });
  if (!t) return serviceFail(404, "TASK_NOT_FOUND");
  if (t.withdrawnAt || t.completedAt) return serviceFail(400, "TASK_NOT_EDITABLE");

  const next = mergeTaskPatch(t, patch);
  // Die neue Endzeit muss in der ZUKUNFT liegen. Gegen `createdAt` zu prüfen genügt nicht: bei einer
  // vor Tagen gestellten Aufgabe liesse sich die Frist damit auf einen längst vergangenen Zeitpunkt
  // setzen — der Sub bekäme sofort ein Versäumnis, ohne je handeln zu können. Ein Vertipper im Datum
  // reicht dafür. Verkürzen auf „gleich fällig" bleibt möglich (Issue #29), nur eben nicht rückwärts.
  //
  // UND nicht unter die STARTFRIST: `holdUntil <= createdAt + startGraceMin` ist kein strenger
  // Sonderfall, sondern ein widersprüchlicher Zustand — die Aufgabe verlangt Deckung bis zu einem
  // Zeitpunkt, zu dem der Sub noch gar nicht angefangen haben muss. `createTask` verbietet ihn
  // deshalb; `updateTask` liess ihn zu, und dahinter lagen drei verschiedene Fehlurteile:
  //   · Sub tut nichts        → Zustand bleibt `pending` (kein Endzustand), der Poller meldet
  //                             trotzdem „versäumt" und stempelt das dauerhaft.
  //   · Sub legt danach an    → `running`, obwohl die Frist längst vorbei ist.
  //   · dito + Selbstmeldung  → **`done`**. Die Aufgabe gilt als erfüllt, obwohl das Gerät vor der
  //                             Frist nie getragen wurde (`coversContinuously` gibt bei
  //                             `from >= until` früh `true` zurück — die zu deckende Spanne ist leer).
  // Nur bei Aufgaben MIT Bedingungen: ohne sie gibt es nichts anzulegen, und die Kulanz ist ohne
  // Bedeutung — dieselbe Unterscheidung wie in `createTask`.
  const minEnd = t._count.requirements > 0
    ? new Date(Math.max(Date.now(), startDeadline(t).getTime()))
    : new Date();
  const fieldError = checkTaskFields(next, minEnd);
  if (fieldError) return fieldError;

  // Zustand in der Where-Klausel: läuft parallel ein Rückzug oder eine Erledigt-Meldung, greift
  // diese Änderung nicht mehr — statt sie über den frisch gesetzten Zustand zu schreiben.
  const res = await prisma.task.updateMany({
    where: { id, userId, withdrawnAt: null, completedAt: null },
    data: next,
  });
  if (res.count === 0) return serviceFail(400, "TASK_NOT_EDITABLE");

  await notifyUser(userId, {
    subjectKey: "taskChangedSubject",
    messageKey: "taskChangedMessage",
    params: { title: next.title, until: formatDateTime(next.holdUntil) },
    alwaysNotify: true,
    // KEIN `once`: mehrere Änderungen an derselben Aufgabe sind legitim und jede gehört als eigene
    // Zeile in den Verlauf (so auch bei der Verschluss-Anforderung).
    inbox: { ref: { type: "task", id } },
  });

  return { ok: true, data: { id, userId } };
}

/** Zieht eine Aufgabe zurück (Keyholder). Bewusst getrennt von „vorzeitig abgelegt": das eine ist ein
 *  Entschluss der Keyholderin, das andere ein Versäumnis des Subs — und ein Rückzug wird nie ein
 *  Vergehen (siehe Zustand `withdrawn` in `tasks.ts`). */
export async function withdrawTask(id: string, userId: string): Promise<ServiceResult<{ userId: string }>> {
  const t = await prisma.task.findFirst({ where: { id, userId }, select: { title: true } });
  if (!t) return serviceFail(404, "TASK_NOT_FOUND");

  // Ein Aufruf statt Lesen-dann-Schreiben: der offene Zustand steht in der Where-Klausel, ein
  // zweiter Rückzug trifft damit null Zeilen (Vorbild: withdrawOrgasmusAnforderungById).
  const res = await prisma.task.updateMany({
    where: { id, userId, withdrawnAt: null },
    data: { withdrawnAt: new Date() },
  });
  if (res.count === 0) return serviceFail(400, "TASK_NOT_EDITABLE");

  await notifyUser(userId, {
    subjectKey: "taskWithdrawnSubject",
    messageKey: "taskWithdrawnMessage",
    params: { title: t.title },
    alwaysNotify: true,
    inbox: { ref: { type: "task", id }, once: true },
  });
  return { ok: true, data: { userId } };
}

/**
 * Der Sub meldet die Aufgabe als erledigt.
 *
 * Die Idempotenz steckt in der Where-Klausel (`completedAt: null`): ein Wiedereinspielen aus der
 * Offline-Warteschlange trifft null Zeilen und verschiebt den Zeitstempel nicht.
 *
 * Bei Aufgaben MIT Bedingungen ist das die zweite Hälfte der Erfüllung — die erste (durchgehend
 * getragen) leitet `evaluateTask` aus den Einträgen ab. Der Textteil („ist die Wohnung sauber?") ist
 * maschinell nicht prüfbar; die Meldung ist die Selbstverpflichtung darauf.
 */
export async function completeTask(
  id: string,
  userId: string,
  note?: string | null,
): Promise<ServiceResult<{ id: string }>> {
  const trimmed = note?.trim() || null;
  if ((trimmed?.length ?? 0) > TASK_DESCRIPTION_MAX_LENGTH) {
    return serviceFail(400, "TASK_DESCRIPTION_TOO_LONG");
  }

  const res = await prisma.task.updateMany({
    where: { id, userId, withdrawnAt: null, completedAt: null },
    data: { completedAt: new Date(), ...(trimmed ? { completionNote: trimmed } : {}) },
  });
  if (res.count === 0) {
    // Entweder gibt es sie nicht (fremd/gelöscht) oder sie ist schon gemeldet/zurückgezogen.
    const exists = await prisma.task.count({ where: { id, userId } });
    return exists === 0 ? serviceFail(404, "TASK_NOT_FOUND") : { ok: true, data: { id } };
  }
  return { ok: true, data: { id } };
}

/**
 * Meldet das Ergebnis fälliger Aufgaben — einmal, an Sub und Keyholder.
 *
 * Läuft im bestehenden Minuten-Tick. Ungefährlich für die anderen Poller-Blöcke, weil er
 * ausschliesslich die eigene Tabelle liest und schreibt; der Zustand selbst bleibt abgeleitet, hier
 * wird nur der VERSAND gestempelt (`resultNotifiedAt`).
 *
 * Ohne diesen Block erführen beide Seiten erst beim nächsten App-Start, ob die Aufgabe erfüllt wurde.
 */
export async function processDueTasks(now: Date): Promise<void> {
  const due = await prisma.task.findMany({
    where: { holdUntil: { lte: now }, withdrawnAt: null, resultNotifiedAt: null },
    orderBy: { holdUntil: "asc" },
    take: 50,
    include: TASK_INCLUDE,
  });
  if (due.length === 0) return;

  // Je User EINMAL auswerten: `evaluateTasks` liest die Trage-/Verschluss-Einträge des Users, und die
  // sind für alle seine Aufgaben dieselben.
  const byUser = new Map<string, typeof due>();
  for (const task of due) {
    const list = byUser.get(task.userId);
    if (list) list.push(task);
    else byUser.set(task.userId, [task]);
  }

  for (const [userId, tasks] of byUser) {
    try {
      // Empfänger und Anzeigename hängen nur am User, nicht an der einzelnen Aufgabe — einmal holen,
      // sonst sind es bei fünf fälligen Aufgaben zehn Abfragen statt zwei, in jedem Minuten-Tick.
      const [evaluated, controllers, user] = await Promise.all([
        evaluateTasks(userId, tasks, now),
        getControllersOfUser(userId),
        prisma.user.findUnique({ where: { id: userId }, select: { username: true } }),
      ]);
      const username = user?.username ?? "";

      // Je Aufgabe stempeln, direkt nach IHRER Zustellung — nicht gesammelt am Ende der Schleife.
      // Der Stempel ist die einzige Einmal-Zusage, die es hier gibt (eine Dedup im Posteingang
      // existiert nicht). Gesammelt am Schluss lag zwischen der ersten verschickten Mail und dem
      // Schreiben ein Fenster über ALLE Aufgaben des Nutzers: ein Prozess-Neustart darin — Deploy,
      // OOM — und im nächsten Tick bekamen Sub und Keyholder jede davon ein zweites Mal. Jetzt ist
      // das Fenster eine Aufgabe breit.
      const markNotified = (taskId: string) =>
        prisma.task.update({ where: { id: taskId }, data: { resultNotifiedAt: now } });

      for (const e of evaluated) {
        // Bedingungen hielten, nur die Selbstmeldung fehlt: den Sub daran ERINNERN statt ihn zu
        // überspringen. Ein blosses `continue` liesse die Zeile für immer in dieser Abfrage stehen —
        // sie bekäme nie ein `resultNotifiedAt`, sortierte als älteste nach vorn und besetzte den
        // `take`-Deckel dauerhaft. 50 solcher Aufgaben, und die Ergebnismeldung stünde für ALLE
        // Nutzer still. Der Keyholder erfährt hier nichts: es ist noch kein Ergebnis.
        if (e.evaluation.awaitingConfirmation) {
          await notifyUser(userId, {
            subjectKey: "taskAwaitingSubject",
            messageKey: "taskAwaitingMessage",
            params: { title: e.task.title },
            inbox: { ref: { type: "task", id: e.task.id }, once: true },
          });
          await markNotified(e.task.id);
          continue;
        }

        // Nur ENDZUSTÄNDE melden. Eine noch offene Aufgabe (`pending`/`partial`) hat kein Ergebnis,
        // über das sich berichten liesse — sie als „versäumt" zu melden UND zu stempeln, hiesse ein
        // Urteil zu fällen, das die Auswertung selbst noch nicht gefällt hat, und es gegen jede
        // spätere Korrektur zu versiegeln (das Strafbuch bleibt live abgeleitet und widerspräche der
        // Meldung).
        //
        // Erreichbar war das nur über eine unter die Startfrist verkürzte `holdUntil` — den Weg hat
        // `updateTask` inzwischen zu. Der Riegel bleibt trotzdem: eine stumme Verzögerung ist der
        // richtige Ausgang für einen Zustand, den wir hier nicht erwarten, eine falsche
        // Endmeldung nicht. Ohne Stempel greift der nächste Tick sie wieder auf, sobald sie
        // tatsächlich entschieden ist.
        if (isTaskOpen(e.evaluation.state)) {
          console.warn("[processDueTasks] fällig, aber ohne Endzustand — Meldung verschoben:", e.task.id, e.evaluation.state);
          continue;
        }

        const done = e.evaluation.state === "done";
        await notifyUser(userId, {
          subjectKey: done ? "taskDoneSubject" : "taskFailedSubject",
          messageKey: done ? "taskDoneMessage" : "taskFailedMessage",
          params: { title: e.task.title },
          // `once` ist hier die DAUERHAFTE Einmal-Zusage. `resultNotifiedAt` allein ist ein
          // Zeitstempel, der beim Schreiben scheitern kann; diese Sperre sitzt an der Nachricht
          // selbst und überlebt einen Neustart zwischen Zustellung und Stempel.
          inbox: { ref: { type: "task", id: e.task.id }, once: true },
        });
        await notifyControllers(controllers, {
          subjectKey: done ? "taskDoneSubjectKeyholder" : "taskFailedSubjectKeyholder",
          messageKey: done ? "taskDoneMessageKeyholder" : "taskFailedMessageKeyholder",
          params: { username, title: e.task.title },
        });
        await markNotified(e.task.id);
      }
    } catch (err) {
      // Nie den Tick abbrechen — der nächste Lauf versucht es erneut (resultNotifiedAt bleibt null).
      console.error("[processDueTasks]", userId, (err as Error).message);
    }
  }
}
