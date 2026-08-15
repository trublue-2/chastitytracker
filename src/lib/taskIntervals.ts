import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { buildPairs, filterAndSortPairEntries, mergeWearPairs, KG_PAIR, WEAR_PAIR, type ReinigungSettings, type WearPair } from "@/lib/utils";
import { buildWearSessions, wearSessionPairsByCategory, wearSessionPairsByDevice, type SegmentEntry } from "@/lib/sessionModel";
import { SESSION_ENTRY_SELECT } from "@/lib/queries";
import { evaluateTask, coversPoint, isTaskOffense, isTaskOpen, needsKeyholderReview, type Interval, type ProofLike, type TaskEvaluation, type TaskRequirementLike } from "@/lib/tasks";

/**
 * Das Bindeglied zwischen Aufgaben und Einträgen: baut je Bedingung die Zeiträume, in denen sie galt,
 * und wertet die Aufgabe damit aus.
 *
 * Bewusst KEIN eigener Paar-Automat — die Intervalle kommen ausschliesslich aus den vorhandenen
 * Bausteinen: `buildKgWearPairs` (Verschluss) bzw. `buildWearSessions` + `wearSessionPairsByCategory`
 * (Tragen). Sonst gäbe es eine zweite Definition von „getragen", die von der des Dashboards abweichen
 * kann.
 */

export interface TaskWithRequirements {
  id: string;
  title: string;
  description: string | null;
  holdUntil: Date;
  startGraceMin: number;
  /** Dauer-Modus (Minuten ab dem Beginn) — siehe `TaskLike.holdDurationMin`. */
  holdDurationMin: number | null;
  /** Müssen die Aufnahmezeiten der Nachweise ihrer Reihenfolge folgen? — siehe
   *  `TaskLike.proofOrderMatters`. */
  proofOrderMatters: boolean;
  isPunishment: boolean;
  penaltyReason: string | null;
  createdAt: Date;
  /** Terminierung — siehe `TaskLike.wirksamAb`. Zusammen mit `benachrichtigtAt` entscheidet sie,
   *  ob die Aufgabe für den Träger überhaupt schon existiert (`isHiddenFromSub`). */
  wirksamAb: Date | null;
  benachrichtigtAt: Date | null;
  completedAt: Date | null;
  completionNote: string | null;
  withdrawnAt: Date | null;
  requirements: {
    id: string;
    type: string;
    categoryId: string | null;
    deviceId: string | null;
    sortOrder: number;
    category: { name: string } | null;
    device: { name: string; categoryId: string | null } | null;
  }[];
  /** Geforderte Nachweis-Fotos (Issue #39). Leer bei Aufgaben ohne Nachweis-Pflicht.
   *  Genau `ProofLike` — die Anzeige-Felder (`description`, `imageUrl`, `reviewNote`) lädt die
   *  Sicht, die sie rendert. Hier wären sie auf jedem heissen Pfad mitgeschleppter Ballast. */
  proofs: ProofLike[];
}

/** Was die Anzeige braucht: die Aufgabe, ihr abgeleiteter Zustand und die benannten Bedingungen. */
export interface EvaluatedTask {
  task: TaskWithRequirements;
  evaluation: TaskEvaluation;
  requirements: (TaskRequirementLike & {
    /** Für den Deep-Link „Bedingung erfüllen" auf dem Sub-Dashboard. */
    type: string;
    categoryId: string | null;
    deviceId: string | null;
    satisfied: boolean;
  })[];
}

/** Anzeigename einer Bedingung — konkretes Gerät schlägt Kategorie, „verschlossen" hat einen festen
 *  Namen, den der Aufrufer übersetzt übergibt. */
function requirementLabel(r: TaskWithRequirements["requirements"][number], kgLabel: string): string {
  if (r.type === "KG_LOCKED") return kgLabel;
  return r.device?.name ?? r.category?.name ?? kgLabel;
}

/** Prisma-Include, das `evaluateTasks` erwartet. Einmal hier, damit die Aufrufer nicht raten. */
export const TASK_INCLUDE = {
  requirements: {
    orderBy: { sortOrder: "asc" },
    include: {
      category: { select: { name: true } },
      device: { select: { name: true, categoryId: true } },
    },
  },
  // Die Soll-Reihenfolge IST `sortOrder` — sortiert laden, damit `evaluateProofs` sie nicht raten muss.
  // `select` wie bei `requirements`: nur was die AUSWERTUNG liest. `description`/`imageUrl`/
  // `reviewNote` sind Anzeige-Felder und hätten auf Heartbeat, Poller und Strafbuch nichts zu suchen.
  proofs: {
    orderBy: { sortOrder: "asc" },
    select: {
      id: true, sortOrder: true, requireCode: true, dueOffsetMin: true, submittedAt: true,
      imageExifTime: true, verifikationStatus: true, verifikationReason: true, reviewAccepted: true,
    },
  },
} as const;

/**
 * Bereits geladene Einträge, die der Aufrufer durchreichen kann.
 *
 * Dashboard, Strafbuch und das MCP-Dashboard haben die Einträge des Nutzers ohnehin in der Hand — sie
 * ein zweites Mal zu laden UND ein zweites Mal zu paaren wäre reine Doppelarbeit auf genau den
 * Seiten, die am meisten laden. Gefiltert wird hier nach Typ, sortiert ebenfalls: der Aufrufer soll
 * nichts vorbereiten müssen, damit die Abkürzung nicht an einer falschen Sortierung still scheitert.
 *
 * JE ART EIN EIGENES FELD — und das ist keine Kosmetik. Ein gemeinsames `entries` liess einen
 * Aufrufer, der nur seine Verschluss-Einträge hatte (das Strafbuch), die Trage-Einträge stumm auf leer
 * setzen: jede Aufgabe mit Trage-Bedingung wurde dort zum Vergehen, obwohl das Gerät durchgehend
 * getragen war. Wer ein Feld weglässt, bekommt jetzt eine Nachladung statt einer leeren Liste.
 */
/** Was die Verschluss-Paarung braucht. `oeffnenGrund` entscheidet über die Reinigungs-Ausnahme. */
type KgEntry = { id: string; type: string; startTime: Date; oeffnenGrund?: string | null };

export interface TaskEntrySource {
  /** VERSCHLUSS/OEFFNEN — braucht `id` und `oeffnenGrund` (für die Reinigungs-Ausnahme). */
  kgEntries?: KgEntry[];
  /** WEAR_BEGIN/WEAR_END — braucht `device.id` und `device.categoryId`. */
  wearEntries?: SegmentEntry[];
  /** Die Reinigungs-Regeln des Nutzers. Dieselbe Abkürzung wie bei den Einträgen: wer sie ohnehin
   *  geladen hat (Dashboard, Strafbuch, MCP-Dashboard), spart die zusätzliche User-Abfrage. */
  reinigung?: ReinigungSettings;
}

/** Wie weit zurück eine ABGESCHLOSSENE Aufgabe noch als „kürzlich" gilt — die Alterung, ohne die die
 *  Dashboard-Spalte monoton wächst. Gelesen von der SQL-Vorauswahl (jeder Abschluss) und von
 *  {@link belongsOnDashboard} (dort nur noch für Vergehen; erfüllte fallen sofort weg). Die
 *  Vorauswahl ist damit weiter gefasst als die Anzeige — genau die Richtung, die nichts verliert. */
const RECENT_WINDOW_MS = 24 * 3600_000;

/** Deckel der Aufgaben-Liste des Subs. Die Auswertung ist eine Rechnung je Aufgabe und jede Karte
 *  reist als Prop zum Client — beides steigt linear, also bleibt die Liste eine Liste. Was noch
 *  offen ist, hängt NICHT an diesem Deckel (siehe {@link getEvaluatedTaskHistory}). */
export const HISTORY_LIMIT = 25;

/** Deckel der relevanten Aufgaben. Der Extremfall vieler Versäumnisse, nicht der Normalfall. */
const RELEVANT_LIMIT = 50;

/**
 * WER schaut? Die eine Frage, an der die Sichtbarkeit terminierter Aufgaben hängt.
 *
 * Als Pflicht-Angabe der Lade-Funktionen und nicht als optionaler Schalter: eine vergessene Angabe
 * wäre kein Fehler, sondern ein Leck — der Träger sähe eine Aufgabe, deren ganzer Zweck es ist, ihn
 * bis zu ihrem Zeitpunkt nicht zu erreichen. So bricht stattdessen der Compiler.
 */
export type TaskAudience =
  /** Der Träger: terminierte, noch nicht zugestellte Aufgaben gibt es für ihn nicht. */
  | "sub"
  /** Die Keyholderin: sie sieht auch, was sie für später geplant hat. */
  | "keyholder";

/**
 * Die SQL-Entsprechung von `isHiddenFromSub` — was der TRÄGER überhaupt geladen bekommt.
 *
 * Als `where`-Fragment und nicht als Filter danach: sonst zöge jede seiner Abfragen ihren `take`-
 * Deckel an Aufgaben voll, die sie gleich wieder wegwirft, und eine terminierte Aufgabe könnte eine
 * sichtbare aus der Liste verdrängen.
 *
 * In `AND` verpackt und nicht als blosses `OR`: die aufnehmenden Bedingungen tragen ihr eigenes `OR`
 * (siehe {@link relevantTaskWhere}), und ein zweites auf derselben Ebene überschriebe es still — die
 * Einschränkung wäre spurlos weg, und zwar genau die, die ein Leck verhindern soll.
 */
export const SUB_VISIBLE_WHERE = {
  AND: [{ OR: [{ wirksamAb: null }, { benachrichtigtAt: { not: null } }] }],
} satisfies Prisma.TaskWhereInput;

/** Das Sichtbarkeits-Fragment für diese Sicht — leer für die Keyholderin. */
function audienceWhere(audience: TaskAudience) {
  return audience === "sub" ? SUB_VISIBLE_WHERE : {};
}

/**
 * Die grobe SQL-Entsprechung von {@link belongsOnDashboard} — bewusst zu WEIT gefasst: sie hält ein
 * paar Zeilen mehr, aber sie verliert keine.
 *
 * Der Zustand ist abgeleitet und damit nicht filterbar, die Vorauswahl passiert deshalb über die
 * Zeit. `completedAt: null` bleibt ohne Zeitgrenze: eine Aufgabe, deren Bedingungen hielten, wartet
 * auf die Selbstmeldung des Subs, und die heilt sie auch noch später. Fiele sie nach 24 h heraus,
 * könnte er sie nie mehr melden.
 */
function relevantTaskWhere(userId: string, now: Date, audience: TaskAudience) {
  return {
    userId,
    withdrawnAt: null,
    ...audienceWhere(audience),
    OR: [
      { completedAt: null },
      { holdUntil: { gte: new Date(now.getTime() - RECENT_WINDOW_MS) } },
      // Solange ein Nachweis WEDER maschinell bestätigt NOCH vom Menschen beurteilt ist, bleibt die
      // Aufgabe drin. Ohne diesen Zweig fiel sie raus, sobald der Sub zusätzlich „erledigt" gemeldet
      // hatte (`completedAt` gesetzt) und 24 h seit der Frist vergangen waren — die Sichtung der
      // Keyholderin stand dann noch aus, aber die Zeile war schon auf SQL-Ebene weg.
      { proofs: { some: { verifikationStatus: null, reviewAccepted: null } } },
    ],
  };
}

/**
 * Die Aufgaben, die den Sub JETZT etwas angehen: alles Laufende plus das, was in den letzten 24 h
 * endete.
 */
export async function getDashboardTasks(userId: string, now: Date, audience: TaskAudience): Promise<TaskWithRequirements[]> {
  // `desc` + `take` behält die JÜNGSTEN. Aufsteigend sortiert hätte der Deckel die ältesten behalten
  // — und versäumte Aufgaben altern nie aus dieser Abfrage heraus (sie bekommen nie ein
  // `completedAt`). Nach 50 Versäumnissen wäre jede NEUE Aufgabe unsichtbar gewesen: keine Karte,
  // keine Ablege-Warnung, kein Heartbeat — und am Ende trotzdem ein Vergehen für etwas, das der Sub
  // nie zu sehen bekam.
  const rows = await prisma.task.findMany({
    where: relevantTaskWhere(userId, now, audience),
    orderBy: { holdUntil: "desc" },
    take: RELEVANT_LIMIT,
    include: TASK_INCLUDE,
  });
  // Angezeigt wird nach nächster Frist zuerst.
  return rows.reverse();
}

/** Ein Nachweis, wie ihn die ANZEIGE braucht — mit Beschreibung und Code, die `TASK_INCLUDE`
 *  bewusst nicht lädt. */
export interface TaskProofView {
  id: string;
  taskId: string;
  sortOrder: number;
  description: string;
  requireCode: boolean;
  /** Der Code, den der Sub ins Bild schreiben muss. Null ohne Code-Pflicht. */
  code: string | null;
  /** EIGENE Fälligkeit in Minuten ab dem Nullpunkt der Aufgabe — die Anzeige löst sie über
   *  `proofDeadline` zu einem Zeitpunkt auf. Null = offen bis zum Ende der Aufgabe. */
  dueOffsetMin: number | null;
  submittedAt: Date | null;
  /** Aufnahmezeit — die Anzeige braucht sie, um den Nachweis zu benennen, der die Reihenfolge
   *  bricht (`firstOutOfOrderProof`). */
  imageExifTime: Date | null;
  imageUrl: string | null;
  verifikationStatus: string | null;
  verifikationReason: string | null;
  reviewAccepted: boolean | null;
  /** Wann geurteilt wurde. Für die Sichtungs-Zeile: „Angenommen" ohne Zeitpunkt lässt offen, ob es
   *  vor einer Minute oder vor einer Woche geschah — und ob es das eigene Urteil war oder das des
   *  Keyholder-Agenten, der zwischendurch gearbeitet hat. */
  reviewedAt: Date | null;
  reviewNote: string | null;
}

/**
 * Die Anzeige-Felder der Nachweise, je Aufgabe gebündelt.
 *
 * Eine eigene Abfrage statt eines breiteren `TASK_INCLUDE`: die Beschreibung ist ein Freitext und
 * der Code eine Vorgabe — beides braucht NUR, wer die Karte rendert. Heartbeat, Poller und Strafbuch
 * fragen dieselbe Auswertung, brauchen davon aber kein Zeichen. Die Kosten gehören auf den
 * Anzeige-Pfad, nicht auf jeden Tick.
 */
export async function loadTaskProofViews(taskIds: string[]): Promise<Map<string, TaskProofView[]>> {
  if (taskIds.length === 0) return new Map();
  const rows = await prisma.taskProof.findMany({
    where: { taskId: { in: taskIds } },
    orderBy: { sortOrder: "asc" },
  });
  const byTask = new Map<string, TaskProofView[]>();
  for (const r of rows) {
    const list = byTask.get(r.taskId);
    if (list) list.push(r);
    else byTask.set(r.taskId, [r]);
  }
  return byTask;
}

/**
 * Gehört die Aufgabe aufs Dashboard? Das Dashboard zeigt, was den Sub JETZT etwas angeht — alles
 * Weitere steht in der Aufgaben-Liste.
 *
 * `done` fällt SOFORT weg, nicht erst nach 24 h: eine erfüllte Aufgabe verlangt nichts mehr, und eine
 * Karte, die einen Tag lang „Erfüllt" meldet, ist genau die Wand, vor der die Liste bewahren soll.
 * Ein Versäumnis bleibt dagegen kurz stehen — es ist eine Nachricht an den Sub, keine Quittung.
 */
export function belongsOnDashboard(e: EvaluatedTask, now: Date): boolean {
  const { state } = e.evaluation;
  if (isTaskOpen(state)) return true;
  // Eine ausstehende Sichtung altert NICHT weg: sie wartet auf eine Handlung der Keyholderin, und
  // die hat keine Frist. Fiele sie nach 24 h aus der Ansicht, verschwände die Aufgabe in einem
  // Zustand, in dem noch niemand geurteilt hat — weder erfüllt noch versäumt, nur weg.
  if (needsKeyholderReview(state)) return true;
  // Nur ein VERGEHEN bleibt noch kurz stehen. Über `isTaskOffense` statt über einen eigenen
  // Zustands-Vergleich: kommt je ein dritter Vergehens-Zustand dazu, zieht ihn der geteilte Typ hier
  // mit — abgeschrieben wäre er still vom Dashboard verschwunden. Erfüllte und zurückgezogene
  // Aufgaben fallen damit sofort weg; letztere hielt früher die `withdrawnAt: null`-Bedingung von
  // `getDashboardTasks` fern, die die Liste bewusst nicht mehr setzt.
  if (!isTaskOffense(state)) return false;
  // Über das WIRKSAME Ende: im Dauer-Modus liegt das gespeicherte `holdUntil` (das
  // spätestmögliche) hinter dem tatsächlichen, die Karte bliebe sonst länger stehen als das
  // Vergehen alt ist. Die SQL-Vorauswahl (`relevantTaskWhere`) benutzt weiterhin die Spalte — sie
  // ist damit bewusst weiter gefasst als diese Anzeige-Regel, also genau die Richtung, die nichts
  // verliert.
  return now.getTime() - e.evaluation.holdUntil.getTime() <= RECENT_WINDOW_MS;
}

/**
 * Die Aufgaben-Liste des Subs, ausgewertet, neueste Frist zuerst — und darin garantiert alles, was
 * das Dashboard als Karte zeigen muss.
 *
 * ZWEI Abfragen, EINE Auswertung. Die zweite (die letzten {@link HISTORY_LIMIT}) ist die Liste, die
 * erste (dieselbe Vorauswahl wie {@link getDashboardTasks}) ist die Versicherung dagegen, dass der
 * Deckel eine offene Aufgabe verschluckt: ein Sub mit 25 jüngeren, längst erfüllten Aufgaben hätte
 * die eine alte verloren, die noch auf seine Selbstmeldung wartet — samt dem einzigen Knopf, mit dem
 * er sie je melden könnte. Beide Abfragen laufen über denselben Index, parallel, und die Auswertung
 * (der teure Teil: Paarung der gesamten Eintragshistorie) läuft danach genau einmal.
 *
 * Aus dem Ergebnis leitet das Dashboard seine Karten mit {@link belongsOnDashboard} ab.
 */
export async function getEvaluatedTaskHistory(
  userId: string,
  now: Date,
  opts: TaskEntrySource & { kgLabel?: string; audience: TaskAudience },
): Promise<EvaluatedTask[]> {
  const [relevant, recent] = await Promise.all([
    prisma.task.findMany({
      where: relevantTaskWhere(userId, now, opts.audience),
      orderBy: { holdUntil: "desc" },
      take: RELEVANT_LIMIT,
      include: TASK_INCLUDE,
    }),
    prisma.task.findMany({
      // Die Historie folgt derselben Sichtbarkeit wie die Vorauswahl darüber — sonst käme die
      // terminierte Aufgabe genau hier wieder herein.
      where: { userId, ...audienceWhere(opts.audience) },
      orderBy: { holdUntil: "desc" },
      take: HISTORY_LIMIT,
      include: TASK_INCLUDE,
    }),
  ]);
  // Die Überschneidung ist der Normalfall — vereinigt wird über die Id, sortiert bleibt es wie
  // geladen: neueste Frist zuerst.
  const byId = new Map(recent.map((t) => [t.id, t]));
  for (const t of relevant) byId.set(t.id, t);
  const merged = [...byId.values()].sort((a, b) => b.holdUntil.getTime() - a.holdUntil.getTime());
  return evaluateTasks(userId, merged, now, opts);
}

/** Laden + auswerten in einem — die Kette `getDashboardTasks` → `evaluateTasks` stand sonst an vier
 *  Stellen wortgleich, jede mit eigenem Filter und eigenem (oder fehlendem) Label. */
export async function getEvaluatedTasks(
  userId: string,
  now: Date,
  opts: TaskEntrySource & { kgLabel?: string; audience: TaskAudience },
): Promise<EvaluatedTask[]> {
  return evaluateTasks(userId, await getDashboardTasks(userId, now, opts.audience), now, opts);
}

/** Was die Warnung vor dem Ablegen anzeigt. */
export interface TaskWarning {
  title: string;
  /** ISO — das Formular formatiert in der Zeitzone des Subs. */
  holdUntil: string;
}

/** Welche Bedingung ist beim Ablegen betroffen? KG-Öffnen bzw. ein Gerät/eine Kategorie. */
export type TaskTarget = { kg: true } | { categoryId: string; deviceId?: string | null };

/**
 * Meint diese Bedingung GENAU das, was gerade abgelegt werden soll?
 *
 * Eine Bedingung auf ein bestimmtes Gerät trifft nur dieses Gerät, nicht seine ganze Kategorie —
 * sonst hinge eine Aufgabe „trage Plug A" auch an Plug B.
 *
 * Geteilt von der Warnung VOR dem Ablegen ({@link getTasksBlocking}) und der Markierung der
 * laufenden Trage-Karte. Beide beantworten dieselbe Frage und müssen dieselbe Antwort geben: sonst
 * trägt die Karte ein Warnzeichen, dessen Formular nicht warnt (oder umgekehrt), und jede neue
 * Bedingungsart müsste an zwei Stellen nachgezogen werden.
 */
export function requirementMatchesTarget(
  r: Pick<EvaluatedTask["requirements"][number], "type" | "categoryId" | "deviceId">,
  target: TaskTarget,
): boolean {
  if ("kg" in target) return r.type === "KG_LOCKED";
  if (r.type !== "WEAR") return false;
  return r.deviceId ? r.deviceId === target.deviceId : r.categoryId === target.categoryId;
}

/**
 * Hält eine laufende Aufgabe dieses Ziel gerade fest — kann das Ablegen sie also noch kaputtmachen?
 *
 * Drei Bedingungen, jede aus einem anderen Grund:
 *  - `isTaskOpen`: abgeschlossene und zurückgezogene Aufgaben stellen keine Forderung mehr.
 *  - `r.satisfied`: was ohnehin nicht gilt, kann durch das Ablegen nicht kaputtgehen.
 *  - `now < holdUntil`: die Frist muss noch LAUFEN.
 *
 * Der dritte Punkt ist nicht offensichtlich. Eine Aufgabe, die bis `holdUntil` durchgehalten hat und
 * nur noch auf die Selbstmeldung wartet, bleibt `running` und damit offen — die Selbstmeldung ist
 * bewusst unbefristet, sonst könnte der Sub sie nie mehr nachholen. Ihre Bedingung ist weiterhin
 * erfüllt, solange er das Gerät trägt. Ohne diese dritte Bedingung warnte das Ablege-Formular in
 * genau diesem Fenster — mit einer bereits VERGANGENEN Frist im Text („verlangt dieses Gerät noch
 * bis 10:00", gezeigt um 10:05) und der Behauptung, das Ablegen gelte als nicht erfüllt.
 *
 * Die Behauptung ist falsch: `evaluateTask` prüft die Deckung nur bis `until = min(now, holdUntil)`.
 * Ist `holdUntil` verstrichen, liegt die geprüfte Spanne vollständig fest — jedes spätere Ablegen
 * endet nach `holdUntil` und ändert an `coversContinuously(…, startedAt, holdUntil)` nichts mehr.
 * Der Zustand kann von dort weder nach `aborted` noch nach `missed` kippen.
 *
 * Das Fenster war nicht klein: es öffnet mit `holdUntil` und bleibt offen, bis der Sub meldet oder
 * ablegt. Wer sein Gerät nicht in derselben Minute abnimmt, in der die Frist ablief, lief hinein.
 */
export function isHeldByTask(evaluated: EvaluatedTask[], target: TaskTarget, now: Date): boolean {
  return evaluated.some(
    (e) => isTaskOpen(e.evaluation.state)
      // Das WIRKSAME Ende: im Dauer-Modus ist die Aufgabe nach `startedAt` + Dauer durch, das
      // gespeicherte `holdUntil` steht aber noch bis zu einer Kulanzfrist länger. Gegen die Spalte
      // geprüft warnte das Ablege-Formular genau in diesem Fenster vor einem Abbruch, den es nicht
      // mehr geben kann — dieselbe Falschaussage, die der Absatz oben schon einmal beschreibt.
      && now < e.evaluation.holdUntil
      && e.requirements.some((r) => r.satisfied && requirementMatchesTarget(r, target)),
  );
}

/**
 * Laufende Aufgaben, die GENAU das verlangen, was der Sub gerade ablegen will.
 *
 * Ohne diese Abfrage sind es zwei Taps von „Aufgabe läuft" zu „Vergehen": die laufende Trage-Karte
 * ist vollflächig ein Link aufs Ablege-Formular, und das Formular wüsste nichts von Aufgaben. Die
 * Auswertung selbst bliebe korrekt — nur wäre der Sub ohne Vorwarnung hineingelaufen.
 *
 * Nur Bedingungen, die JETZT gelten, zählen: was ohnehin nicht erfüllt ist, kann durch das Ablegen
 * auch nicht kaputtgehen.
 */
export async function getTasksBlocking(userId: string, now: Date, target: TaskTarget): Promise<TaskWarning[]> {
  // Der Vorfilter steht IN der Abfrage, nicht davor: nennt gar keine Aufgabe dieses Gerät bzw. den
  // KG, kommt sie leer zurück, `evaluateTasks` steigt sofort aus und die Eintragstabellen werden
  // nicht angefasst. Das ist der Normalfall auf zwei Formular-Seiten, die sonst bei JEDEM Aufbau die
  // ganze Trage-Historie paaren würden. Als vorgeschaltetes `count` wäre es dieselbe Bedingung
  // zweimal — einmal in SQL, einmal in `matches()` — und ein Rundgang mehr.
  //
  // Bewusst NUR strukturell (Besitz + Bedingungsart), ohne `holdUntil`/`completedAt`: der Zustand ist
  // abgeleitet, und ein Vorfilter, der enger greift als die Auswertung danach, verschluckt genau die
  // Warnung, für die es die Funktion gibt. Eine bereits selbst gemeldete, aber noch laufende Aufgabe
  // ist weiterhin offen — sie fiele sonst raus, und der Sub liefe ohne Vorwarnung in ein Vergehen.
  const rows = await prisma.task.findMany({
    where: {
      userId,
      withdrawnAt: null,
      // Fest auf die Sicht des TRÄGERS: das hier sind seine Formulare. Eine terminierte Aufgabe hält
      // nichts fest — sie existiert für ihn noch nicht, und eine Warnung vor ihr verriete sie.
      ...SUB_VISIBLE_WHERE,
      requirements: {
        some: "kg" in target
          ? { type: "KG_LOCKED" }
          : { type: "WEAR", OR: [{ categoryId: target.categoryId }, ...(target.deviceId ? [{ deviceId: target.deviceId }] : [])] },
      },
    },
    orderBy: { holdUntil: "desc" },
    take: 50,
    include: TASK_INCLUDE,
  });

  return (await evaluateTasks(userId, rows, now))
    .filter((e) => isHeldByTask([e], target, now))
    .map((e) => ({ title: e.task.title, holdUntil: e.evaluation.holdUntil.toISOString() }));
}

/**
 * Wertet mehrere Aufgaben eines Users aus. Lädt die Einträge EINMAL für alle Aufgaben — die
 * Intervalle sind je Kategorie/Gerät dieselben, egal wie viele Aufgaben darauf zeigen.
 *
 * Ohne Aufgaben wird gar nichts geladen: `buildStrafbuch` und das Dashboard rufen das auf jedem
 * Seitenaufbau, und ein Scan für nichts wäre eine Abgabe an alle Nutzer ohne Aufgaben.
 */
export async function evaluateTasks(
  userId: string,
  tasks: TaskWithRequirements[],
  now: Date,
  /** Bereits Geladenes des Aufrufers plus der Anzeigename der KG-Bedingung. Was fehlt, wird
   *  nachgeladen. EIN Objekt statt Positions-Parametern, weil die Aufrufer ohne Bedingungsnamen
   *  (Strafbuch, Heartbeat) sonst ein literales `undefined` übergeben müssten, um an die Quellen zu
   *  kommen. */
  opts: TaskEntrySource & {
    /** Anzeigename der KG-Bedingung. Wo keine Bedingungsnamen gebraucht werden, reicht der Default —
     *  „KG" ist in beiden Sprachen derselbe Eigenname. */
    kgLabel?: string;
  } = {},
): Promise<EvaluatedTask[]> {
  if (tasks.length === 0) return [];
  const kgLabel = opts.kgLabel ?? "KG";

  const needsKg = tasks.some((t) => t.requirements.some((r) => r.type === "KG_LOCKED"));
  const needsWear = tasks.some((t) => t.requirements.some((r) => r.type === "WEAR"));

  const [kgEntries, wearEntries, reinigung] = await Promise.all([
    !needsKg ? Promise.resolve([])
      : opts.kgEntries ? Promise.resolve(filterAndSortPairEntries(opts.kgEntries, KG_PAIR))
      : prisma.entry.findMany({
          where: { userId, type: { in: [KG_PAIR.close, KG_PAIR.open] } },
          orderBy: { startTime: "asc" },
          select: { id: true, type: true, startTime: true, oeffnenGrund: true },
        }),
    !needsWear ? Promise.resolve([])
      : opts.wearEntries ? Promise.resolve(filterAndSortPairEntries(opts.wearEntries, WEAR_PAIR))
      : prisma.entry.findMany({
          where: { userId, type: { in: [WEAR_PAIR.close, WEAR_PAIR.open] } },
          orderBy: { startTime: "asc" },
          select: SESSION_ENTRY_SELECT,
        }),
    // Die Reinigungs-Regeln des Nutzers — siehe die Begründung bei `kgPairs`.
    !needsKg || opts.reinigung ? Promise.resolve(null) : prisma.user.findUnique({
      where: { id: userId },
      select: { reinigungErlaubt: true, reinigungMaxMinuten: true },
    }),
  ]);

  // „Verschlossen" heisst hier dasselbe wie überall sonst in der App: eine ERLAUBTE Reinigungspause
  // (REINIGUNG-Öffnung, rechtzeitig wieder verschlossen) unterbricht die Session, beendet sie aber
  // nicht. Deshalb `buildPairs` mit den Reinigungs-Regeln statt des schlichten `buildKgWearPairs` —
  // sonst bekäme der Sub ein Vergehen für ein Verhalten, das ihm ausdrücklich erlaubt ist, und das
  // Strafbuch beurteilte dieselbe Öffnung an zwei Stellen gegensätzlich.
  const reinigungSettings: ReinigungSettings = opts.reinigung ?? {
    erlaubt: reinigung?.reinigungErlaubt ?? false,
    maxMinuten: reinigung?.reinigungMaxMinuten ?? 0,
  };
  const kgPairs: WearPair[] = buildPairs(kgEntries as KgEntry[], [], reinigungSettings)
    .filter((p) => !p.orphaned)
    .map((p) => ({ start: p.verschluss.startTime, end: p.oeffnen?.startTime ?? now }));
  const wearSessions = buildWearSessions(wearEntries, now);
  const pairsByCategory = wearSessionPairsByCategory(wearSessions, now);
  /** Intervalle je GERÄT — für die engere „genau dieses Gerät"-Bedingung. Als Map wie die
   *  Kategorie-Variante: bei mehreren Aufgaben mit Geräte-Bedingung wäre ein Filter über alle
   *  Sessions je Bedingung sonst quadratisch. */
  const pairsByDevice = wearSessionPairsByDevice(wearSessions, now);

  // EINMAL verschmelzen, nicht je Aufgabe: die Listen sind über alle Aufgaben dieselben Objekte
  // (eine je Kategorie, eine je Gerät, eine fürs KG). `intersectAll` verschmilzt seine Eingaben
  // selbst — bei zehn Aufgaben mit je zwei Bedingungen wären das zwanzig Sorts derselben Handvoll
  // Listen. Verschmolzen ist die Eingabe für `intersectAll` unverändert gültig, und `coversPoint`
  // ist gegenüber dem Verschmelzen ohnehin blind (siehe `tasks.ts`).
  const merged = new Map<Interval[], Interval[]>();
  const mergeOnce = (list: Interval[]): Interval[] => {
    const hit = merged.get(list);
    if (hit) return hit;
    const m = mergeWearPairs(list);
    merged.set(list, m);
    return m;
  };

  return tasks.map((task) => {
    const perRequirement: Interval[][] = task.requirements.map((r) => {
      // „Verschlossen" heisst verschlossen — welches KG dabei getragen wird, fordert das Formular
      // heute nicht an (dafür gibt es die Verschluss-Anforderung mit Gerätevorgabe).
      if (r.type === "KG_LOCKED") return mergeOnce(kgPairs);
      if (r.deviceId) return mergeOnce(pairsByDevice.get(r.deviceId) ?? []);
      return r.categoryId ? mergeOnce(pairsByCategory.get(r.categoryId) ?? []) : [];
    });

    // „Erfüllt" heisst: gilt JETZT. Direkt aus den Intervallen statt aus `missing` abgeleitet — das
    // Feld ist nur in den Nicht-begonnen-Zweigen gefüllt und wäre bei laufenden oder beendeten
    // Aufgaben irreführend leer.
    const requirements = task.requirements.map((r, i) => ({
      id: r.id,
      label: requirementLabel(r, kgLabel),
      type: r.type,
      categoryId: r.categoryId,
      deviceId: r.deviceId,
      satisfied: coversPoint(perRequirement[i], now),
    }));

    const evaluation = evaluateTask(task, requirements, perRequirement, now, task.proofs);
    return { task, evaluation, requirements };
  });
}
