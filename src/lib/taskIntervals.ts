import { prisma } from "@/lib/prisma";
import { buildPairs, type ReinigungSettings, type WearPair } from "@/lib/utils";
import { buildWearSessions, wearSessionPairsByCategory, type SegmentEntry } from "@/lib/sessionModel";
import { SESSION_ENTRY_SELECT } from "@/lib/queries";
import { evaluateTask, coversPoint, isTaskOpen, type Interval, type TaskEvaluation, type TaskRequirementLike } from "@/lib/tasks";

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
  isPunishment: boolean;
  penaltyReason: string | null;
  createdAt: Date;
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
}

/** Wie weit zurück eine bereits abgeschlossene Aufgabe noch auf dem Dashboard steht. Danach nur noch
 *  in der Historie — ohne diese Alterung wächst die Dashboard-Spalte monoton. */
const RECENT_WINDOW_MS = 24 * 3600_000;

/**
 * Die Aufgaben, die den Sub JETZT etwas angehen: alles Laufende plus das, was in den letzten 24 h
 * endete.
 *
 * Der Zustand ist abgeleitet und damit nicht filterbar — die Vorauswahl passiert deshalb über die
 * Zeit. `completedAt: null` bleibt bewusst ohne Zeitgrenze: eine Aufgabe, deren Bedingungen hielten,
 * wartet auf die Selbstmeldung des Subs, und die heilt sie auch noch später. Fiele sie nach 24 h vom
 * Dashboard, könnte er sie nie mehr melden. Das `take` deckelt den Extremfall vieler versäumter
 * Aufgaben.
 */
export async function getDashboardTasks(userId: string, now: Date): Promise<TaskWithRequirements[]> {
  // `desc` + `take` behält die JÜNGSTEN. Aufsteigend sortiert hätte der Deckel die ältesten behalten
  // — und versäumte Aufgaben altern nie aus dieser Abfrage heraus (sie bekommen nie ein
  // `completedAt`). Nach 50 Versäumnissen wäre jede NEUE Aufgabe unsichtbar gewesen: keine Karte,
  // keine Ablege-Warnung, kein Heartbeat — und am Ende trotzdem ein Vergehen für etwas, das der Sub
  // nie zu sehen bekam.
  const rows = await prisma.task.findMany({
    where: {
      userId,
      withdrawnAt: null,
      OR: [{ completedAt: null }, { holdUntil: { gte: new Date(now.getTime() - RECENT_WINDOW_MS) } }],
    },
    orderBy: { holdUntil: "desc" },
    take: 50,
    include: TASK_INCLUDE,
  });
  // Angezeigt wird nach nächster Frist zuerst.
  return rows.reverse();
}

/** Gehört die Aufgabe noch aufs Dashboard? Offene immer, Abgeschlossene nur kurz — danach Historie. */
export function isRecentEnough(e: EvaluatedTask, now: Date): boolean {
  if (isTaskOpen(e.evaluation.state)) return true;
  return now.getTime() - e.task.holdUntil.getTime() <= RECENT_WINDOW_MS;
}

/** Laden + auswerten in einem — die Kette `getDashboardTasks` → `evaluateTasks` stand sonst an vier
 *  Stellen wortgleich, jede mit eigenem Filter und eigenem (oder fehlendem) Label. */
export async function getEvaluatedTasks(
  userId: string,
  now: Date,
  kgLabel?: string,
  source: TaskEntrySource = {},
): Promise<EvaluatedTask[]> {
  return evaluateTasks(userId, await getDashboardTasks(userId, now), now, kgLabel, source);
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
  const matches = (r: EvaluatedTask["requirements"][number]): boolean => {
    if ("kg" in target) return r.type === "KG_LOCKED";
    if (r.type !== "WEAR") return false;
    return r.deviceId ? r.deviceId === target.deviceId : r.categoryId === target.categoryId;
  };

  // Vorfilter in SQL: nennt gar keine Aufgabe dieses Gerät bzw. den KG, ist die Antwort leer — und
  // die Eintragstabellen werden nicht angefasst. Das ist der Normalfall auf zwei Formular-Seiten, die
  // sonst bei JEDEM Aufbau die ganze Trage-Historie paaren würden.
  //
  // Bewusst NUR strukturell (Besitz + Bedingungsart), ohne `holdUntil`/`completedAt`: der Zustand ist
  // abgeleitet, und ein Vorfilter, der enger greift als die Auswertung danach, verschluckt genau die
  // Warnung, für die es die Funktion gibt. Eine bereits selbst gemeldete, aber noch laufende Aufgabe
  // ist weiterhin offen — sie fiele sonst raus, und der Sub liefe ohne Vorwarnung in ein Vergehen.
  const relevant = await prisma.task.count({
    where: {
      userId,
      withdrawnAt: null,
      requirements: {
        some: "kg" in target
          ? { type: "KG_LOCKED" }
          : { type: "WEAR", OR: [{ categoryId: target.categoryId }, ...(target.deviceId ? [{ deviceId: target.deviceId }] : [])] },
      },
    },
  });
  if (relevant === 0) return [];

  return (await getEvaluatedTasks(userId, now))
    .filter((e) => isTaskOpen(e.evaluation.state) && e.requirements.some((r) => r.satisfied && matches(r)))
    .map((e) => ({ title: e.task.title, holdUntil: e.task.holdUntil.toISOString() }));
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
  /** Anzeigename der KG-Bedingung. Wo keine Bedingungsnamen gebraucht werden (Strafbuch, Heartbeat),
   *  reicht der Default — „KG" ist in beiden Sprachen derselbe Eigenname. */
  kgLabel = "KG",
  /** Bereits geladene Einträge des Aufrufers. Was fehlt, wird nachgeladen. */
  source: TaskEntrySource = {},
): Promise<EvaluatedTask[]> {
  if (tasks.length === 0) return [];

  const needsKg = tasks.some((t) => t.requirements.some((r) => r.type === "KG_LOCKED"));
  const needsWear = tasks.some((t) => t.requirements.some((r) => r.type === "WEAR"));

  const byTime = <T extends { startTime: Date }>(list: T[]) =>
    [...list].sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

  const [kgEntries, wearEntries, reinigung] = await Promise.all([
    !needsKg ? Promise.resolve([])
      : source.kgEntries ? Promise.resolve(byTime(source.kgEntries.filter((e) => e.type === "VERSCHLUSS" || e.type === "OEFFNEN")))
      : prisma.entry.findMany({
          where: { userId, type: { in: ["VERSCHLUSS", "OEFFNEN"] } },
          orderBy: { startTime: "asc" },
          select: { id: true, type: true, startTime: true, oeffnenGrund: true },
        }),
    !needsWear ? Promise.resolve([])
      : source.wearEntries ? Promise.resolve(byTime(source.wearEntries.filter((e) => e.type === "WEAR_BEGIN" || e.type === "WEAR_END")))
      : prisma.entry.findMany({
          where: { userId, type: { in: ["WEAR_BEGIN", "WEAR_END"] } },
          orderBy: { startTime: "asc" },
          select: SESSION_ENTRY_SELECT,
        }),
    // Die Reinigungs-Regeln des Nutzers — siehe die Begründung bei `kgPairs`.
    !needsKg ? Promise.resolve(null) : prisma.user.findUnique({
      where: { id: userId },
      select: { reinigungErlaubt: true, reinigungMaxMinuten: true },
    }),
  ]);

  // „Verschlossen" heisst hier dasselbe wie überall sonst in der App: eine ERLAUBTE Reinigungspause
  // (REINIGUNG-Öffnung, rechtzeitig wieder verschlossen) unterbricht die Session, beendet sie aber
  // nicht. Deshalb `buildPairs` mit den Reinigungs-Regeln statt des schlichten `buildKgWearPairs` —
  // sonst bekäme der Sub ein Vergehen für ein Verhalten, das ihm ausdrücklich erlaubt ist, und das
  // Strafbuch beurteilte dieselbe Öffnung an zwei Stellen gegensätzlich.
  const reinigungSettings: ReinigungSettings = {
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
   *  Sessions je Bedingung sonst quadratisch. Eine Trage-Session hat genau ein Gerät
   *  (`buildWearSessions` gruppiert danach), es steht am Kopf-Segment. */
  const pairsByDevice = new Map<string, Interval[]>();
  for (const s of wearSessions) {
    const deviceId = s.segments[0]?.deviceDeclared.id;
    if (!deviceId) continue;
    const iv = { start: s.start, end: s.end ?? now };
    const list = pairsByDevice.get(deviceId);
    if (list) list.push(iv);
    else pairsByDevice.set(deviceId, [iv]);
  }

  return tasks.map((task) => {
    const perRequirement: Interval[][] = task.requirements.map((r) => {
      // „Verschlossen" heisst verschlossen — welches KG dabei getragen wird, fordert das Formular
      // heute nicht an (dafür gibt es die Verschluss-Anforderung mit Gerätevorgabe).
      if (r.type === "KG_LOCKED") return kgPairs;
      if (r.deviceId) return pairsByDevice.get(r.deviceId) ?? [];
      return r.categoryId ? (pairsByCategory.get(r.categoryId) ?? []) : [];
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

    const evaluation = evaluateTask(task, requirements, perRequirement, now);
    return { task, evaluation, requirements };
  });
}
