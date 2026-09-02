import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { dropJudgments } from "@/lib/offenseJudgmentCleanup";
import { serviceFail, type ServiceResult, type ServiceFailure } from "@/lib/serviceResult";
import { notifyUser, notifyControllers, type NotifyContent, type NotifyRecipient } from "@/lib/notify";
import { actorColumn, type MessageActor } from "@/lib/messageService";
import { getControllerAudience } from "@/lib/keyholder";
import { notifyLateProofsForTask } from "@/lib/taskProofNotify";
import { evaluateTasks, evaluateTaskById, SUB_VISIBLE_WHERE, TASK_INCLUDE } from "@/lib/taskIntervals";
import type { PrismaTx } from "@/lib/queries";
import { parseTriggerAt, computeDelayedTrigger, deadlineFromDispatch, dueForDispatchWhere, isHiddenFromSub } from "@/lib/delayedTrigger";
import { startDeadline, taskAnchor, earliestActionableAt, earliestTaskEnd, isTaskResultFinal, effectiveProofOrderMatters, type TaskLike } from "@/lib/tasks";
import {
  TASK_TITLE_MAX_LENGTH, TASK_DESCRIPTION_MAX_LENGTH, clampStartGrace, clampHoldDuration,
  clampProofDueOffset,
  TASK_REQUIREMENT_TYPES, TASK_PROOF_MAX,
  TASK_PROOF_DESCRIPTION_MAX_LENGTH, type TaskRequirementType,
} from "@/lib/constants";
import { formatDateTime, generateKontrollCode } from "@/lib/utils";
import { structuredLog } from "@/lib/serverLog";
import { deleteUploadedFiles } from "@/lib/imageUtils";
import { NOT_PAUSED_WHERE, isHealthHoldActive } from "@/lib/healthHold";

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
  /** EIGENE Fälligkeit in Minuten ab dem Nullpunkt der Aufgabe. Fehlend/`null` = wie bisher: offen
   *  bis zum Ende der Aufgabe. Später als dieses Ende ist sie nicht setzbar
   *  (`TASK_PROOF_DUE_AFTER_END`) — sonst wäre sie eine Frist, die nie greift. */
  dueOffsetMin?: number | null;
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
    // `clampProofDueOffset` und NICHT `clampHoldDuration`: die beiden unterscheiden sich an der
    // unteren Kante, und dort liegt der Schaden — eine getippte 0 würde dort auf eine Minute
    // angehoben und die Aufgabe wäre versäumt, bevor der Träger das Handy weglegt. Hier heisst 0
    // „keine eigene Frist" (siehe dort).
    dueOffsetMin: clampProofDueOffset(p.dueOffsetMin) ?? null,
  };
}
type NormalizedProof = ReturnType<typeof normalizeProof>;

function checkProofs(
  proofs: TaskProofInput[],
  /** Nullpunkt und Ende der Aufgabe — die eigene Fälligkeit eines Nachweises zählt ab dem einen und
   *  darf das andere nicht überschreiten. Als Argumente und nicht aus der Zeile gelesen: `checkTask`
   *  prüft, BEVOR geschrieben wird. */
  window: { anchor: Date; holdUntil: Date },
): ServiceFailure | { ok: true; rows: NormalizedProof[] } {
  if (proofs.length > TASK_PROOF_MAX) return serviceFail(400, "TASK_TOO_MANY_PROOFS");
  const rows: NormalizedProof[] = [];
  for (const [i, p] of proofs.entries()) {
    const n = normalizeProof(p, i);
    if (!n.description || n.description.length > TASK_PROOF_DESCRIPTION_MAX_LENGTH) {
      return serviceFail(400, "TASK_PROOF_INVALID");
    }
    // Eine Fälligkeit HINTER dem Ende der Aufgabe ist keine Frist, sondern eine Zusage, die nie
    // greift: `proofDeadline` deckelt sie ohnehin auf das Ende, und der Poller sucht über die Spalte
    // `holdUntil`. Statt sie still zu kappen, wird sie abgewiesen — die Keyholderin soll sehen, dass
    // ihre Angabe nicht das bedeutet, was sie meint.
    if (n.dueOffsetMin !== null
      && window.anchor.getTime() + n.dueOffsetMin * 60_000 > window.holdUntil.getTime()) {
      return serviceFail(400, "TASK_PROOF_DUE_AFTER_END");
    }
    rows.push(n);
  }
  return { ok: true, rows };
}

export interface CreateTaskParams {
  userId: string;
  title: string;
  description?: string | null;
  /** Das Ende. Im Dauer-Modus wird es NICHT gelesen, sondern aus `holdDurationMin` gerechnet — der
   *  Aufrufer muss dort keinen Zeitpunkt mehr ausrechnen (und könnte es auch nicht richtig). */
  holdUntil?: Date;
  /** Dauer-Modus: Haltezeit in Minuten ab dem tatsächlichen Beginn. Schliesst `holdUntil` aus. */
  holdDurationMin?: number | null;
  startGraceMin?: number;
  isPunishment?: boolean;
  penaltyReason?: string | null;
  requirements?: TaskRequirementInput[];
  /** Geforderte Nachweis-Fotos, in der Reihenfolge, in der sie entstehen müssen. */
  proofs?: TaskProofInput[];
  /** Müssen die Aufnahmezeiten dieser Reihenfolge folgen? Fehlend = ja, wie bisher. */
  proofOrderMatters?: boolean;
  /** TERMINIERUNG, verzögert um so viele Minuten (>0). Fehlt/0 = sofort (sofern kein `wirksamAbAt`). */
  delayMinutes?: number | null;
  /** TERMINIERUNG auf einen absoluten Zeitpunkt (ISO-String oder Date). Hat Vorrang vor
   *  `delayMinutes`. Dieselben zwei Formen wie bei der Verschluss-Anforderung. */
  wirksamAbAt?: string | Date | null;
}

/** Änderbare Felder. `undefined` = unverändert; `null` löscht (Beschreibung, Straf-Anlass). */
export interface UpdateTaskParams {
  title?: string;
  description?: string | null;
  /** Neues festes Ende — nur im klassischen Modus wirksam (siehe {@link mergeTaskPatch}). */
  holdUntil?: Date;
  /** Neue Haltedauer in Minuten — nur im Dauer-Modus wirksam. */
  holdDurationMin?: number;
  isPunishment?: boolean;
  penaltyReason?: string | null;
}

export interface MergedTask {
  title: string;
  description: string | null;
  holdUntil: Date;
  holdDurationMin: number | null;
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
export function mergeTaskPatch(
  current: MergedTask,
  patch: UpdateTaskParams,
  /** Woran der Dauer-Modus sein spätestmögliches Ende hängt. Bewusst NEBEN `current` und nicht darin:
   *  `MergedTask` ist die Schreib-Form (`data: next`), und diese Felder ändern sich nie. */
  anchor: { createdAt: Date; startGraceMin: number; wirksamAb: Date | null },
): MergedTask {
  const isPunishment = patch.isPunishment ?? current.isPunishment;
  // DER MODUS BLEIBT. Eine Aufgabe wechselt nicht zwischen „festes Ende" und „Dauer ab dem Anlegen" —
  // aus demselben Grund, aus dem `edit_task` Bedingungen und Nachweise nicht ändert: der Sub hat
  // etwas anderes gestellt bekommen, als er dann erfüllen müsste. Änderbar ist nur die ZAHL des
  // jeweiligen Modus; die Angabe zum anderen Modus fällt still weg, statt ihn umzuschalten.
  // Nullish und nicht `=== null`: „keine Dauer" ist der klassische Modus, und ob das als `null` oder
  // als fehlendes Feld ankommt, darf nicht den Modus umdrehen. Mit dem strengen Vergleich landete ein
  // `undefined` im Dauer-Zweig und rechnete das Ende gegen `undefined` — heraus kam ein `Invalid Date`,
  // das bis in die Datenbank durchgelaufen wäre.
  const holdDurationMin = current.holdDurationMin == null
    ? null
    : clampHoldDuration(patch.holdDurationMin) ?? current.holdDurationMin;
  return {
    title: patch.title !== undefined ? patch.title.trim() : current.title,
    description: patch.description !== undefined ? (patch.description?.trim() || null) : current.description,
    // Im Dauer-Modus ist das Ende ABGELEITET — gerechnet wie beim Anlegen (`checkTask`), damit die
    // obere Schranke auch nach einer Änderung hält.
    holdUntil: holdDurationMin !== null
      ? new Date(startDeadline(anchor).getTime() + holdDurationMin * 60_000)
      : patch.holdUntil ?? current.holdUntil,
    holdDurationMin,
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

/** Was {@link checkTaskUpdate} an der bestehenden Zeile mitgelesen haben will — die EINE Quelle für
 *  beide Leser (`updateTask` und die dryRun-Vorschau in `mcpEditTask`). Aus derselben Not wie
 *  `TASK_INCLUDE`: eine zweite Abschrift des `include` fiele erst auf, wenn die Prüfung ins Leere
 *  greift. */
export const TASK_EDIT_INCLUDE = { _count: { select: { requirements: true } } } as const;

/** Was an der BESTEHENDEN Zeile über die Zulässigkeit einer Änderung entscheidet — genau die Form,
 *  die beide Aufrufer mit {@link TASK_EDIT_INCLUDE} ohnehin aus Prisma bekommen, damit sie die Zeile
 *  unverändert durchreichen können. Alle Spalten über `Pick`, statt sie hier abzuschreiben; eigen ist
 *  nur der `_count`, den `TaskLike` nicht kennt. Die Bedingungen zählen daraus als blosses Ja/Nein,
 *  und diese Ableitung steht EINMAL in der Funktion statt an jeder Aufrufstelle. */
export interface TaskEditTarget
  extends Pick<TaskLike, "createdAt" | "startGraceMin" | "wirksamAb" | "withdrawnAt" | "completedAt"> {
  _count: { requirements: number };
}

/**
 * Prüft eine Änderung — Zustand der Zeile und Feldgrenzen der zusammengeführten Fassung.
 *
 * Vom Schreiben getrennt aus demselben Grund wie {@link checkTask} von {@link writeTask}: die
 * dryRun-Vorschau des MCP (`mcpEditTask`) ruft sie auf, statt ihre Schranken abzuschreiben. Genau
 * das war hier der Fehler — die Vorschau kannte nur `withdrawnAt` und versprach Erfolg für eine
 * ERLEDIGTE Aufgabe wie für jede gerissene Titel-, Beschreibungs- und Fristen-Grenze; der Commit
 * antwortete dann mit 400. Sie schreibt nichts und fragt nichts ab.
 *
 * `next` kommt von aussen aus {@link mergeTaskPatch}, das beide Wege ohnehin teilen: die Vorschau
 * ZEIGT die zusammengeführte Fassung und braucht sie deshalb auch im Fehlerfall — hier den Patch
 * entgegenzunehmen hiesse, sie zweimal zusammenzuführen.
 *
 * `now` kommt ebenfalls von aussen, wie bei `checkLockEnd`/`checkOrgasmWindowEnd`: `mcpEditTask`
 * verankert die relative Frist bereits an einem Zeitpunkt, und gegen einen zweiten, minimal späteren
 * geprüft könnte eine gerade eben gesetzte Frist an ihrer eigenen Untergrenze scheitern.
 */
export function checkTaskUpdate(task: TaskEditTarget, next: MergedTask, now: Date): ServiceFailure | null {
  if (task.withdrawnAt || task.completedAt) return serviceFail(400, "TASK_NOT_EDITABLE");
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
  // Nicht unter den NULLPUNKT: bei einer terminierten Aufgabe ist das `wirksamAb`, nicht „jetzt".
  // Ohne das liesse sich das Ende einer für morgen geplanten Aufgabe auf heute Abend ziehen — bei
  // der Zustellung verschöbe `deadlineFromDispatch` die (negative) Spanne in die Vergangenheit, und
  // derselbe Tick meldete die eben erst zugestellte Aufgabe als versäumt. Genau die Grösse, die
  // `earliestActionableAt` benennt — dieselbe, an der `edit_task` eine relative Frist verankert.
  const minEnd = task._count.requirements > 0
    ? new Date(Math.max(now.getTime(), startDeadline(task).getTime()))
    : earliestActionableAt(task, now);
  return checkTaskFields(next, minEnd);
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
  /** Der geplante Auslöse-Zeitpunkt, `null` = sofort. Als eigenes Feld neben der Schreib-Form, weil
   *  die AUFRUFER daran ihre eine Entscheidung treffen: selbst melden (sofort) oder dem Poller
   *  überlassen (terminiert). Aus `data` herausgelesen wäre es ein `Date | string | null | undefined`
   *  aus dem Prisma-Typ, das jeder Aufrufer erneut zurechtbiegen müsste. */
  wirksamAb: Date | null;
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
export async function checkTask(
  db: PrismaTx,
  p: CreateTaskParams,
  /** WER stellt — wandert nach `Task.createdBy` und von dort an eine verspätete Zustellung. Als
   *  eigenes Argument und kein Feld von `p`: die Route reicht den rohen Request-Body durch, und in
   *  einem Bag wäre der Absender von aussen setzbar (dieselbe Begründung wie in `kontrolleService`). */
  actor: MessageActor,
): Promise<ServiceResult<CheckedTask>> {
  const now = new Date();

  // Gesundheits-Halt: die eine Bremse, die über allem steht. HIER und nicht in `createTask`, damit
  // die MCP-Vorschau (`mcpCreateTask` ruft `checkTask`) dieselbe Absage zeigt statt Erfolg für einen
  // Commit zu versprechen, der mit 409 endet. Das Gate der Zustellung (`dueForDispatchWhere`) fasst
  // nur TERMINIERTE Zeilen; ohne diese Prüfung ginge eine sofort gestellte Aufgabe mitten in der
  // Pause hinaus, während ihr terminierter Zwilling wartet.
  if (await isHealthHoldActive(p.userId, db)) return serviceFail(409, "HEALTH_HOLD_ACTIVE");

  const graceMin = clampStartGrace(p.startGraceMin);
  const holdDurationMin = clampHoldDuration(p.holdDurationMin) ?? null;
  const reqs = p.requirements ?? [];

  // Der FEHLERCODE bleibt hier, das Parsen teilen sich die Dienste (`parseTriggerAt`).
  const wirksamAbParsed = parseTriggerAt(p.wirksamAbAt);
  if (wirksamAbParsed === "invalid") return serviceFail(400, "TASK_INVALID_SEND_TIME");
  const { wirksamAb, benachrichtigtAt } = computeDelayedTrigger(now, {
    delayMinutes: p.delayMinutes, wirksamAbAt: wirksamAbParsed,
  });
  /** Der Nullpunkt dieser Aufgabe — dieselbe Form, die `taskAnchor` später aus der Zeile liest. */
  const anchor = { createdAt: now, startGraceMin: graceMin, wirksamAb };

  // Der Dauer-Modus braucht etwas, woran die Uhr starten kann. Ohne Bedingung gibt es das nicht —
  // dann bleibt nur ein Zeitpunkt (siehe `TASK_HOLD_DURATION_WITHOUT_REQUIREMENTS`).
  if (holdDurationMin !== null && reqs.length === 0) {
    return serviceFail(400, "TASK_HOLD_DURATION_WITHOUT_REQUIREMENTS");
  }
  // Im Dauer-Modus schreibt die Spalte das SPÄTESTMÖGLICHE Ende: später als bis zur Kulanzfrist darf
  // gar nicht begonnen werden, also ist Startfrist + Dauer die obere Schranke. Sie muss stimmen —
  // die Vorauswahl des Pollers sucht über die Spalte und dürfte sonst eine fällige Aufgabe verpassen.
  // Bei einer TERMINIERTEN Aufgabe hängt die Startfrist an `wirksamAb`, also auch diese Schranke.
  const holdUntil = holdDurationMin !== null
    ? new Date(startDeadline(anchor).getTime() + holdDurationMin * 60_000)
    : p.holdUntil;
  if (!holdUntil) return serviceFail(400, "TASK_HOLD_MISSING");

  // Erst ALLE reinen Parameter, dann die DB — wie in `createVerschlussAnforderung`. Ohne Bedingungen
  // gibt es nichts anzulegen: `holdUntil` ist dann eine schlichte Frist, die Kulanz spielt keine Rolle.
  const fieldError = checkTaskFields(
    { title: p.title, description: p.description ?? null, holdUntil },
    // Über `startDeadline` wie in `updateTask`: die Startfrist ist EINE Regel, keine Addition, die
    // jede Prüfstelle für sich hinschreibt. Ohne Bedingungen bleibt der blosse Nullpunkt — eine für
    // morgen früh terminierte Aufgabe muss trotzdem nach ihrem eigenen Wirksamwerden enden, sonst
    // wäre sie im Moment der Zustellung schon versäumt.
    reqs.length > 0 ? startDeadline(anchor) : (wirksamAb ?? now),
  );
  if (fieldError) return fieldError;

  // Die Nachweise sind reine Rechnerei — vor die Abfragen, damit eine kaputte Liste ohne eine
  // einzige Abfrage abgewiesen wird. Der Nullpunkt ist derselbe, gegen den `taskAnchor` später
  // misst: eine für morgen früh terminierte Aufgabe darf „in 30 Minuten" fordern, ohne dass diese
  // 30 Minuten heute Abend verstreichen.
  //
  // Gegen das FRÜHESTMÖGLICHE Ende geprüft, nicht gegen die Spalte — die Begründung steht bei
  // `earliestTaskEnd`. Über den geteilten Helfer und nicht als eigener Ternär: die dryRun-Vorschau
  // des MCP zieht dieselbe Schranke, und zwei Fassungen davon waren genau der Grund, warum sie im
  // Dauer-Modus gar keine zog.
  const earliestEnd = earliestTaskEnd({ holdUntil, holdDurationMin }, taskAnchor(anchor));
  const checkedProofs = checkProofs(p.proofs ?? [], { anchor: taskAnchor(anchor), holdUntil: earliestEnd });
  if (!checkedProofs.ok) return checkedProofs;

  const user = await db.user.findUnique({ where: { id: p.userId }, select: { id: true } });
  if (!user) return serviceFail(404, "USER_NOT_FOUND");

  const checked = await checkRequirements(db, p.userId, reqs);
  if (!checked.ok) return checked;

  const isPunishment = p.isPunishment ?? false;
  return {
    ok: true,
    data: {
      wirksamAb,
      data: {
        user: { connect: { id: p.userId } },
        title: p.title.trim(),
        description: p.description?.trim() || null,
        holdUntil,
        startGraceMin: graceMin,
        holdDurationMin,
        isPunishment,
        penaltyReason: effectivePenaltyReason(isPunishment, p.penaltyReason),
        requirements: { create: checked.normalized.map((r, i) => ({ ...r, sortOrder: i })) },
        proofs: { create: checkedProofs.rows },
        proofOrderMatters: effectiveProofOrderMatters(p.proofOrderMatters),
        createdBy: actorColumn(actor),
        wirksamAb,
        benachrichtigtAt, // sofort = jetzt benachrichtigt; terminiert = der Poller übernimmt
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
export async function writeTask(tx: PrismaTx, checked: CheckedTask): Promise<TaskNoticeSource & { id: string }> {
  const task = await tx.task.create({ data: checked.data });
  return {
    id: task.id,
    title: task.title,
    holdUntil: task.holdUntil,
    holdDurationMin: task.holdDurationMin,
    createdAt: task.createdAt,
    startGraceMin: task.startGraceMin,
    wirksamAb: task.wirksamAb,
    isPunishment: task.isPunishment,
  };
}

/** Was eine Aufgaben-Nachricht braucht, um ihre Frist zu benennen. */
export interface TaskNoticeSource {
  title: string;
  holdUntil: Date;
  holdDurationMin: number | null;
  createdAt: Date;
  startGraceMin: number;
  /** Der Nullpunkt, an dem die Kulanzfrist hängt — die Nachricht nennt sie im Dauer-Modus. */
  wirksamAb: Date | null;
  /** Als Strafe gestellt? Entscheidet, WELCHE der beiden Meldungen rausgeht (siehe
   *  {@link taskAssignmentNotice}). */
  isPunishment: boolean;
}

/**
 * Die Frist-Angabe einer Aufgaben-Nachricht — die EINE Stelle, an der die beiden Modi in Worte
 * gefasst werden.
 *
 * Im Dauer-Modus wäre ein blosses „Frist: 21:15" schlicht falsch: das ist das spätestmögliche Ende
 * und gilt nur, wenn der Sub die Kulanz voll ausreizt. Was ihn bindet, sind zwei andere Zahlen — wie
 * LANGE zu halten ist und bis wann er begonnen haben muss. Deshalb ein eigener Textbaustein statt
 * eines umgedeuteten Parameters.
 *
 * Die Dauer reist als MINUTEN-Zahl, nicht als fertiger Text: die Nachricht wird in der Sprache des
 * EMPFÄNGERS gerendert (`notifyUser`), ein hier formatierter Zeitraum käme in der des Servers an.
 */
export function taskNoticeDeadline(task: Pick<TaskNoticeSource, "holdUntil" | "holdDurationMin" | "createdAt" | "startGraceMin" | "wirksamAb">):
  | { durationMode: true; params: { minutes: number; until: string } }
  | { durationMode: false; params: { until: string } } {
  return task.holdDurationMin
    ? {
        durationMode: true,
        params: { minutes: task.holdDurationMin, until: formatDateTime(startDeadline(task)) },
      }
    : { durationMode: false, params: { until: formatDateTime(task.holdUntil) } };
}

/**
 * Die Meldung „dir ist eine Aufgabe gestellt" — die EINE Stelle, an der sie entsteht.
 *
 * Sie geht an ZWEI Zeitpunkten raus: beim Stellen (sofort wirksame Aufgabe) und beim Auslösen einer
 * TERMINIERTEN Aufgabe aus dem Minuten-Tick. Getrennt geschrieben liefen die beiden beim nächsten
 * Textwechsel auseinander — und die verspätete Zustellung ist genau der Weg, den niemand von Hand
 * nachprüft.
 *
 * Die Strafaufgabe ist derselbe Vorgang mit anderen Worten und deshalb ein Zweig statt einer zweiten
 * Funktion: sonst müsste der Poller wissen, welchen der beiden Texte er zu wählen hat, und wüsste es
 * nur, solange es jemand nachträgt.
 */
export function taskAssignmentNotice(
  task: TaskNoticeSource & { id: string },
  actor: MessageActor,
): NotifyContent {
  const deadline = taskNoticeDeadline(task);
  const penalty = task.isPunishment;
  return {
    subjectKey: penalty ? "penaltyTaskSubject" : "taskAssignedSubject",
    messageKey: penalty
      ? (deadline.durationMode ? "penaltyTaskDurationMessage" : "penaltyTaskMessage")
      : (deadline.durationMode ? "taskAssignedDurationMessage" : "taskAssignedMessage"),
    params: { title: task.title, ...deadline.params },
    alwaysNotify: true,
    // Die Nachricht ZEIGT auf die Aufgabe, statt ihre Beschreibung zu kopieren — der Posteingang
    // liest sie beim Anzeigen frisch. Titel und Frist bleiben bewusst Parameter: eine Nachricht ist
    // die Aufzeichnung dessen, was zu diesem Zeitpunkt gesagt wurde, und eine spätere Änderung trägt
    // `taskChanged` als eigene Zeile nach.
    // `once`: eine Aufgabe wird genau einmal gestellt. Ein Retry nach einem Absturz darf keine
    // zweite, dauerhafte Zeile hinterlassen.
    inbox: { ref: { type: "task", id: task.id }, once: true, actor },
  };
}

/**
 * Legt eine Aufgabe samt Bedingungen an und benachrichtigt den Sub.
 *
 * `actor` ist WER stellt (Sitzung bzw. {@link AI_AUTHOR}) — als eigenes Argument wie bei allen
 * übrigen Diensten. Er wandert zusätzlich in die Spalte `createdBy`, weil eine TERMINIERTE Aufgabe
 * erst der Poller zustellt und ihren Absender sonst raten müsste. Die späteren Meldungen aus dem
 * Poller (erfüllt/versäumt/bitte melden) sind dagegen BEFUNDE der App und tragen bewusst keinen Namen.
 */
export async function createTask(
  p: CreateTaskParams,
  actor: MessageActor,
): Promise<ServiceResult<{ id: string; scheduledFor: string | null }>> {
  const checked = await checkTask(prisma, p, actor);
  if (!checked.ok) return checked;
  const task = await writeTask(prisma, checked.data);

  // Terminiert: NICHTS melden. Die Meldung IST das, was die Terminierung verschiebt — sie hier
  // trotzdem zu verschicken verriete die Aufgabe, die der Träger noch nicht kennen soll.
  if (!checked.data.wirksamAb) await notifyUser(p.userId, taskAssignmentNotice(task, actor));

  // `scheduledFor` mit zurück, wie bei Kontroll- und Verschluss-Anforderung: der MCP nennt dem
  // Agenten den Auslöse-Zeitpunkt, und er muss GENAU der sein, der in der Zeile steht. Rechnete der
  // Aufrufer ihn selbst nach, täte er es mit seiner eigenen Uhr — bei `delayMinutes` wäre die
  // gemeldete Zeit dann eine andere als die gespeicherte.
  return { ok: true, data: { id: task.id, scheduledFor: checked.data.wirksamAb?.toISOString() ?? null } };
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
  actor: MessageActor,
): Promise<ServiceResult<{ id: string; userId: string }>> {
  const t = await prisma.task.findFirst({
    where: { id, userId },
    include: TASK_EDIT_INCLUDE,
  });
  if (!t) return serviceFail(404, "TASK_NOT_FOUND");

  const next = mergeTaskPatch(t, patch, t);
  const problem = checkTaskUpdate(t, next, new Date());
  if (problem) return problem;

  // Zustand in der Where-Klausel: läuft parallel ein Rückzug oder eine Erledigt-Meldung, greift
  // diese Änderung nicht mehr — statt sie über den frisch gesetzten Zustand zu schreiben.
  const res = await prisma.task.updateMany({
    where: { id, userId, withdrawnAt: null, completedAt: null },
    data: next,
  });
  if (res.count === 0) return serviceFail(400, "TASK_NOT_EDITABLE");

  // Eine noch nicht ausgelöste Aufgabe darf ihre eigene Änderung NICHT melden — die Meldung verriete
  // die Aufgabe, deren Terminierung genau das verhindern soll (siehe `isHiddenFromSub`). Zugestellt
  // wird sie ohnehin erst später, und dann in der geänderten Fassung.
  // Die Zeile, wie sie jetzt auf der Platte steht — einmal zusammengeführt statt an jeder Stelle
  // neu, damit ein neues Feld in `mergeTaskPatch` nicht in einer der Kopien still fehlt.
  const merged = { ...next, id, createdAt: t.createdAt, startGraceMin: t.startGraceMin, wirksamAb: t.wirksamAb };

  if (!isHiddenFromSub(t)) {
    const deadline = taskNoticeDeadline(merged);
    await notifyUser(userId, {
      subjectKey: "taskChangedSubject",
      messageKey: deadline.durationMode ? "taskChangedDurationMessage" : "taskChangedMessage",
      params: { title: next.title, ...deadline.params },
      alwaysNotify: true,
      // KEIN `once`: mehrere Änderungen an derselben Aufgabe sind legitim und jede gehört als eigene
      // Zeile in den Verlauf (so auch bei der Verschluss-Anforderung).
      inbox: { ref: { type: "task", id }, actor },
    });
  }

  // Rückt das Ende NACH VORN, wird aus einem rechtzeitig eingereichten Nachweis rückwirkend ein
  // verspäteter, der auf ein Urteil wartet — Begründung und die Frage „warum nur beim Vorrücken"
  // stehen bei `notifyLateProofsForTask`.
  //
  // Fire-and-forget wie auf dem Einreiche-Weg (`submitTaskProof`): dahinter steht ein SMTP-Versand
  // je Empfänger und je betroffenem Nachweis. Die Antwort auf die Änderung hängt nicht davon ab, und
  // die Funktion wirft nie und stempelt sich selbst.
  if (next.holdUntil < t.holdUntil) void notifyLateProofsForTask(merged, userId);

  return { ok: true, data: { id, userId } };
}

/** Zieht eine Aufgabe zurück (Keyholder). Bewusst getrennt von „vorzeitig abgelegt": das eine ist ein
 *  Entschluss der Keyholderin, das andere ein Versäumnis des Subs — und ein Rückzug wird nie ein
 *  Vergehen (siehe Zustand `withdrawn` in `tasks.ts`). */
export async function withdrawTask(id: string, userId: string, actor: MessageActor): Promise<ServiceResult<{ userId: string; releasedJudgments: number }>> {
  const t = await prisma.task.findFirst({
    where: { id, userId },
    select: { title: true, wirksamAb: true, benachrichtigtAt: true, completedAt: true },
  });
  if (!t) return serviceFail(404, "TASK_NOT_FOUND");

  // Ein Aufruf statt Lesen-dann-Schreiben: der offene Zustand steht in der Where-Klausel, ein
  // zweiter Rückzug trifft damit null Zeilen (Vorbild: withdrawOrgasmusAnforderungById).
  //
  // Das URTEIL geht mit — die Gegenrichtung zu `judge_offense reopen`, wo der Rückzug des Urteils
  // die Aufgabe mitnimmt; Begründung an `dropJudgments`.
  //
  // NUR wenn der Träger sie nicht schon erfüllt hat. Zwei Schranken, weil eine nicht reicht:
  //
  // - `completedAt` ist SEINE Meldung „ich habe das getan". Sie steht, sobald er meldet.
  // - `erledigtAt` am Urteil ist die Verbuchung der APP, und die passiert erst, wenn der Poller die
  //   Aufgabe nach ihrem Ende abschliesst (`closePenaltyForFulfilledTask`, `holdUntil <= jetzt`).
  //
  // Dazwischen liegt bei einer Aufgabe mit langer Frist ein ganzes Wochenende: gemeldet am Freitag,
  // verbucht am Sonntag. Nur auf `erledigtAt` zu schauen hiesse, in genau diesem Fenster ein Urteil
  // über eine ABGELEISTETE Strafe zu löschen — und damit zu bestreiten, was er getan hat.
  const alreadyDone = t.completedAt !== null;
  const released = await prisma.$transaction(async (tx) => {
    const res = await tx.task.updateMany({
      where: { id, userId, withdrawnAt: null },
      data: { withdrawnAt: new Date() },
    });
    if (res.count === 0) return null;
    if (alreadyDone) return 0;

    // `status: "PUNISHED"` wie beim Geschwister `closePenaltyForFulfilledTask`: beide Abfragen gehen
    // über dieselbe Beziehung und sollen dieselbe Menge meinen.
    const openJudgments = await tx.strafeRecord.findMany({
      where: { userId, taskId: id, status: "PUNISHED", erledigtAt: null },
      select: { refId: true },
    });
    return dropJudgments(tx, userId, openJudgments.map((j) => j.refId));
  });
  if (released === null) return serviceFail(400, "TASK_NOT_EDITABLE");

  // Wie bei der Änderung: einen Rückzug zu melden, bevor die Aufgabe ausgelöst hat, verriete sie —
  // der Träger erführe von einer Anweisung nur dadurch, dass sie zurückgenommen wurde.
  if (!isHiddenFromSub(t)) {
    await notifyUser(userId, {
      subjectKey: "taskWithdrawnSubject",
      messageKey: "taskWithdrawnMessage",
      params: { title: t.title },
      alwaysNotify: true,
      inbox: { ref: { type: "task", id }, once: true, actor },
    });
  }
  return { ok: true, data: { userId, releasedJudgments: released } };
}

/**
 * Löscht eine zurückgezogene Aufgabe endgültig — der Weg, die Liste sauber zu halten.
 *
 * NUR ZURÜCKGEZOGENE, und das ist die eigentliche Regel dieser Funktion. Eine laufende Aufgabe zu
 * löschen nähme dem Träger eine Anweisung unter den Händen weg; eine abgeschlossene zu löschen
 * tilgte ein Urteil über ihn. Der Rückzug ist die Entscheidung der Keyholderin, diese Aufgabe zu
 * verwerfen — erst danach ist nichts mehr da, das jemandem gehört.
 *
 * Der Zustand steht ZUSÄTZLICH in der Where-Klausel des Löschens, nicht nur in der Prüfung davor.
 * Das ist heute ein Gürtel ohne Hosenträger-Not: nichts im Code setzt `withdrawnAt` je zurück auf
 * `null`, ein Rückzug ist also endgültig. Er bleibt trotzdem stehen — die Zusage „nur
 * zurückgezogene" soll an der Abfrage hängen und nicht daran, dass diese Eigenschaft wahr bleibt.
 *
 * WAS MITGEHT: Bedingungen und Nachweis-Zeilen über `onDelete: Cascade`, und die hochgeladenen
 * Nachweis-FOTOS über {@link deleteUploadedFiles} — sie gehören zu dieser Aufgabe und zu nichts
 * sonst. Ein Urteil im Strafbuch überlebt — sofern es das hier überhaupt noch gibt: ein offenes
 * hat schon der Rückzug mitgenommen, und ohne Rückzug kommt keine Aufgabe hierher.
 *
 * WAS BLEIBT: die Posteingangs-Zeilen zu dieser Aufgabe. Sie sind bewusst nicht angetastet — sie
 * bleiben lesbar (ihr Text steht in der Zeile selbst) und verlieren nur ihren Bezug. Das ist eine
 * getroffene Entscheidung, kein Versehen.
 *
 * Die Dateien werden NACH dem Löschen entfernt und nicht davor: schlägt das `deleteMany` fehl,
 * stünde die Aufgabe sonst ohne ihre Bilder da.
 */
export async function deleteTask(id: string, userId: string): Promise<ServiceResult<null>> {
  const task = await prisma.task.findFirst({
    where: { id, userId },
    select: { withdrawnAt: true, proofs: { select: { imageUrl: true } } },
  });
  if (!task) return serviceFail(404, "TASK_NOT_FOUND");
  if (!task.withdrawnAt) return serviceFail(400, "TASK_NOT_WITHDRAWN");

  const res = await prisma.task.deleteMany({ where: { id, userId, withdrawnAt: { not: null } } });
  if (res.count === 0) return serviceFail(400, "TASK_NOT_WITHDRAWN");

  // Fire-and-forget wie an allen sechs anderen Aufrufstellen: die Zeile IST weg, und die Antwort der
  // Keyholderin soll nicht an bis zu zehn `unlink`-Aufrufen hängen. Die Reihenfolge „erst Zeile, dann
  // Dateien" bleibt davon unberührt — nur das Warten entfällt.
  void deleteUploadedFiles(task.proofs.map((p) => p.imageUrl));
  return { ok: true, data: null };
}

/**
 * Der Sub meldet die Aufgabe als erledigt.
 *
 * Mehrfach-Zustellung ist eingeplant (Offline-Warteschlange), aber sie darf nicht schaden: die
 * Where-Klausel unten entscheidet, wann ein Vorrücken des Zeitstempels heilt und wann es schadet.
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

  // Eine erneute Meldung darf den Zeitstempel neu setzen — aber nicht überall.
  //
  // Das ist kein Komfort, sondern die einzige Art, aus einer Sackgasse herauszukommen: `evaluateTask`
  // verlangt `completedAt >= startedAt`, und `startedAt` ist ABGELEITET — es verschiebt sich, wenn
  // die Keyholderin einen Eintrag korrigiert oder nachträgt (genau die Eigenschaft, die das
  // Aufgaben-Modell auszeichnet). Rutscht der Beginn hinter eine bereits abgegebene Meldung, fällt
  // die Aufgabe zurück auf „wartet auf Bestätigung", der Knopf erscheint wieder — und traf unter der
  // alten Bedingung keine Zeile mehr. Der Sub drückte, bekam Erfolg gemeldet und die Karte blieb
  // stehen. Beliebig oft.
  //
  // Den Zeitstempel vorzurücken ist dabei die richtige Antwort und nicht bloss die bequeme: er sagt
  // „ich melde, dass es jetzt erfüllt ist", und genau das tut der Sub in diesem Moment erneut.
  // WELCHE Aufgabe die Meldung überhaupt meinen kann — geteilt von der Meldung und ihrer Gegenprobe
  // unten, damit die beiden nicht auseinanderlaufen können. Die Selbstmeldung ist ein Sub-Pfad, also
  // die Sicht des TRÄGERS: eine terminierte, noch nicht zugestellte Aufgabe kann er nicht melden,
  // weil es sie für ihn noch nicht gibt — und jede Antwort ausser der für eine fremde Aufgabe wäre
  // die Bestätigung, dass es sie doch gibt.
  const own = { id, userId, ...SUB_VISIBLE_WHERE };

  const res = await prisma.task.updateMany({
    where: {
      ...own, withdrawnAt: null,
      // WO das Vorrücken heilen kann — und nur dort. Bei einer Aufgabe OHNE Bedingungen misst
      // `evaluateTask` gegen `holdUntil` statt gegen `startedAt`: ein vorgerückter Zeitstempel kippt
      // dort `done` → `missed`. Eine rechtzeitige Meldung, die über die Offline-Warteschlange ein
      // zweites Mal ankommt, würde damit nachträglich zum Vergehen — genau der Grund, aus dem die
      // Bedingung ursprünglich `completedAt: null` lautete.
      OR: [
        { completedAt: null },                 // erste Meldung
        { requirements: { some: {} } },        // mit Bedingungen: gemessen wird gegen startedAt, Vorrücken ist harmlos
        { holdUntil: { gte: new Date() } },    // Frist läuft noch: der neue Stempel bleibt darunter
      ],
    },
    data: { completedAt: new Date(), ...(trimmed ? { completionNote: trimmed } : {}) },
  });
  if (res.count === 0) {
    // Entweder gibt es sie nicht (fremd/gelöscht/noch nicht zugestellt) oder sie ist zurückgezogen.
    const exists = await prisma.task.count({ where: own });
    return exists === 0 ? serviceFail(404, "TASK_NOT_FOUND") : { ok: true, data: { id } };
  }

  // Die Meldung kann das Ergebnis FESTSTELLEN — bei einer Aufgabe ohne Bedingungen ist sie sogar
  // der Regelfall dafür. Dann wird jetzt verbucht, nicht erst zur Frist.
  //
  // `void`: seine Meldung IST geschrieben, und sie darf nicht am SMTP der Keyholder-Benachrichtigung
  // hängen. Bliebe der Request daran stehen, wertete die Offline-Warteschlange den Timeout als
  // „später nochmal" — und spielte dieselbe Meldung ein zweites Mal ein.
  void settleIfNowDone(userId, id);

  return { ok: true, data: { id } };
}


/**
 * Steht das Ergebnis fest, dann verbuche es jetzt — der Weg der SICHTUNG (`reviewTaskProof`).
 *
 * Die Regel dahinter: **verbucht wird von der Handlung, die das Ergebnis feststellt.** Der Poller
 * (`processDueTasks`) bleibt das Auffangnetz für alles, was erst mit der Frist entschieden ist.
 *
 * WIRFT: der Aufrufer entscheidet, was ein Fehlschlag für IHN bedeutet.
 */
export async function settleIfFinal(
  userId: string,
  taskId: string,
  /** Höchstens EINE Zeile im Posteingang? Die SICHTUNG setzt es NICHT — eine Wiederholung ist dort
   *  ein korrigiertes Urteil, und das muss der Sub sehen (siehe {@link settleTaskResult}). */
  once: boolean,
): Promise<"settled" | "notFinal" | "gone"> {
  const now = new Date();
  const evaluated = await evaluateTaskById(userId, taskId, now);
  if (!evaluated) return "gone";
  if (!isTaskResultFinal(evaluated.evaluation.state)) return "notFinal";

  const { controllers, username } = await getControllerAudience(userId);
  await settleTaskResult({
    userId, taskId, title: evaluated.task.title,
    done: evaluated.evaluation.state === "done",
    controllers, username, now, once,
  });
  return "settled";
}

/**
 * Dasselbe für die Wege des TRÄGERS: seine Selbstmeldung (`completeTask`) und die automatische
 * Code-Prüfung eines Nachweises (`runTaskProofVerification`).
 *
 * Der Befund, der beide gebraucht hätte (17.08.2026): Strafaufgabe ohne Bedingungen, Nachweis um
 * 21:03 angenommen, Selbstmeldung 21:04, Frist am Folgetag 20:00. Erfüllt war sie um 21:04 —
 * verbucht wurde sie nicht. Der Poller wählt über `holdUntil <= jetzt`, und die Sichtung sah zehn
 * Sekunden vorher noch kein `completedAt`. 23 Stunden `pendingPenalties: 1` für eine abgeleistete,
 * angenommene Strafe, und keine Ergebnis-Meldung an irgendwen.
 *
 * ZWEI Unterschiede zu {@link settleIfFinal}, und beide sind der Grund für die eigene Funktion:
 *
 * 1. NUR `done`. Endgültig im Sinne von `isTaskResultFinal` ist eine Aufgabe auch als `missed` oder
 *    `aborted`, und zwar oft lange vor ihrer Frist (gebrochene Bedingung, verstrichene Kulanz- oder
 *    Nachweis-Frist). `resultNotifiedAt` ist aber ein EINWEG-Tor: gestempelt sieht der Poller die
 *    Zeile nie wieder. Ein früh gemeldetes „versäumt" — etwa aus einer nachgereichten
 *    Offline-Meldung — nähme der Keyholderin damit die Korrektur: räumt sie den Trage-Eintrag
 *    gerade, steht die Aufgabe zur Frist auf `done`, aber niemand meldet es mehr und keine Strafe
 *    schliesst sich. Das wäre derselbe Befund in Gegenrichtung. Ein Fehlschlag hat es nicht eilig;
 *    er wird zur Frist gemeldet, wo er ohnehin feststeht.
 * 2. `resultNotifiedAt` wird VORHER gelesen. Die `once`-Sperre hält nur die Posteingangs-Zeile
 *    einmalig; Mail und Push gehen unbedingt raus. Eine aus der Offline-Warteschlange nachgereichte
 *    Meldung schickte sonst eine zweite Ergebnis-Mail an Träger und Keyholder.
 *
 * WIRFT NIE — die Aufrufer rufen `void`: die Meldung des Trägers IST geschrieben, und sie darf weder
 * an einem hängenden SMTP warten noch an ihm scheitern.
 */
export async function settleIfNowDone(userId: string, taskId: string): Promise<void> {
  try {
    const now = new Date();
    const evaluated = await evaluateTaskById(userId, taskId, now);
    if (!evaluated || evaluated.evaluation.state !== "done") return;

    // Der Stempel steht nicht am ausgewerteten Bild (`TaskWithRequirements` trägt nur, was die
    // Auswertung braucht) — eine schmale Abfrage, und nur auf dem Weg, der ohnehin gleich meldet.
    const stamped = await prisma.task.findFirst({ where: { id: taskId, userId }, select: { resultNotifiedAt: true } });
    if (!stamped || stamped.resultNotifiedAt) return;

    const { controllers, username } = await getControllerAudience(userId);
    await settleTaskResult({
      userId, taskId, title: evaluated.task.title, done: true,
      controllers, username, now,
      // Anders als bei der Sichtung: eine wiederholte Selbstmeldung ist dieselbe Sache, kein
      // korrigiertes Urteil.
      once: true,
    });
  } catch (err) {
    structuredLog("task", "settle_now_done_failed", { taskId, error: (err as Error).message });
  }
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
 *
 * KEIN `actor`, auf BEIDEN Wegen: „erfüllt" bzw. „versäumt" ist ein Befund der App — `evaluateTasks`
 * rechnet ihn aus den Einträgen aus. Auch auf dem Sichtungs-Weg spricht die Meldung nicht für die
 * Keyholderin: sie hat über EINEN Nachweis geurteilt (das sagt `taskProofAccepted/Rejected` mit
 * ihrem Namen), das Ergebnis der ganzen Aufgabe folgt daraus erst über die Bedingungen und die
 * Frist. Ihren Namen daran zu hängen behauptete eine Entscheidung, die sie so nicht getroffen hat.
 */
export async function settleTaskResult(opts: {
  userId: string;
  taskId: string;
  title: string;
  done: boolean;
  controllers: NotifyRecipient[];
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
  await notifyControllers(userId, controllers, {
    subjectKey: done ? "taskDoneSubjectKeyholder" : "taskFailedSubjectKeyholder",
    messageKey: done ? "taskDoneMessageKeyholder" : "taskFailedMessageKeyholder",
    params: { username, title },
    // Dieselbe Einmal-Zusage wie oben beim Träger — und aus demselben Grund: bricht der Poller
    // zwischen Versand und Stempel ab, hinterliesse sein nächster Lauf sonst eine zweite,
    // dauerhafte Zeile im Keyholder-Posteingang.
    inbox: { ref: { type: "task", id: taskId }, once },
  });
  await prisma.task.update({ where: { id: taskId }, data: { resultNotifiedAt: now } });

  // War die Aufgabe eine STRAFE, ist die Strafe mit ihr abgearbeitet. Hier und nicht im Poller:
  // dieser Helfer ist der EINE Trichter, durch den jeder Endzustand läuft — der Minuten-Tick ebenso
  // wie die Sichtung eines Nachweises, die eine wartende Aufgabe nachträglich erfüllt. Am Poller
  // allein hinge eine spät angenommene Sichtung in der Luft, und die Strafe bliebe für immer offen.
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
 * Stellt fällige, TERMINIERTE Aufgaben zu (`wirksamAb` erreicht, noch nicht benachrichtigt).
 *
 * Dieselbe Einmal-Zusage wie die Nachbar-Blöcke des Minuten-Ticks: erst zustellen, dann stempeln.
 * Schlägt der Versand fehl, bleibt `benachrichtigtAt` null und der nächste Lauf versucht es erneut;
 * eine doppelte Mail ist flüchtig, die Zeile im Posteingang hält `once: true` einmalig.
 *
 * DER PUNKT, AN DEM ES SONST SCHIEFGEHT: der Tick ist nicht zwingend pünktlich (60-Sekunden-Raster,
 * Container-Neustart, gescheiterter Versand). Die geplante SPANNE wird deshalb auf den tatsächlichen
 * Zustell-Zeitpunkt verschoben — Nullpunkt UND Ende wandern um dieselbe Verspätung nach hinten
 * ({@link deadlineFromDispatch}). Ohne das verlöre der Träger Kulanz für etwas, wovon er nichts
 * wusste, und im Extremfall (Instanz stand über Nacht) käme eine bereits abgelaufene Frist an.
 *
 * Der neue Nullpunkt wird MITGESCHRIEBEN (`wirksamAb: sentAt`) und nicht bloss gerechnet: Karte,
 * Auswertung, Strafbuch und Poller müssen dieselben Zahlen lesen — dieselbe Begründung, aus der die
 * Kontroll-Zustellung ihre verschobene Frist zurück in die Zeile schreibt.
 */
export async function dispatchDueTasks(now: Date): Promise<void> {
  // Gesundheits-Halt: nicht zustellen, aber auch nicht zurückziehen — die Aufgabe ist gewollt, nur
  // der Moment nicht. Nach der Pause liefert der Poller sie aus, und `deadlineFromDispatch` gibt
  // dem Träger dabei die volle geplante Spanne ab dem Moment, in dem er von ihr erfährt.
  const due = await prisma.task.findMany({
    // Der Gesundheits-Halt steckt in `dueForDispatchWhere` — dieselbe Klausel für alle vier
    // Zustell-Familien, siehe dort.
    where: dueForDispatchWhere(now),
    orderBy: { wirksamAb: "asc" },
    take: 50,
    // Nur was die Meldung und die Frist-Verschiebung lesen — `description`, `completionNote` und
    // `penaltyReason` sind Freitexte, die auf einem Minuten-Tick nichts zu suchen haben.
    select: {
      id: true, userId: true, title: true, holdUntil: true, holdDurationMin: true,
      startGraceMin: true, createdAt: true, wirksamAb: true, isPunishment: true, createdBy: true,
    },
  });

  for (const t of due) {
    try {
      const sentAt = new Date();
      // Die ganze Geometrie um die Verspätung nach hinten: `holdUntil` über die geteilte Regel, die
      // Kulanzfrist implizit über den neuen Nullpunkt (`startGraceMin` ist eine Dauer, keine Uhrzeit).
      const holdUntil = deadlineFromDispatch({ wirksamAb: t.wirksamAb, deadline: t.holdUntil }, sentAt);

      await notifyUser(t.userId, taskAssignmentNotice({ ...t, wirksamAb: sentAt, holdUntil }, t.createdBy));
      // `updateMany` mit dem offenen Zustand in der Bedingung statt `update` auf die id: zieht die
      // Keyholderin die Aufgabe zwischen Vorauswahl und Versand zurück, darf der Stempel sie nicht
      // wieder aufwecken. Der Rückzug selbst schwieg (sie galt da noch als verborgen). So bleibt sie
      // zurückgezogen und ungestempelt — und damit auch die eben geschriebene Posteingangs-Zeile für
      // den Träger verborgen (`isHiddenFromSub` in `messageService.ts`), statt ihm eine Aufgabe
      // anzukündigen, die er nie zu sehen bekommt.
      //
      // Dasselbe gilt für das FENSTER zwischen den beiden Zeilen hier: die Meldung ist geschrieben,
      // der Stempel noch nicht. Die Reihenfolge ist Absicht (ein abgebrochener Versand darf nicht
      // als erledigt gelten), also muss die Lese-Seite sie tragen — genau dafür leitet der
      // Posteingang die Sichtbarkeit ab, statt sich auf die Disziplin jedes Schreibers zu verlassen.
      await prisma.task.updateMany({
        where: { id: t.id, withdrawnAt: null, benachrichtigtAt: null },
        data: { benachrichtigtAt: sentAt, wirksamAb: sentAt, holdUntil },
      });
    } catch (e) {
      // benachrichtigtAt bleibt null → nächster Lauf versucht es erneut.
      console.error(`[dispatchDueTasks] Zustellung fehlgeschlagen (${t.id}):`, (e as Error).message);
    }
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
  // Gesucht wird über die SPALTE `holdUntil` — im Dauer-Modus also über das spätestmögliche Ende.
  // Wer sofort angelegt hat, ist bis zu einer Kulanzfrist früher fertig, als diese Abfrage nachsieht:
  // seine Ergebnis-MELDUNG kommt dann entsprechend später. Der Zustand selbst ist sofort richtig (er
  // wird bei jeder Anzeige abgeleitet) — verzögert ist nur der Versand.
  //
  // Das ist bewusst so und nicht bloss übersehen. Die Abfrage weiter zu fassen hiesse, Aufgaben
  // aufzugreifen, die noch gar nicht entschieden sind; die bekämen nie ein `resultNotifiedAt`,
  // sortierten als älteste nach vorn und besetzten den `take`-Deckel dauerhaft — genau der Stau, den
  // `c77dec2` schon einmal beheben musste.
  //
  // SEIT DEN EIGENEN NACHWEIS-FRISTEN (B12) ist dieser Verzug GRÖSSER als eine Kulanzfrist: eine
  // Aufgabe, deren Mittags-Foto ausbleibt, ist um 12:00 versäumt — gemeldet wird es erst, wenn ihr
  // eigenes Ende hier auftaucht. Sichtbar ist das Urteil sofort (Karte, Strafbuch und MCP leiten es
  // bei jedem Lesen ab, mit der Frist des Nachweises als Tatzeit); verzögert ist allein der VERSAND.
  // Diese Abfrage kennt nur die Spalte `holdUntil` und damit nur EINE der beiden Zeitachsen — sie
  // enger an die Nachweis-Frist zu binden verlangte eine zweite, mitgeschriebene Spalte
  // (`min(holdUntil, Nullpunkt + kleinste Nachweis-Frist)`). Das ist die offene Frage dazu, kein
  // Versehen.
  const due = await prisma.task.findMany({
    // Terminierte, noch nicht zugestellte Aufgaben bleiben aussen vor: über ein Ergebnis zu berichten,
    // bevor die Aufgabe überhaupt angekommen ist, wäre die falsche Nachricht an beide Seiten. Im
    // Normalfall kann das gar nicht auftreten (ihre Frist liegt in der Zukunft, und `dispatchDueTasks`
    // läuft im selben Tick davor) — stünde der Tick aber lange still, alterte die Zeile hier hinein.
    // Gesundheits-Halt: nicht auswerten. Sonst entstünde das Versäumnis, dessen Ahndung die Pause
    // gerade verhindern soll — samt Meldung an beide Seiten. Beim Aufheben rückt `writeHealthHold`
    // die Fristen dieser Aufgaben nach, sie kommen also nicht als bereits abgelaufene hier wieder an.
    //
    // In der WHERE wie beim Zustellen (`dueForDispatchWhere`), nicht als Filter danach: sonst
    // besetzten die in der Pause ablaufenden Aufgaben den `take`-Deckel bis zum Pausenende, und
    // `TASK_INCLUDE` lüde ihre Nachweise mit, nur um sie eine Zeile später zu verwerfen.
    where: { holdUntil: { lte: now }, withdrawnAt: null, resultNotifiedAt: null, ...SUB_VISIBLE_WHERE, ...NOT_PAUSED_WHERE },
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
      const [evaluated, { controllers, username }] = await Promise.all([
        evaluateTasks(userId, tasks, now),
        getControllerAudience(userId),
      ]);

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
          await notifyControllers(userId, controllers, {
            subjectKey: "taskReviewSubjectKeyholder",
            messageKey: "taskReviewMessageKeyholder",
            params: { username, title: e.task.title },
            // Dieselbe Einmal-Zusage wie bei der Ergebnis-Meldung (`settleTaskResult`) und aus
            // demselben Grund: gestempelt wird erst NACH dem Versand, damit ein Fehlschlag erneut
            // versucht wird. Bricht der Poller dazwischen ab — Deploy, OOM —, läuft der nächste Tick
            // erneut hier durch und hinterliesse eine ZWEITE, dauerhafte Zeile im
            // Keyholder-Posteingang. Eine doppelte Mail ist flüchtig, eine doppelte Zeile bleibt.
            inbox: { ref: { type: "task", id: e.task.id }, once: true },
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
