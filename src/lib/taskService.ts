import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { serviceFail, type ServiceResult, type ServiceFailure } from "@/lib/serviceResult";
import { notifyUser, notifyControllers } from "@/lib/notify";
import { getControllersOfUser } from "@/lib/keyholder";
import { evaluateTasks, TASK_INCLUDE } from "@/lib/taskIntervals";
import type { PrismaTx } from "@/lib/queries";
import { startDeadline, isTaskResultFinal } from "@/lib/tasks";
import {
  TASK_TITLE_MAX_LENGTH, TASK_DESCRIPTION_MAX_LENGTH, clampStartGrace,
  TASK_REQUIREMENT_TYPES, TASK_PROOF_MAX,
  TASK_PROOF_DESCRIPTION_MAX_LENGTH, type TaskRequirementType,
} from "@/lib/constants";
import { formatDateTime, generateKontrollCode } from "@/lib/utils";
import { structuredLog } from "@/lib/serverLog";

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

/** Ein gefordertes Nachweis-Foto, wie der Keyholder es stellt (Issue #39). */
export interface TaskProofInput {
  /** Was auf dem Bild zu sehen sein muss. Pflicht — ohne sie weiss der Sub nicht, was er fotografieren soll. */
  description: string;
  /** Handschriftlichen Zufallscode verlangen? Nur damit ist der Nachweis maschinell prüfbar; ohne
   *  Code geht er zur Sichtung an den Keyholder. */
  requireCode?: boolean;
}

/**
 * Prüft die geforderten Nachweise und bringt sie in Speicher-Form — inklusive der Code-Vergabe.
 *
 * Dieselbe Form wie `checkRequirements` darüber: prüfen und in Speicher-Form zurückgeben, damit der
 * Aufrufer nicht ein zweites Mal normalisiert.
 *
 * Die Reihenfolge der Eingabe IST die Soll-Reihenfolge (`sortOrder`) — sie trägt die Kernforderung
 * der Anforderung: Verschluss vor Plug vor Rechnungen.
 */
function normalizeProof(p: TaskProofInput, sortOrder: number) {
  const requireCode = p.requireCode ?? false;
  return {
    sortOrder,
    description: p.description.trim(),
    requireCode,
    // Der Code entsteht HIER und nicht beim Einreichen: er ist die Vorgabe, die der Sub im Bild
    // zeigen muss, und muss feststehen, bevor er die Aufgabe zu sehen bekommt.
    code: requireCode ? generateKontrollCode() : null,
  };
}
type NormalizedProof = ReturnType<typeof normalizeProof>;

function checkProofs(proofs: TaskProofInput[]): ServiceFailure | { ok: true; rows: NormalizedProof[] } {
  if (proofs.length > TASK_PROOF_MAX) return serviceFail(400, "TASK_TOO_MANY_PROOFS");
  const rows: NormalizedProof[] = [];
  for (const [i, p] of proofs.entries()) {
    const n = normalizeProof(p, i);
    if (!n.description || n.description.length > TASK_PROOF_DESCRIPTION_MAX_LENGTH) {
      return serviceFail(400, "TASK_PROOF_INVALID");
    }
    rows.push(n);
  }
  return { ok: true, rows };
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
  /** Geforderte Nachweis-Fotos, in der Reihenfolge, in der sie entstehen müssen. */
  proofs?: TaskProofInput[];
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
  db: PrismaTx,
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
      ? db.device.findMany({
          where: { id: { in: deviceIds }, userId, archivedAt: null },
          select: { id: true, category: { select: { isBuiltIn: true } } },
        })
      : Promise.resolve([]),
    categoryIds.length
      ? db.deviceCategory.findMany({
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

/** Eine geprüfte Aufgabe, fertig zum Schreiben. Zwischenstand zwischen {@link checkTask} und
 *  {@link writeTask} — er trägt genau das, was `task.create` braucht, und nichts mehr. */
export interface CheckedTask {
  data: Prisma.TaskCreateInput;
}

/**
 * Prüft die Parameter einer neuen Aufgabe — Feldgrenzen, Besitz von Gerät und Kategorie — und bringt
 * sie in Speicher-Form.
 *
 * Getrennt vom Schreiben, weil das Prüfen DREI bis VIER Abfragen kostet und nichts festschreibt.
 * Zusammen mit dem Schreiben in einer Transaktion belegte es die einzige SQLite-Verbindung dieser
 * App für die gesamte Dauer — jede andere Anfrage wartete hinter einer Prüfung, die nur liest. Und
 * die Ablehnung („Frist zu früh") fällt so ausserhalb an, wo sie ohne Umweg über einen abgebrochenen
 * Vorgang zurückgegeben werden kann.
 */
export async function checkTask(db: PrismaTx, p: CreateTaskParams): Promise<ServiceResult<CheckedTask>> {
  const now = new Date();
  const graceMin = clampStartGrace(p.startGraceMin);
  const reqs = p.requirements ?? [];

  // Erst ALLE reinen Parameter, dann die DB — wie in `createVerschlussAnforderung`. Ohne Bedingungen
  // gibt es nichts anzulegen: `holdUntil` ist dann eine schlichte Frist, die Kulanz spielt keine Rolle.
  const fieldError = checkTaskFields(
    { title: p.title, description: p.description ?? null, holdUntil: p.holdUntil },
    reqs.length > 0 ? new Date(now.getTime() + graceMin * 60_000) : now,
  );
  if (fieldError) return fieldError;

  // Die Nachweise sind reine Rechnerei — vor die Abfragen, damit eine kaputte Liste ohne eine
  // einzige Abfrage abgewiesen wird.
  const checkedProofs = checkProofs(p.proofs ?? []);
  if (!checkedProofs.ok) return checkedProofs;

  const user = await db.user.findUnique({ where: { id: p.userId }, select: { id: true } });
  if (!user) return serviceFail(404, "USER_NOT_FOUND");

  const checked = await checkRequirements(db, p.userId, reqs);
  if (!checked.ok) return checked;

  const isPunishment = p.isPunishment ?? false;
  return {
    ok: true,
    data: {
      data: {
        user: { connect: { id: p.userId } },
        title: p.title.trim(),
        description: p.description?.trim() || null,
        holdUntil: p.holdUntil,
        startGraceMin: graceMin,
        isPunishment,
        penaltyReason: effectivePenaltyReason(isPunishment, p.penaltyReason),
        requirements: { create: checked.normalized.map((r, i) => ({ ...r, sortOrder: i })) },
        proofs: { create: checkedProofs.rows },
      },
    },
  };
}

/**
 * Schreibt die geprüfte Aufgabe. Ein einziger Vorgang — genau so viel, wie in eine fremde
 * Transaktion gehört; `tx` ist ausdrücklich das ERSTE Argument, damit es niemand vergisst (dasselbe
 * Muster wie `createOeffnenEntryTx`).
 *
 * Und sie meldet NICHTS: eine Mail lässt sich nicht zurückrollen, gehört also hinter das Commit —
 * {@link createTask} tut das, ein grösserer Vorgang wie `punishWithTask` schickt seine eigene, EINE
 * Nachricht. Titel und Frist kommen mit zurück, damit der Aufrufer sie dafür nicht ein zweites Mal
 * aus seinen Rohdaten zusammensucht.
 */
export async function writeTask(tx: PrismaTx, checked: CheckedTask): Promise<{ id: string; title: string; holdUntil: Date }> {
  const task = await tx.task.create({ data: checked.data });
  return { id: task.id, title: task.title, holdUntil: task.holdUntil };
}

/** Legt eine Aufgabe samt Bedingungen an und benachrichtigt den Sub. */
export async function createTask(p: CreateTaskParams): Promise<ServiceResult<{ id: string }>> {
  const checked = await checkTask(prisma, p);
  if (!checked.ok) return checked;
  const task = await writeTask(prisma, checked.data);

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
 * Die Ergebnis-Meldung einer entschiedenen Aufgabe: an den Sub UND an die Keyholder, plus der
 * Stempel, der die Einmal-Zusage trägt.
 *
 * EINE Stelle, weil es zwei Auslöser gibt: den Minuten-Tick (die Frist läuft ab) und die Sichtung
 * eines Nachweises (ein Mensch entscheidet, `taskProofService.ts`). Beide melden dasselbe Ereignis
 * mit denselben vier Texten — getrennt geschrieben liefen sie beim nächsten Textwechsel auseinander,
 * und niemand bekäme davon einen Fehler.
 *
 * „Settle", nicht „notify": die Funktion MELDET nicht nur, sie schliesst das Ergebnis ab — sie
 * stempelt den Versand (`resultNotifiedAt`) und schliesst die Strafe, deren Aufgabe erfüllt wurde.
 * Alles drei gehört zusammen, und der Name soll nicht verschweigen, was hier geschrieben wird.
 */
export async function settleTaskResult(opts: {
  userId: string;
  taskId: string;
  title: string;
  done: boolean;
  controllers: { id: string }[];
  username: string;
  now: Date;
  /** Höchstens EINE Zeile dieses Texts im Posteingang. Der Poller setzt das (ein Retry nach einem
   *  Absturz darf keine zweite hinterlassen); die SICHTUNG nicht — dort ist eine Wiederholung ein
   *  korrigiertes Urteil, und das muss der Sub sehen. Ohne die Unterscheidung bliebe nach
   *  „abgelehnt → doch angenommen → wieder abgelehnt" das falsche Ergebnis als letzte Zeile stehen. */
  once: boolean;
}): Promise<void> {
  const { userId, taskId, title, done, controllers, username, now, once } = opts;
  await notifyUser(userId, {
    subjectKey: done ? "taskDoneSubject" : "taskFailedSubject",
    messageKey: done ? "taskDoneMessage" : "taskFailedMessage",
    params: { title },
    // `once` ist die DAUERHAFTE Einmal-Zusage. Der Stempel unten ist ein Zeitstempel, der beim
    // Schreiben scheitern kann; diese Sperre sitzt an der Nachricht selbst.
    inbox: { ref: { type: "task", id: taskId }, once },
  });
  await notifyControllers(controllers, {
    subjectKey: done ? "taskDoneSubjectKeyholder" : "taskFailedSubjectKeyholder",
    messageKey: done ? "taskDoneMessageKeyholder" : "taskFailedMessageKeyholder",
    params: { username, title },
  });
  await prisma.task.update({ where: { id: taskId }, data: { resultNotifiedAt: now } });

  // War die Aufgabe eine STRAFE, ist die Strafe mit ihr abgearbeitet. Hier und nicht im Poller:
  // dieser Helfer ist der EINE Trichter, durch den jeder Endzustand läuft — der Minuten-Tick ebenso
  // wie die Sichtung eines Nachweises, die eine wartende Aufgabe nachträglich erfüllt. Am Poller
  // allein hinge eine spät angenommene Sichtung in der Luft, und die Strafe bliebe für immer offen.
  // War die Aufgabe eine STRAFE, ist die Strafe mit ihr abgearbeitet.
  if (done) await closePenaltyForFulfilledTask(taskId, now);
}

/**
 * Schliesst die Strafe, deren Aufgabe gerade erfüllt wurde.
 *
 * Das ist der Kreis, den das Feature bis hierher offen liess: die Aufgabe war erfüllt, die Strafe
 * stand trotzdem als offen im Strafbuch, bis der Keyholder von Hand „erledigt" klickte. Die App
 * WEISS aber, dass sie abgearbeitet ist — die Aufgabe IST ihre Definition von Erfüllung.
 *
 * Nur bei einer ERFÜLLTEN Aufgabe (der Aufrufer prüft das). Eine versäumte Strafaufgabe lässt die
 * Strafe offen: sie ist nicht abgearbeitet, und ihr Versäumnis wird zusätzlich ein eigenes Vergehen.
 * `status: "PUNISHED"` und `erledigtAt: null` in der Bedingung: ein zurückgezogenes Urteil wird nicht
 * nachträglich zur erledigten Strafe, und ein zweiter Lauf überschreibt den ersten Zeitpunkt nicht.
 *
 * WIRFT NIE — wie `runDeviceCheck`: der Aufrufer hat seine Meldung zu diesem Zeitpunkt verschickt UND
 * gestempelt. Ein Fehler hier darf sie nicht mitreissen, sonst wiederholte der nächste Tick eine
 * Nachricht, die der Sub längst hat. Er bleibt als Logzeile sichtbar, statt still zu verschwinden.
 */
async function closePenaltyForFulfilledTask(taskId: string, now: Date): Promise<void> {
  try {
    const res = await prisma.strafeRecord.updateMany({
      where: { taskId, status: "PUNISHED", erledigtAt: null },
      data: { erledigtAt: now },
    });
    if (res.count > 0) structuredLog("task", "penalty_closed", { taskId });
  } catch (err) {
    structuredLog("task", "penalty_close_failed", { taskId, error: (err as Error).message });
  }
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

        // Nur ENDZUSTÄNDE melden — und zwar POSITIV geprüft (`isTaskResultFinal`), nicht als „nicht
        // offen". Der Unterschied ist keine Stilfrage: `awaitingReview` (Nachweise eingereicht,
        // Sichtung der Keyholderin steht aus) ist weder offen noch entschieden. Gegen `isTaskOpen`
        // geprüft fiele er durch, landete im Endzustands-Zweig und würde als „versäumt" gemeldet UND
        // gestempelt — eine falsche, unwiderrufliche Meldung an beide Seiten, während die
        // Keyholderin noch gar nicht geurteilt hat. Wer einen weiteren Zustand ergänzt, muss ihn in
        // `isTaskResultFinal` bewusst aufnehmen, statt dass er hier stillschweigend als Fehlschlag
        // durchgeht.
        //
        // Ohne Stempel greift der nächste Tick die Aufgabe wieder auf, sobald sie entschieden ist —
        // eine stumme Verzögerung ist der richtige Ausgang, eine falsche Endmeldung nicht.
        // Nachweise liegen vor, aber die Sichtung der Keyholderin steht aus: SIE ist am Zug, also
        // bekommt sie die Meldung — und die Zeile wird gestempelt.
        //
        // Nicht stempeln wäre hier derselbe Stau, den `c77dec2` schon einmal behoben hat: die Zeile
        // bliebe ewig in der Abfrage, sortierte als älteste nach vorn und besetzte den `take`-Deckel.
        // Sichtet die Keyholderin ein paar Tage nicht, stünde ab 50 solchen Aufgaben die
        // Ergebnismeldung für ALLE Nutzer still.
        //
        // Der Stempel bedeutet damit „gemeldet", nicht „entschieden". Das ERGEBNIS nach der Sichtung
        // verschickt folgerichtig die Sichtung selbst (Etappe 4) — der Poller sieht die Zeile nicht
        // wieder, und das ist richtig: ein menschliches Urteil soll nicht bis zum nächsten Tick warten.
        // Läuft die automatische Code-Prüfung noch, ist gar nichts zu melden: sie kann das Ergebnis
        // in Sekunden auf „erfüllt" drehen. Meldeten wir hier „bitte sichten" UND stempelten, wäre
        // die Aufgabe für den Poller erledigt — das echte Ergebnis erführe danach niemand mehr.
        // Ohne Stempel greift der nächste Tick sie wieder auf, dann mit Ergebnis.
        if (e.evaluation.proofCheckPending) {
          continue;
        }

        if (e.evaluation.state === "awaitingReview") {
          await notifyControllers(controllers, {
            subjectKey: "taskReviewSubjectKeyholder",
            messageKey: "taskReviewMessageKeyholder",
            params: { username, title: e.task.title },
          });
          await markNotified(e.task.id);
          continue;
        }

        if (!isTaskResultFinal(e.evaluation.state)) {
          console.warn("[processDueTasks] fällig, aber ohne Endzustand — Meldung verschoben:", e.task.id, e.evaluation.state);
          continue;
        }

        await settleTaskResult({
          userId, taskId: e.task.id, title: e.task.title,
          done: e.evaluation.state === "done", controllers, username, now, once: true,
        });
      }
    } catch (err) {
      // Nie den Tick abbrechen — der nächste Lauf versucht es erneut (resultNotifiedAt bleibt null).
      console.error("[processDueTasks]", userId, (err as Error).message);
    }
  }
}
