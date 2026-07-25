import { mergeWearPairs, type WearPair } from "@/lib/utils";

/**
 * Aufgaben-Auswertung — die reine Logik hinter „ist die Aufgabe erfüllt?".
 *
 * Der Zustand einer Aufgabe wird NICHT gespeichert, sondern bei jeder Anzeige aus den Einträgen
 * abgeleitet. Jede Bedingung liefert die Intervalle, in denen sie galt (Trage-Paare bzw.
 * Verschluss-Paare); die Aufgabe läuft ab dem Zeitpunkt, an dem ALLE gleichzeitig gelten.
 *
 * Warum abgeleitet statt gestempelt:
 *  - `POST /api/entries` bleibt unangetastet — dort hängen TOCTOU-Transaktion, Box-Kommando,
 *    Sperrzeit-Erzeugung und der Offline-Replay dran.
 *  - Vom Keyholder nachgetragene Einträge zählen automatisch mit (derselbe Datenpfad).
 *  - Ein korrigierter oder gelöschter Eintrag korrigiert die Aufgabe von selbst.
 *  - Eine nachträglich verschobene `holdUntil` wirkt sofort richtig, statt auf einem eingefrorenen
 *    Urteil zu sitzen.
 *
 * Diese Datei ist bewusst importfrei bis auf `@/lib/utils` (reine Zeit-Arithmetik) — damit bleibt sie
 * auch aus Client-Komponenten erreichbar, gleiche Regel wie `constants.ts`.
 */

/** Ein Zeitraum, in dem eine Bedingung galt. `end` ist bei laufenden Intervallen bereits auf „jetzt"
 *  gesetzt (die Paar-Builder tun das) — hier gilt jedes Intervall als abgeschlossen. */
export type Interval = WearPair;

export type TaskState =
  /** Frist läuft, noch keine einzige Bedingung erfüllt (oder Aufgabe ohne Bedingungen offen). */
  | "pending"
  /** Ein Teil der Bedingungen ist erfüllt — bewusst NICHT `pending`: wer zwei von drei Geräten
   *  angelegt hat, darf nicht dasselbe sehen wie jemand, der nichts getan hat. */
  | "partial"
  /** Alle Bedingungen gelten, die Zeit bis `holdUntil` läuft. */
  | "running"
  /** Durchgehalten bis `holdUntil` (und, wo nötig, vom Sub als erledigt gemeldet). */
  | "done"
  /** Frist verstrichen, ohne dass je alle Bedingungen gleichzeitig galten. */
  | "missed"
  /** Es lief, aber eine Bedingung fiel vor `holdUntil` weg. */
  | "aborted"
  /** Von der Keyholderin zurückgenommen. Bewusst ein eigener Zustand und nicht `aborted`: das eine
   *  ist ihr Entschluss, das andere ein Versäumnis des Subs — und ein Rückzug darf nie ein Vergehen
   *  werden. Als Zustand statt als Aufrufer-Pflicht, damit ihn niemand vergessen kann. */
  | "withdrawn";

export interface TaskRequirementLike {
  id: string;
  /** Anzeigename für „Fehlt noch: Knebel" — der Aufrufer löst Kategorie/Gerät zu einem Namen auf. */
  label: string;
}

export interface TaskLike {
  createdAt: Date;
  holdUntil: Date;
  startGraceMin: number;
  /** Selbstmeldung des Subs; bei Aufgaben MIT Bedingungen zusätzlich nötig, ohne Bedingungen ist sie
   *  die Erfüllung. */
  completedAt: Date | null;
  withdrawnAt: Date | null;
}

export interface TaskEvaluation {
  state: TaskState;
  /** Ab wann alle Bedingungen gleichzeitig galten. null = nie. */
  startedAt: Date | null;
  /** Bedingungen, die JETZT nicht gelten — für „Fehlt noch: Knebel". Leer, sobald alles läuft. */
  missing: TaskRequirementLike[];
  /** Bei `aborted`: welche Bedingung wegfiel und wann. Beleg statt blossem Vorwurf — die
   *  Intervall-Logik kennt die Antwort ohnehin, sie wegzuwerfen wäre Verlust. */
  failedRequirement: TaskRequirementLike | null;
  failedAt: Date | null;
  /** Bedingungen erfüllt, aber die Selbstmeldung fehlt noch (nur bei Aufgaben mit Bedingungen). */
  awaitingConfirmation: boolean;
}

/** Späteste Zeit, zu der begonnen werden darf. Wer danach erst anfängt, hat per Definition nicht
 *  durchgehend gehalten — sonst wäre „eine Minute vor Schluss alles anlegen" eine Erfüllung. */
export function startDeadline(task: Pick<TaskLike, "createdAt" | "startGraceMin">): Date {
  return new Date(task.createdAt.getTime() + task.startGraceMin * 60_000);
}

/** Schnittmenge zweier bereits verschmolzener, aufsteigend sortierter Intervall-Listen. */
function intersectTwo(a: Interval[], b: Interval[]): Interval[] {
  const out: Interval[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    const start = Math.max(a[i].start.getTime(), b[j].start.getTime());
    const end = Math.min(a[i].end.getTime(), b[j].end.getTime());
    if (start < end) out.push({ start: new Date(start), end: new Date(end) });
    // Das früher endende Intervall ist erschöpft.
    if (a[i].end.getTime() < b[j].end.getTime()) i++;
    else j++;
  }
  return out;
}

/**
 * „Alle Bedingungen gleichzeitig erfüllt" — die Schnittmenge über alle Bedingungen.
 * Ohne Bedingungen ist nichts einzuschränken: das Ergebnis ist leer, und der Aufrufer behandelt die
 * Aufgabe als reine Freitext-Aufgabe.
 *
 * Verschmilzt die Eingaben selbst — überlappende Intervalle sind der Normalfall (zwei Plugs derselben
 * Kategorie gleichzeitig getragen). Damit muss kein Aufrufer daran denken.
 */
export function intersectAll(perRequirement: Interval[][]): Interval[] {
  if (perRequirement.length === 0) return [];
  let acc = mergeWearPairs(perRequirement[0]);
  for (let k = 1; k < perRequirement.length; k++) {
    acc = intersectTwo(acc, mergeWearPairs(perRequirement[k]));
    if (acc.length === 0) return [];
  }
  return acc;
}

/** Deckt die Intervall-Liste `[from, until]` lückenlos ab? */
export function coversContinuously(intervals: Interval[], from: Date, until: Date): boolean {
  if (from.getTime() >= until.getTime()) return true;
  let cursor = from.getTime();
  for (const iv of intervals) {
    if (iv.start.getTime() > cursor) return false; // Lücke
    cursor = Math.max(cursor, iv.end.getTime());
    if (cursor >= until.getTime()) return true;
  }
  return false;
}

/** Gilt eine Bedingung zum Zeitpunkt `at`?
 *
 *  Das Ende zählt EINSCHLIESSLICH: ein laufendes Trage-/Verschluss-Intervall trägt per Konvention der
 *  Paar-Builder `end = now`. Mit einem exklusiven Ende gälte ausgerechnet die gerade getragene
 *  Bedingung als nicht erfüllt — der Sub sähe „fehlt noch", während er das Gerät anhat. */
export function coversPoint(intervals: Interval[], at: Date): boolean {
  const t = at.getTime();
  return intervals.some((iv) => iv.start.getTime() <= t && t <= iv.end.getTime());
}

/**
 * Wertet eine Aufgabe aus. `perRequirement[i]` sind die Intervalle der Bedingung `requirements[i]`
 * (gleiche Reihenfolge).
 *
 * Ablauf: Beginn = erster Zeitpunkt, ab dem die Schnittmenge gilt UND der innerhalb der Kulanzfrist
 * liegt. Von dort muss die Schnittmenge bis `holdUntil` lückenlos decken.
 */
export function evaluateTask(
  task: TaskLike,
  requirements: TaskRequirementLike[],
  perRequirement: Interval[][],
  now: Date,
): TaskEvaluation {
  const base: TaskEvaluation = {
    state: "pending",
    startedAt: null,
    missing: [],
    failedRequirement: null,
    failedAt: null,
    awaitingConfirmation: false,
  };

  // Zurückgezogen schlägt alles: weder offen noch Vergehen, egal was die Einträge sagen.
  if (task.withdrawnAt) return { ...base, state: "withdrawn" };

  // Aufgabe ohne Bedingungen: allein die Selbstmeldung entscheidet — aber sie muss RECHTZEITIG sein.
  // Ohne den Zeitvergleich heilte eine Meldung von heute eine gestern verpasste Frist rückwirkend und
  // das Vergehen verschwände spurlos.
  if (requirements.length === 0) {
    if (task.completedAt) {
      return { ...base, state: task.completedAt <= task.holdUntil ? "done" : "missed" };
    }
    return { ...base, state: now >= task.holdUntil ? "missed" : "pending" };
  }

  // Bewusst NICHT vorab verschmelzen: `intersectAll` tut das selbst, und `coversPoint` fragt nur
  // „deckt irgendein Intervall diesen Zeitpunkt?" — dafür ist Verschmelzen ohne Wirkung. Ein
  // zusätzliches `map(mergeWearPairs)` wäre ein Sort je Bedingung je Aufgabe für nichts.
  const combined = intersectAll(perRequirement);
  const deadline = startDeadline(task);

  // Beginn: erster Schnitt-Abschnitt, der bis in die Laufzeit der Aufgabe hineinreicht UND spätestens
  // zur Kulanzfrist gilt.
  //
  // Das `end > createdAt` ist nicht kosmetisch: ohne es kapert das FRÜHESTE je aufgezeichnete
  // Intervall die Suche — trug der Sub dieselben Geräte zufällig schon Stunden vorher, wurde der
  // Beginn auf `createdAt` hochgezogen, obwohl damals nichts anlag, und die Aufgabe galt ab Minute 1
  // als abgebrochen. Ein Vergehen für tadelloses Verhalten, und zwar bei jedem Nutzer mit Vorgeschichte.
  const candidates = combined.filter(
    (iv) => iv.end.getTime() > task.createdAt.getTime()
      && Math.max(iv.start.getTime(), task.createdAt.getTime()) <= deadline.getTime(),
  );
  const startsOf = (iv: Interval) => new Date(Math.max(iv.start.getTime(), task.createdAt.getTime()));

  // Bis wann muss gedeckt sein? Vor der Frist zählt nur „bis jetzt".
  const until = now < task.holdUntil ? now : task.holdUntil;

  // Unter den fristgerechten Kandidaten den ERSTEN nehmen, von dem aus es durchhält — nicht blind den
  // frühesten. Sonst schlägt eine Unterbrechung INNERHALB der Kulanzfrist alles: wer das Gerät schon
  // vorher trug, es um 12:05 kurz ablegt und um 12:20 (noch in der Frist) wieder anlegt, wäre
  // „abgebrochen", während jemand, der bis 12:20 gar nichts tat, sauber dasteht. Das korrektere
  // Verhalten dürfte nie das härtere Urteil bekommen.
  //
  // Fällt keiner durch, bleibt der früheste Kandidat: er trägt den Beleg (`failedAt`), den die
  // Abbruch-Meldung braucht.
  const startIv = candidates.find((iv) => coversContinuously(combined, startsOf(iv), until)) ?? candidates[0];
  const startedAt = startIv ? startsOf(startIv) : null;

  if (!startedAt) {
    // Noch nicht (rechtzeitig) begonnen. Vor Ablauf der Kulanzfrist: was fehlt noch?
    const missing = requirements.filter((_, k) => !coversPoint(perRequirement[k], now));
    if (now.getTime() > deadline.getTime()) {
      return { ...base, state: "missed", missing };
    }
    return {
      ...base,
      state: missing.length < requirements.length ? "partial" : "pending",
      missing,
    };
  }

  // Es lief. Hat es bis zum Ende (bzw. bis jetzt) durchgehalten?
  if (!coversContinuously(combined, startedAt, until)) {
    // Erste Lücke finden → welche Bedingung fiel wann weg?
    const runIv = combined.find((iv) => iv.start.getTime() <= startedAt.getTime() && iv.end.getTime() > startedAt.getTime());
    const failedAt = runIv ? runIv.end : startedAt;
    // Eine Millisekunde NACH dem Ausfall prüfen: zum Ausfallzeitpunkt selbst gilt die Bedingung noch
    // (Ende einschliessend, siehe coversPoint) — genau dort wäre die Suche sonst ergebnislos.
    const afterFailure = new Date(failedAt.getTime() + 1);
    const failedIdx = perRequirement.findIndex((iv) => !coversPoint(iv, afterFailure));
    return {
      ...base,
      state: "aborted",
      startedAt,
      failedRequirement: failedIdx >= 0 ? requirements[failedIdx] : null,
      failedAt,
    };
  }

  if (now < task.holdUntil) return { ...base, state: "running", startedAt };

  // Durchgehalten. Der Textteil („ist die Wohnung sauber?") ist nicht prüfbar — dafür die Selbstmeldung.
  // Sie muss NACH dem Beginn liegen: eine Meldung aus Minute 1, bevor überhaupt alles anlag, ist keine
  // Aussage über das Ergebnis.
  const confirmed = task.completedAt !== null && task.completedAt >= startedAt;
  if (!confirmed) return { ...base, state: "running", startedAt, awaitingConfirmation: true };
  return { ...base, state: "done", startedAt };
}

/** Zählt als offen und damit anzeigepflichtig? */
export function isTaskOpen(state: TaskState): boolean {
  return state === "pending" || state === "partial" || state === "running";
}

/** Ein Vergehen? `missed` (nie begonnen) und `aborted` (zu früh abgelegt) schliessen einander aus. */
export function isTaskOffense(state: TaskState): boolean {
  return state === "missed" || state === "aborted";
}
