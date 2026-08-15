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
  | "withdrawn"
  /**
   * Bedingungen gehalten und alle Nachweise da, aber mindestens einer ist maschinell nicht
   * entscheidbar und wartet auf die Sichtung der Keyholderin.
   *
   * Ein eigener Zustand, weil weder „erfüllt" noch „versäumt" wahr wäre: der Sub hat getan, was er
   * konnte, und niemand hat bisher geurteilt. Ihn als `done` zu führen verschenkte das Urteil, als
   * `missed` bestrafte er eine ausstehende Handlung der Keyholderin. Für den SUB ist die Aufgabe
   * damit abgeschlossen (er kann nichts mehr tun), für die KEYHOLDERIN offen — deshalb zählt er
   * nicht zu {@link isTaskOpen}, wohl aber zu {@link needsKeyholderReview}.
   */
  | "awaitingReview";

export interface TaskRequirementLike {
  id: string;
  /** Anzeigename für „Fehlt noch: Knebel" — der Aufrufer löst Kategorie/Gerät zu einem Namen auf. */
  label: string;
}

export interface TaskLike {
  createdAt: Date;
  /**
   * TERMINIERT: ab wann die Aufgabe überhaupt gilt. `null`/fehlend = sofort wirksam, wie bisher.
   *
   * Sie ist nicht bloss ein Sichtbarkeits-Schalter, sondern der NULLPUNKT dieser Aufgabe — siehe
   * {@link taskAnchor}. Optional, weil das Fehlen „wie bisher" bedeutet: jede Stelle, die eine
   * Aufgabe ohne dieses Feld auswertet, rechnet unverändert ab `createdAt`.
   */
  wirksamAb?: Date | null;
  /**
   * Das Ende — im Dauer-Modus (siehe {@link TaskLike.holdDurationMin}) das SPÄTESTMÖGLICHE.
   *
   * Es bleibt dort trotzdem gefüllt und bleibt eine obere Schranke für das wirksame Ende. Daran
   * hängt alles, was über SQL geht (Indizes, Sortierung, die Vorauswahl des Pollers) — nichts davon
   * kann einen abgeleiteten Wert lesen, und zu kurz schätzen darf keines.
   */
  holdUntil: Date;
  startGraceMin: number;
  /**
   * DAUER-MODUS: Haltezeit in Minuten ab dem tatsächlichen Beginn. `null`/fehlend = klassischer
   * Modus, `holdUntil` ist das feste Ende.
   *
   * Optional, weil das Fehlen die Bedeutung „wie bisher" hat: jede Stelle, die eine Aufgabe nur
   * gegen ihr festes Ende misst, bleibt damit richtig, ohne das Feld zu kennen.
   */
  holdDurationMin?: number | null;
  /**
   * Müssen die Aufnahmezeiten der Nachweise ihrer Reihenfolge folgen? `false` schaltet die Prüfung ab.
   *
   * Optional, weil das Fehlen „wie bisher" heisst — also `true`. Nur das ausdrückliche `false` ändert
   * etwas; jede Stelle, die eine Aufgabe ohne dieses Feld auswertet, urteilt unverändert weiter.
   */
  proofOrderMatters?: boolean;
  /** Selbstmeldung des Subs; bei Aufgaben MIT Bedingungen zusätzlich nötig, ohne Bedingungen ist sie
   *  die Erfüllung. */
  completedAt: Date | null;
  withdrawnAt: Date | null;
}

export interface TaskEvaluation {
  state: TaskState;
  /**
   * Das WIRKSAME Ende dieser Aufgabe — im klassischen Modus `task.holdUntil`, im Dauer-Modus
   * `startedAt` + Dauer (und vor dem Beginn das spätestmögliche Ende).
   *
   * Teil der Auswertung und nicht Sache der Aufrufer, weil es ohne den abgeleiteten `startedAt`
   * gar nicht zu haben ist: wer es selbst ausrechnen wollte, bräuchte dieselbe Intervall-Rechnung
   * noch einmal. Jede Stelle, die „bis wann?" beantwortet — Karte, Ablege-Warnung, Vergehens-Datum,
   * Nachweis-Frist —, liest es HIER und nicht an der Zeile.
   */
  holdUntil: Date;
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
  /**
   * Die Bedingungen liegen an und `holdUntil` ist noch nicht erreicht — es wird gerade GEHALTEN.
   *
   * Nur bei Aufgaben MIT Bedingungen wahr, und darin steckt der Unterschied, den `holdUntil` allein
   * nicht hergibt: mit Bedingungen ist es eine HALTEFRIST („halte den Plug bis 18:36"), ohne
   * Bedingungen ein TERMIN („staubsauge bis 18:36"). Nur im ersten Fall ist eine Selbstmeldung vor
   * Ablauf eine Aussage über eine Stunde, die noch nicht stattgefunden hat.
   *
   * Hier und nicht in der Anzeige, obwohl sich beides aus `requirements.length` und einer Uhr
   * herleiten liesse: der Vergleich mit `holdUntil` steht ohnehin genau hier (siehe unten), und die
   * Karte ist eine Client-Komponente. Sie müsste die Zeit ein zweites Mal messen — und der Knopf
   * spränge beim Hydrieren, wenn die Uhr des Handys anders geht als die des Servers.
   */
  holdRunning: boolean;
  /** Ein Nachweis wartet noch auf seine automatische Code-Prüfung. Nur für den Poller: er darf ein
   *  Ergebnis erst melden UND stempeln, wenn es feststeht — sonst ist die Meldung „bitte sichten"
   *  raus und dauerhaft gestempelt, während die Prüfung Sekunden später „erfüllt" ergibt und das
   *  niemand mehr erfährt. */
  proofCheckPending: boolean;
  /**
   * Nachweise mit EIGENER Fälligkeit, deren Frist verstrichen ist, ohne dass etwas eingereicht wurde.
   *
   * Der Beleg zum Urteil, wie {@link failedRequirement} auf der Bedingungs-Achse: ohne ihn zeigte die
   * Zeile weiter „offen" (mitsamt Aufnahme-Link), während die Aufgabe darüber „versäumt" meldet — und
   * der Träger liefe in ein Formular, dessen Absenden der Dienst ohnehin abweist.
   *
   * HIER und nicht in der Anzeige, obwohl sich beides aus Frist und Uhr herleiten liesse: die
   * Auswertung ist die einzige Schicht, die „jetzt" kennt. Die Karten-Sicht (`toTaskCard`) und das
   * MCP-Dashboard sind reine Abbildungen einer bereits getroffenen Auswertung; eine zweite Uhr dort
   * gäbe zwei Antworten auf dieselbe Frage.
   *
   * Nur Nachweise MIT eigener Fälligkeit stehen hier. Wo die Frist der Aufgabe die kürzere ist,
   * urteilt die Aufgabe selbst — ein zusätzliches „überfällig" an der Zeile wiederholte nur, was ihr
   * Zustand ohnehin sagt.
   */
  overdueProofIds: string[];
}

/**
 * Der NULLPUNKT einer Aufgabe: ab wann ihre Uhren laufen.
 *
 * Eine terminierte Aufgabe gibt es für den Träger vor `wirksamAb` nicht — Kulanzfrist, Ende und die
 * Frage, welche Trage-Intervalle überhaupt als Beginn in Frage kommen, dürfen deshalb nicht ab dem
 * Stellen zählen. Sonst wäre eine am Vorabend für 07:00 gestellte Aufgabe bei ihrem Wirksamwerden
 * längst versäumt.
 *
 * EIN Einzeiler, den alle drei Stellen teilen ({@link startDeadline}, das spätestmögliche Ende im
 * Dauer-Modus, der Kandidaten-Filter in {@link evaluateTask}) — als dreimal hingeschriebenes `??`
 * wäre es die Sorte Regel, die an einer Stelle nachgezogen wird und an den anderen nicht.
 */
export function taskAnchor(task: Pick<TaskLike, "createdAt" | "wirksamAb">): Date {
  return task.wirksamAb ?? task.createdAt;
}

/** Späteste Zeit, zu der begonnen werden darf. Wer danach erst anfängt, hat per Definition nicht
 *  durchgehend gehalten — sonst wäre „eine Minute vor Schluss alles anlegen" eine Erfüllung. */
export function startDeadline(task: Pick<TaskLike, "createdAt" | "startGraceMin" | "wirksamAb">): Date {
  return new Date(taskAnchor(task).getTime() + task.startGraceMin * 60_000);
}

/**
 * Wie lange MINDESTENS zu halten ist: von der spätesten erlaubten Startzeit bis zum Ende.
 *
 * Die Zahl, die beide Seiten eigentlich meinen — der Keyholder stellt „2 Stunden", verlangt damit
 * aber nur eineinhalb, weil die Kulanzfrist davon abgeht. Sie steht hier und nicht im Formular, weil
 * dieselbe Grösse an drei Stellen gebraucht wird: die Vorschau der Keyholderin, die Karte des Subs
 * und — als Vorzeichen — die Schranke des Servers.
 *
 * Ein Ergebnis ≤ 0 ist genau der Zustand, den `checkTaskFields` mit `TASK_HOLD_UNTIL_TOO_SOON`
 * abweist: die Aufgabe verlangte Deckung bis zu einem Zeitpunkt, zu dem noch gar nicht begonnen sein
 * muss. Deshalb keine Klemmung auf 0 — der Aufrufer soll den Widerspruch sehen können.
 *
 * Im DAUER-MODUS ist die Antwort schlicht die eingestellte Dauer: sie läuft erst ab dem Beginn, die
 * Kulanz geht ihr also nicht mehr ab. Genau darum gibt es den Modus.
 */
export function minHoldMs(
  task: Pick<TaskLike, "createdAt" | "startGraceMin" | "holdUntil" | "holdDurationMin" | "wirksamAb">,
): number {
  if (task.holdDurationMin) return task.holdDurationMin * 60_000;
  return task.holdUntil.getTime() - startDeadline(task).getTime();
}

/**
 * Das WIRKSAME Ende: im Dauer-Modus ab dem tatsächlichen Beginn gerechnet, sonst das feste `holdUntil`.
 *
 * `startedAt` ist der Zeitpunkt, ab dem ALLE Bedingungen gleichzeitig gelten — bei mehreren Geräten
 * also das letzte angelegte. Ohne Beginn bleibt das spätestmögliche Ende stehen: solange nichts
 * anliegt, ist das die einzige wahre Aussage über die Frist.
 *
 * INVARIANTE: das Ergebnis liegt nie NACH `task.holdUntil`. Der Beginn kann höchstens bis zur
 * Kulanzfrist liegen (`evaluateTask` verwirft spätere Kandidaten), und `holdUntil` ist im Dauer-Modus
 * als {@link taskAnchor} + Kulanz + Dauer geschrieben. Darauf verlässt sich die Vorauswahl des Pollers: sie
 * sucht über die Spalte und darf keine Aufgabe verpassen, die längst entschieden ist.
 */
export function effectiveHoldUntil(
  task: Pick<TaskLike, "holdUntil" | "holdDurationMin">,
  startedAt: Date | null,
): Date {
  if (!task.holdDurationMin || !startedAt) return task.holdUntil;
  return new Date(startedAt.getTime() + task.holdDurationMin * 60_000);
}

/**
 * Zählt die Reihenfolge der Nachweise bei dieser Aufgabe? — die EINE Auflösung von
 * {@link TaskLike.proofOrderMatters}.
 *
 * Eine Whitelist mit genau einem erlaubten Abweicher: nur das ausdrückliche `false` schaltet ab,
 * alles andere (fehlend, `null`, ein Wert aus einem rohen JSON-Body) bleibt bei der strengeren
 * Vorgabe. Eine Falscheingabe lockert damit nie eine Forderung.
 *
 * Als Funktion und nicht als `!== false` an jeder Fundstelle — dieselbe Begründung wie bei
 * {@link effectivePenaltyReason}: Urteil, Anzeige, Service und die dryRun-Vorschau des MCP müssen
 * denselben Wert bekommen, sonst verspricht die Vorschau „egal", wo der Commit „muss aufsteigen"
 * schreibt. Verteilt geschrieben stünde die Regel fünfmal da, zweimal davon negiert.
 */
export function effectiveProofOrderMatters(value: boolean | null | undefined): boolean {
  return value !== false;
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

/** Ein gefordertes Nachweis-Foto, so weit die Auswertung es kennt (siehe `TaskProof`). */
export interface ProofLike {
  id: string;
  sortOrder: number;
  /** Verlangt einen Zufallscode im Bild — nur damit ist der Nachweis maschinell entscheidbar. */
  requireCode: boolean;
  /**
   * EIGENE Fälligkeit in Minuten ab dem Nullpunkt der Aufgabe ({@link taskAnchor}). `null` = wie
   * bisher: der Nachweis ist bis zum Ende der Aufgabe offen.
   *
   * Optional wie die übrigen Nachzügler dieses Modells, und aus demselben Grund: das Fehlen bedeutet
   * „wie bisher". Jede Stelle, die einen Nachweis ohne dieses Feld auswertet, misst ihn unverändert
   * gegen das Ende der Aufgabe. Aufgelöst wird der Wert ausschliesslich über {@link proofDeadline}.
   */
  dueOffsetMin?: number | null;
  submittedAt: Date | null;
  /** Aufnahmezeit (EXIF). Fehlt sie, ist die Reihenfolge nicht prüfbar. */
  imageExifTime: Date | null;
  /** Wie am Kontroll-Eintrag: null = nicht geprüft (oder nicht gematcht), "ai" = erkannt und passend.
   *  Den GRUND eines Nicht-Matches trägt `verifikationReason` — für die Auswertung genügt hier, DASS
   *  nicht gematcht wurde. */
  verifikationStatus: string | null;
  /** Gesetzt, wenn die Prüfung lief und NICHT matchte (`VerifyReason`). Unterscheidet „noch nicht
   *  geprüft" von „geprüft und durchgefallen" — beide haben `verifikationStatus: null`. */
  verifikationReason: string | null;
  reviewAccepted: boolean | null;
}

/**
 * Bis wann DIESER Nachweis erbracht sein muss — die zweite Zeitachse der Nachweise.
 *
 * Ohne eigene Fälligkeit (`dueOffsetMin: null`) ist es unverändert das Ende der Aufgabe: jede
 * Bestandszeile wird damit exakt wie bisher gemessen. Mit eigener Fälligkeit zählt sie ab dem
 * NULLPUNKT der Aufgabe ({@link taskAnchor}), nicht ab dem Stellen — bei einer terminierten Aufgabe
 * beginnt sie also erst mit dem Auslösen, wie jede andere ihrer Fristen auch.
 *
 * `holdUntil` bleibt die OBERE SCHRANKE, und zwar hier als `Math.min` und nicht bloss als Regel beim
 * Anlegen: die SQL-Vorauswahl des Pollers sucht über die Spalte `Task.holdUntil`, und eine
 * Nachweis-Frist dahinter wäre eine Frist, die er nie aufgreift. Der Dienst weist sie beim Anlegen
 * ab (`TASK_PROOF_DUE_AFTER_END`); diese Klemmung ist die zweite Naht, die auch für Zeilen hält, die
 * ihre Frist nachträglich verkürzt bekommen haben (`edit_task`).
 */
export function proofDeadline(
  proof: Pick<ProofLike, "dueOffsetMin">,
  task: Pick<TaskLike, "createdAt" | "wirksamAb">,
  /** Das Ende der AUFGABE: im Dauer-Modus das WIRKSAME (aus {@link evaluateTask}), sonst `holdUntil`. */
  holdUntil: Date,
): Date {
  if (proof.dueOffsetMin == null) return holdUntil;
  const own = taskAnchor(task).getTime() + proof.dueOffsetMin * 60_000;
  return new Date(Math.min(own, holdUntil.getTime()));
}

/**
 * Die EIGENE Fälligkeit eines Nachweises — oder `null`, wo er bis zum Ende der Aufgabe offen ist.
 *
 * Der Unterschied zu {@link proofDeadline} ist die Frage, die gestellt wird: die Auswertung will
 * wissen, WOGEGEN sie misst (immer ein Zeitpunkt), die Anzeige will wissen, ob es überhaupt etwas
 * EIGENES zu zeigen gibt. Ohne diese zweite Form stünde `dueOffsetMin == null ? null : …` an jeder
 * Anzeige noch einmal — dreimal geschrieben war es bereits, und die drei Fassungen wichen im
 * dritten Argument schon voneinander ab.
 */
export function ownProofDeadline(
  proof: Pick<ProofLike, "dueOffsetMin">,
  task: Pick<TaskLike, "createdAt" | "wirksamAb">,
  holdUntil: Date,
): Date | null {
  return proof.dueOffsetMin == null ? null : proofDeadline(proof, task, holdUntil);
}

/**
 * Zählt dieser Nachweis? — RECHTZEITIG eingereicht, gemessen an seiner eigenen Frist.
 *
 * Die EINE Formulierung dieser Frage: die Nachweis-Achse ({@link evaluateProofs}) und der Beleg an
 * der Zeile ({@link overdueProofsAt}) müssen sie gleich beantworten. Zwei eigene Fassungen wichen
 * schon einmal genau um den Fall ab, den man am wenigsten sieht: ein Foto, das NACH seiner Frist
 * hochgeladen wurde, zählte für das Urteil nicht — die Zeile zeigte es aber weiter als „erbracht",
 * und über einem Versäumnis stand ein grünes Häkchen ohne Erklärung.
 */
function proofCounted(p: ProofLike, task: Pick<TaskLike, "createdAt" | "wirksamAb">, end: Date): boolean {
  return p.submittedAt !== null && p.submittedAt <= proofDeadline(p, task, end);
}

/**
 * Welche Nachweise ihre EIGENE Frist verstreichen liessen, mit dem Zeitpunkt, an dem das geschah.
 *
 * Gegen `end` gemessen, weil jede Nachweis-Frist dort gedeckelt ist ({@link proofDeadline}) — und
 * `end` ist je nach Kenntnisstand ein anderes: solange kein Beginn feststeht, ist es das
 * spätestmögliche Ende der Aufgabe, danach ihr wirksames. Als EIN Helfer, damit die Auswertung
 * dieselbe Liste zweimal mit verschiedenen Enden bilden kann, ohne die Regel zweimal hinzuschreiben.
 *
 * Nicht bloss „nichts eingereicht", sondern „zählt nicht UND die Frist ist um": ein nach seiner
 * Frist nachgereichtes Foto ist genauso versäumt, und das Urteil sagt das ohnehin schon.
 *
 * Nur Nachweise MIT eigener Frist: wo die Frist der Aufgabe die einzige ist, urteilt die Aufgabe
 * selbst, und ein zusätzliches „überfällig" an der Zeile wiederholte bloss ihren Zustand.
 *
 * Die FRIST kommt mit zurück, nicht nur die Id — sie ist die Tatzeit des Vergehens. Ohne sie
 * datierte das Strafbuch es auf das Ende der Aufgabe (`failedAt ?? holdUntil`), also Stunden nach
 * dem Zeitpunkt, an dem es entstanden ist.
 */
function overdueProofsAt(
  proofs: ProofLike[],
  task: Pick<TaskLike, "createdAt" | "wirksamAb">,
  end: Date,
  now: Date,
): { id: string; due: Date }[] {
  return proofs
    .filter((p) => p.dueOffsetMin != null && !proofCounted(p, task, end))
    .map((p) => ({ id: p.id, due: proofDeadline(p, task, end) }))
    .filter((p) => now >= p.due);
}

/** Die früheste verstrichene Nachweis-Frist — die Tatzeit, wenn ein Nachweis die Aufgabe scheitern
 *  lässt. `null`, wo keine verstrichen ist. */
function earliestOverdue(overdue: { due: Date }[]): Date | null {
  return overdue.reduce<Date | null>((min, p) => (min === null || p.due < min ? p.due : min), null);
}

/** Das Urteil über die Nachweis-Achse einer Aufgabe. */
export type ProofVerdict =
  /** Die Aufgabe fordert gar keine Nachweise. Verhält sich für `evaluateTask` wie `complete`, ist
   *  aber bewusst unterscheidbar: die Anzeige blendet den Nachweis-Teil danach ganz aus, statt einen
   *  leeren Abschnitt „alle erbracht" zu zeigen. */
  | "none"
  /** Noch nicht alle da, aber die Frist läuft. */
  | "pending"
  /** Alle da, geprüft, in Ordnung. */
  | "complete"
  /** Wartet auf die Sichtung der Keyholderin. */
  | "needsReview"
  /** Eingereicht, aber die automatische Code-Prüfung läuft noch. Für den Sub sieht das aus wie
   *  „wartet auf Sichtung" — der Unterschied zählt nur für den Poller: er darf das Ergebnis noch
   *  nicht melden, weil die Prüfung es in Sekunden noch umdrehen kann. */
  | "checking"
  /** Endgültig nicht erbracht: fehlend, zu spät, falsche Reihenfolge oder abgelehnt. */
  | "failed";

/**
 * Der ERSTE Nachweis, dessen Aufnahmezeit die geforderte Reihenfolge bricht — oder `null`.
 *
 * Exportiert, weil die Anzeige ihn braucht: ohne ihn zeigte jede Nachweis-Zeile für sich „erbracht"
 * (jeder Code stimmte ja), während die Aufgabe darunter „versäumt" meldet. Zwei grüne Häkchen über
 * einem Versäumnis, ohne dass irgendwo stünde, WAS schiefging — der Sub könnte es nicht einmal
 * bestreiten. Die Regel darf deshalb nur EINMAL existieren, nicht hier und noch einmal in `taskView`.
 *
 * Erwartet eine nach `sortOrder` sortierte Liste. Nachweise OHNE Aufnahmezeit (noch nicht
 * eingereicht, oder ein Bild ohne EXIF, das die Keyholderin angenommen hat) werden übersprungen:
 * sie sind selbst kein Bruch, und sie verdecken keinen — verglichen wird mit der letzten BELEGTEN
 * Zeit, nicht nur mit dem unmittelbaren Vorgänger. Sonst hebelte ein zeitloses Foto in der Mitte
 * die Reihenfolge der übrigen aus.
 */
export function firstOutOfOrderProof(
  ordered: ProofLike[],
  /** Die Aufgabe — ist ihre Reihenfolge abgeschaltet, gibt es keinen Verstoss, weder fürs Urteil
   *  noch für die Anzeige. Als PARAMETER, damit keiner der drei Aufrufer den Schalter für sich
   *  auflösen muss (und einer davon ihn vergisst — der Rohwert `undefined` wäre falsy und schaltete
   *  still ab, statt zu greifen). */
  task: Pick<TaskLike, "proofOrderMatters">,
): ProofLike | null {
  if (!effectiveProofOrderMatters(task.proofOrderMatters)) return null;
  let lastTime: number | null = null;
  for (const p of ordered) {
    if (!p.imageExifTime) continue;
    const t = p.imageExifTime.getTime();
    if (lastTime !== null && t <= lastTime) return p;
    lastTime = t;
  }
  return null;
}

/**
 * Wertet die Nachweise aus — getrennt von den Bedingungen, weil sie etwas anderes sind: ein
 * Nachweis ist ein EREIGNIS mit einem Zeitpunkt, keine Bedingung mit einem Intervall.
 *
 * Reihenfolge gilt nur unter den Nachweisen: die Aufnahmezeiten müssen der `sortOrder` folgen
 * (Verschluss vor Plug vor Rechnungen). Ein Bezug zu den Trage-Bedingungen wäre strenger, als die
 * Anforderung meint — ein Foto knapp vor dem Anlegen des Geräts wäre sonst ein Fehlschlag.
 *
 * Massgeblich ist die AUFNAHME-Zeit, nicht die Upload-Zeit: sonst genügte es, alle Fotos am Ende
 * hochzuladen, und die geforderte Reihenfolge wäre eine Fiktion.
 *
 * Ob die Reihenfolge überhaupt gefordert ist, sagt `task.proofOrderMatters`: manchmal IST sie die
 * Anweisung (Verschluss vor Plug), manchmal ist sie zufällig („eines in der Gemüse-, eines in der
 * Blumenabteilung"). Alles andere — Vollständigkeit, Frist, Code, Sichtung — bleibt unberührt.
 *
 * JEDER NACHWEIS HAT SEINE EIGENE FRIST ({@link proofDeadline}). Vorher war das Ende der Aufgabe der
 * eine Schnitt für alle; jetzt ist es nur noch die obere Schranke, und ein Nachweis mit eigener
 * Fälligkeit wird einzeln überfällig. Ohne eigene Fälligkeit fallen beide zusammen — deshalb ändert
 * sich an einer Bestandsaufgabe kein Urteil.
 */
export function evaluateProofs(
  proofs: ProofLike[],
  task: Pick<TaskLike, "holdUntil" | "proofOrderMatters" | "createdAt" | "wirksamAb">,
  now: Date,
): ProofVerdict {
  if (proofs.length === 0) return "none";

  const ordered = [...proofs].sort((a, b) => a.sortOrder - b.sortOrder);

  /**
   * Maschinell BESTÄTIGT — die einzige Automatik, die hier etwas entscheiden darf.
   *
   * Ein durchgefallener Code-Check ist ausdrücklich KEIN Fehlschlag: die Bilderkennung liest
   * schräge oder unscharfe Fotos falsch (`verifyCode.ts` führt eigens eine Fuzzy-Toleranz für
   * 1↔7 und 0↔6, weil genau das vorkommt). Ihn hart als Vergehen zu werten hiesse, einen Menschen
   * für eine Fehllesung zu bestrafen, die nie jemand gesehen hat.
   *
   * Die App macht das anderswo schon richtig: eine Kontrolle mit gescheitertem Auto-Check ist
   * „nicht verifiziert" und wandert zur Sichtung — ins Strafbuch kommt sie erst, wenn der Keyholder
   * sie ausdrücklich ABLEHNT. Hier gilt dasselbe.
   */
  const codeConfirmed = (p: ProofLike) => p.requireCode && p.verifikationStatus !== null;

  // Nur das ausdrückliche Nein eines MENSCHEN beendet die Sache. Alles andere ist Zwischenstand.
  if (ordered.some((p) => p.reviewAccepted === false)) return "failed";

  // Eingereicht heisst: RECHTZEITIG eingereicht — gegen die Frist DIESES Nachweises. Nach ihr zählt
  // es nicht mehr, sonst wäre sie bedeutungslos: man könnte beliebig lange nachliefern.
  //
  // Die Fallunterscheidung darunter ist dieselbe wie vorher, nur je Nachweis statt einmal für alle:
  // solange JEDE offene Frist noch läuft, ist die Achse offen; ist eine verstrichen, ist sie
  // entschieden. Ohne eigene Fälligkeiten sind alle Fristen das Ende der Aufgabe, und der Ausdruck
  // fällt Wort für Wort auf das alte `now < task.holdUntil ? "pending" : "failed"` zurück.
  const dueOf = (p: ProofLike) => proofDeadline(p, task, task.holdUntil);
  const outstanding = ordered.filter((p) => !proofCounted(p, task, task.holdUntil));
  if (outstanding.length > 0) {
    return outstanding.every((p) => now < dueOf(p)) ? "pending" : "failed";
  }

  // Die Reihenfolge-Achse, in EINEM Block: streng aufsteigende Aufnahmezeiten, und fehlt eine, ist
  // sie nicht prüfbar — dann entscheidet die Keyholderin, statt dass wir raten.
  //
  // Die fehlende Aufnahmezeit hängt AN der Reihenfolge und nicht neben ihr: sie ist nur deshalb ein
  // Fall für die Sichtung, weil sich ohne sie die Reihenfolge nicht belegen lässt. Ist die
  // Reihenfolge abgeschaltet, gibt es nichts zu belegen — und nichts zu sichten.
  //
  // Angenommen heisst: die Keyholderin hat die Reihenfolge an Stelle der Maschine beurteilt — der
  // Sichtungsgrund ist verbraucht, sonst käme die Aufgabe nach jeder Annahme wieder hierher zurück
  // und würde nie fertig (Regressionstest in `taskProofs.test.ts`).
  //
  // Der belegte Bruch VOR der Sichtung: brechen die Aufnahmezeiten, die da sind, die Reihenfolge
  // schon, ändert kein Urteil über das zeitlose Foto etwas daran — die Sichtung wäre eine Frage, deren
  // Antwort nicht zählt, und die Karte zeigte den Bruch längst, während die App „bitte sichten" meldet.
  if (effectiveProofOrderMatters(task.proofOrderMatters)) {
    if (firstOutOfOrderProof(ordered, task)) return "failed";
    if (ordered.some((p) => p.imageExifTime === null && p.reviewAccepted !== true)) return "needsReview";
  }

  // Automatisch entscheidbar ist nur ein Nachweis MIT erkanntem Code. Alles andere („Foto mit zwei
  // Rechnungen") ist eine Aussage über den Bildinhalt, die keine Maschine abschliessend trifft.
  const settled = (p: ProofLike) => p.reviewAccepted === true || codeConfirmed(p);
  if (ordered.every(settled)) return "complete";

  // Code gefordert, eingereicht, aber weder bestätigt noch mit Grund versehen: die Prüfung läuft
  // noch (sie startet erst NACH dem Speichern). Das ist ein Zwischenstand, kein Urteil.
  const checking = (p: ProofLike) =>
    p.requireCode && p.verifikationStatus === null && p.verifikationReason === null;
  return ordered.some(checking) ? "checking" : "needsReview";
}

/**
 * Wertet eine Aufgabe aus. `perRequirement[i]` sind die Intervalle der Bedingung `requirements[i]`
 * (gleiche Reihenfolge).
 *
 * Ablauf: Beginn = erster Zeitpunkt, ab dem die Schnittmenge gilt UND der innerhalb der Kulanzfrist
 * liegt. Von dort muss die Schnittmenge bis zum Ende lückenlos decken.
 *
 * WELCHES Ende, entscheidet der Modus ({@link effectiveHoldUntil}): klassisch das feste `holdUntil`,
 * im Dauer-Modus der Beginn plus die Dauer. Das Ergebnis trägt es als `evaluation.holdUntil` nach
 * aussen — im Dauer-Modus ist es die einzige Stelle, an der es überhaupt entsteht.
 *
 * ZWEI ACHSEN. Bedingungen sind Zustände über Intervalle, Nachweise sind Ereignisse mit einem
 * Zeitpunkt ({@link evaluateProofs}). Erfüllt ist die Aufgabe nur, wenn beide stimmen. Die Reihenfolge
 * der Urteile ist dabei nicht beliebig — ein Verhalten des Subs schlägt ein ausstehendes Urteil der
 * Keyholderin, sonst verdeckte eine offene Sichtung ein echtes Versäumnis.
 */
export function evaluateTask(
  task: TaskLike,
  requirements: TaskRequirementLike[],
  perRequirement: Interval[][],
  now: Date,
  proofs: ProofLike[] = [],
): TaskEvaluation {
  /**
   * Die überfälligen Nachweise, solange kein Beginn feststeht — gegen `task.holdUntil` gemessen, und
   * das ist hier nicht bloss der bequeme, sondern der RICHTIGE Wert: ohne Beginn ist das wirksame
   * Ende genau die Spalte (`effectiveHoldUntil` gibt sie zurück, solange `startedAt` fehlt).
   *
   * Als LISTE MIT FRISTEN und nicht bloss als Ids: die früheste verstrichene Frist ist die Tatzeit
   * des Vergehens (`failedAt`), und die braucht schon der Zweig für Aufgaben OHNE Bedingungen.
   */
  const overdueBeforeStart = overdueProofsAt(proofs, task, task.holdUntil, now);

  const base: TaskEvaluation = {
    state: "pending",
    // Vorbelegt mit dem spätestmöglichen Ende — richtig für jeden Zweig, in dem es keinen Beginn
    // gibt (nicht begonnen, versäumt, zurückgezogen). Wo einer feststeht, wird es unten ersetzt.
    holdUntil: task.holdUntil,
    startedAt: null,
    missing: [],
    failedRequirement: null,
    failedAt: null,
    awaitingConfirmation: false,
    holdRunning: false,
    proofCheckPending: proofs.some(
      (p) => p.requireCode && p.submittedAt !== null && p.verifikationStatus === null && p.verifikationReason === null,
    ),
    // `base` trägt jeden Zweig OHNE Beginn. Sobald einer feststeht, rechnet die Auswertung die Liste
    // weiter unten gegen das WIRKSAME Ende neu (im Dauer-Modus ist es das frühere).
    overdueProofIds: overdueBeforeStart.map((p) => p.id),
  };

  // Zurückgezogen schlägt alles: weder offen noch Vergehen, egal was die Einträge sagen.
  if (task.withdrawnAt) return { ...base, state: "withdrawn" };

  // Aufgabe ohne Bedingungen: allein die Selbstmeldung entscheidet — aber sie muss RECHTZEITIG sein.
  // Ohne den Zeitvergleich heilte eine Meldung von heute eine gestern verpasste Frist rückwirkend und
  // das Vergehen verschwände spurlos.
  if (requirements.length === 0) {
    // Ohne Bedingungen gibt es nichts anzulegen — und damit auch keinen abgeleiteten Beginn, an dem
    // eine Dauer hängen könnte. `task.holdUntil` IST hier das Ende (der Dauer-Modus ist für solche
    // Aufgaben gar nicht erst wählbar, siehe `checkTask`).
    const proofVerdict = evaluateProofs(proofs, task, now);
    // Ohne Bedingungen tragen allein Selbstmeldung und Nachweise. Stehen Nachweise noch aus, ist die
    // Aufgabe offen bzw. wartet auf die Sichtung — die Selbstmeldung allein macht sie nicht fertig.
    // Die TATZEIT, wo eine eigene Nachweis-Frist sie hergibt: das Strafbuch datiert
    // `unfulfilled_task` als `failedAt ?? holdUntil`, und ein um 17:00 verpasstes Foto darf kein
    // Vergehen mit dem Zeitstempel des Aufgaben-Endes erzeugen. Fehlt sie (Nachweis abgelehnt,
    // Reihenfolge gebrochen, schlicht nichts abgegeben), bleibt es beim Ende — dort gibt es keinen
    // früheren Zeitpunkt, der etwas belegte.
    if (proofVerdict === "failed") return { ...base, state: "missed", failedAt: earliestOverdue(overdueBeforeStart) };
    if (proofVerdict === "needsReview" || proofVerdict === "checking") return { ...base, state: "awaitingReview" };
    if (proofVerdict === "pending") return { ...base, state: "pending" };
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
  // Der Nullpunkt: bei einer terminierten Aufgabe `wirksamAb`, sonst die Erstellung. Alles darunter
  // liegt VOR ihrer Zeit und darf weder als Beginn gelten noch gegen den Träger zählen.
  const anchorMs = taskAnchor(task).getTime();

  // Beginn: erster Schnitt-Abschnitt, der bis in die Laufzeit der Aufgabe hineinreicht UND spätestens
  // zur Kulanzfrist gilt.
  //
  // Das `end > anchor` ist nicht kosmetisch: ohne es kapert das FRÜHESTE je aufgezeichnete
  // Intervall die Suche — trug der Sub dieselben Geräte zufällig schon Stunden vorher, wurde der
  // Beginn auf den Nullpunkt hochgezogen, obwohl damals nichts anlag, und die Aufgabe galt ab Minute 1
  // als abgebrochen. Ein Vergehen für tadelloses Verhalten, und zwar bei jedem Nutzer mit Vorgeschichte.
  const candidates = combined.filter(
    (iv) => iv.end.getTime() > anchorMs
      && Math.max(iv.start.getTime(), anchorMs) <= deadline.getTime(),
  );
  const startsOf = (iv: Interval) => new Date(Math.max(iv.start.getTime(), anchorMs));

  // Bis wann muss gedeckt sein? Vor der Frist zählt nur „bis jetzt".
  //
  // Im Dauer-Modus hängt das Ende am Beginn — und der wird gerade erst gesucht. Die Frage ist also
  // je Kandidat eine andere („hält es von HIER aus seine eigene Dauer durch?"), nicht mehr eine
  // gemeinsame gegen ein feststehendes Ende. Deshalb eine Funktion statt einer Konstanten; im
  // klassischen Modus liefert sie für jeden Kandidaten denselben Wert wie zuvor.
  const untilFrom = (start: Date) => {
    const end = effectiveHoldUntil(task, start);
    return now < end ? now : end;
  };

  // Unter den fristgerechten Kandidaten den ERSTEN nehmen, von dem aus es durchhält — nicht blind den
  // frühesten. Sonst schlägt eine Unterbrechung INNERHALB der Kulanzfrist alles: wer das Gerät schon
  // vorher trug, es um 12:05 kurz ablegt und um 12:20 (noch in der Frist) wieder anlegt, wäre
  // „abgebrochen", während jemand, der bis 12:20 gar nichts tat, sauber dasteht. Das korrektere
  // Verhalten dürfte nie das härtere Urteil bekommen.
  //
  // Fällt keiner durch, bleibt der früheste Kandidat: er trägt den Beleg (`failedAt`), den die
  // Abbruch-Meldung braucht.
  const startIv = candidates.find((iv) => {
    const start = startsOf(iv);
    return coversContinuously(combined, start, untilFrom(start));
  }) ?? candidates[0];
  const startedAt = startIv ? startsOf(startIv) : null;

  if (!startedAt) {
    // Noch nicht (rechtzeitig) begonnen. Vor Ablauf der Kulanzfrist: was fehlt noch?
    const missing = requirements.filter((_, k) => !coversPoint(perRequirement[k], now));
    // Eine verstrichene EIGENE Nachweis-Frist entscheidet auch hier — und zwar VOR der Kulanzfrist.
    // Ohne diesen Zweig zeigte die Karte die Zeile als überfällig (ohne Aufnahme-Link), während der
    // Kopf „noch nicht begonnen" meldet und der nächste Schritt ins Trage-Formular schickt: für eine
    // Aufgabe, die nicht mehr zu erfüllen ist. Genau die zwei Auskünfte, gegen die der Zweig weiter
    // unten gebaut ist — nur bevor überhaupt etwas anlag.
    if (overdueBeforeStart.length > 0) {
      return { ...base, state: "missed", missing, failedAt: earliestOverdue(overdueBeforeStart) };
    }
    if (now.getTime() > deadline.getTime()) {
      return { ...base, state: "missed", missing };
    }
    return {
      ...base,
      state: missing.length < requirements.length ? "partial" : "pending",
      missing,
    };
  }

  // Ab hier steht der Beginn fest — und damit im Dauer-Modus auch das wirksame Ende. JEDER weitere
  // Vergleich in dieser Funktion misst gegen `holdUntil`, nicht mehr gegen `task.holdUntil`.
  const holdUntil = effectiveHoldUntil(task, startedAt);
  const until = now < holdUntil ? now : holdUntil;
  // Die überfälligen Nachweise gegen das WIRKSAME Ende neu — dasselbe Ende, gegen das die
  // Nachweis-Achse unten urteilt und das die Anzeige aus `evaluation.holdUntil` liest. Mit der
  // Vorbelegung aus `base` (der Spalte) wäre im Dauer-Modus eine Zeile noch „offen", während die
  // Auswertung sie längst nicht mehr zählt: ein Aufnahme-Link, der ins Leere führt.
  const overdue = overdueProofsAt(proofs, task, holdUntil, now);

  /**
   * Die gemeinsame Grundlage JEDES Zweigs ab hier — Beginn, wirksames Ende und die überfälligen
   * Nachweise stehen fest und gelten für alle.
   *
   * Als EIN Objekt und nicht als drei Schlüssel je Rückgabe: die drei gehören zusammen (alle drei
   * folgen aus `startedAt`), und ein Zweig, der später dazukommt und einen davon vergisst, lieferte
   * still die Vorbelegung aus `base` — gegen die SPALTE gerechnet statt gegen das wirksame Ende.
   * Kein Typfehler, nur eine falsche Anzeige.
   */
  const started = { ...base, holdUntil, startedAt, overdueProofIds: overdue.map((p) => p.id) };

  // Es lief. Hat es bis zum Ende (bzw. bis jetzt) durchgehalten?
  if (!coversContinuously(combined, startedAt, until)) {
    // Erste Lücke finden → welche Bedingung fiel wann weg?
    const runIv = combined.find((iv) => iv.start.getTime() <= startedAt.getTime() && iv.end.getTime() > startedAt.getTime());
    const failedAt = runIv ? runIv.end : startedAt;
    // Eine Millisekunde NACH dem Ausfall prüfen: zum Ausfallzeitpunkt selbst gilt die Bedingung noch
    // (Ende einschliessend, siehe coversPoint) — genau dort wäre die Suche sonst ergebnislos.
    const afterFailure = new Date(failedAt.getTime() + 1);
    const failedIdx = perRequirement.findIndex((iv) => !coversPoint(iv, afterFailure));
    // WELCHER Beleg zuerst kam, entscheidet — nicht, welcher Zweig zuerst im Code steht.
    //
    // Lief eine eigene Nachweis-Frist schon vor dem Ablegen ab, war die Aufgabe zu diesem Zeitpunkt
    // bereits versäumt: die App hat das dem Träger auch so gesagt (Karte, Ablege-Warnung und
    // Blockier-Logik hängen an `isTaskOpen`, und `missed` ist nicht offen). Ihn danach für das
    // Ablegen als „abgebrochen" zu führen, hiesse ihn für genau das zu bestrafen, was ihm die App
    // eben erlaubt hat — und der frühere Beleg ginge dabei verloren.
    const firstOverdue = earliestOverdue(overdue);
    if (firstOverdue !== null && firstOverdue <= failedAt) {
      return { ...started, state: "missed", failedAt: firstOverdue };
    }
    return {
      ...started,
      state: "aborted",
      failedRequirement: failedIdx >= 0 ? requirements[failedIdx] : null,
      failedAt,
    };
  }

  /**
   * EINE eigene Nachweis-Frist kann verstreichen, WÄHREND die Bedingungen noch gehalten werden —
   * und dann ist die Aufgabe entschieden, obwohl ihre Haltefrist noch läuft.
   *
   * Ohne diesen Zweig bliebe genau der Leitfall des Bausteins ohne Wirkung: „trag den Slip UND schick
   * mir dreimal am Tag ein Foto" ist eine Aufgabe MIT Bedingung, und der `running`-Ausstieg darunter
   * liegt vor der Nachweis-Achse. Das Mittagsfoto wäre dann bis zum Abend folgenlos — während die
   * Karte die Zeile schon als überfällig zeigt (ohne Aufnahme-Link) und der nächste Schritt „weiter
   * halten" verlangt. Zwei Auskünfte über dieselbe Aufgabe.
   *
   * Nur die EIGENEN Fristen können hier greifen: ein Nachweis ohne sie ist bis zum Ende der Aufgabe
   * offen, und dieses Ende ist noch nicht erreicht. Eine Bestandsaufgabe kann diesen Zweig deshalb
   * gar nicht erreichen.
   *
   * `missed` mit erhaltenem `startedAt` — dieselbe Kodierung wie beim Fehlschlag der Nachweis-Achse
   * weiter unten, aus demselben Grund: der Beleg, dass er begonnen HAT, darf nicht verlorengehen.
   */
  // `failedAt` ist die TATZEIT und kein Beiwerk: das Strafbuch datiert `unfulfilled_task` als
  // `failedAt ?? holdUntil`. Ohne sie erschiene ein um 13:00 entstandenes Versäumnis mit dem
  // Zeitstempel des Aufgaben-Endes — bei einer bis 22:00 laufenden Aufgabe also neun Stunden in der
  // Zukunft, falsch einsortiert in jeder Perioden-Ansicht.
  if (overdue.length > 0) return { ...started, state: "missed", failedAt: earliestOverdue(overdue) };

  // Der EINE Ort, an dem „die Haltefrist läuft noch" gemessen wird — deshalb trägt die Auswertung
  // die Tatsache auch nach aussen, statt die Anzeige sie aus der Abwesenheit von
  // `awaitingConfirmation` erschliessen zu lassen.
  if (now < holdUntil) return { ...started, state: "running", holdRunning: true };

  // Die Nachweise erst JETZT — und gegen das WIRKSAME Ende. Im Dauer-Modus ist die Nachweis-Frist
  // dieselbe wie die Haltefrist, und die steht erst mit dem Beginn fest; oben, vor der Suche nach
  // ihm, gäbe es sie noch gar nicht. Der Aufruf wandert damit hinter die Bedingungs-Achse, was
  // nichts verschiebt: die Nachweis-Zweige darunter lagen ohnehin schon alle hier.
  // `{ ...task, holdUntil }` und keine handverlesene Feldliste: die Nachweis-Achse liest inzwischen
  // auch den Nullpunkt (`createdAt`/`wirksamAb`), und eine aufgezählte Auswahl wäre die Stelle, an der
  // ein künftiges Feld still fehlt — mit einer falschen Frist als Folge, nicht mit einem Compilerfehler.
  const proofVerdict = evaluateProofs(proofs, { ...task, holdUntil }, now);

  // Bedingungen gehalten. Jetzt die Nachweise.
  //
  // Der Fehlschlag steht hier und NICHT als früher Ausstieg oben: sonst überschriebe er die
  // Bedingungs-Achse vollständig und meldete `missed` ohne `startedAt` — „nie begonnen" für jemanden,
  // der durchgehend getragen und nur das letzte Foto vergessen hat. Der Beleg ist kein Beiwerk: das
  // Strafbuch liest `missed` ausdrücklich als „nie (rechtzeitig) begonnen", und bei `aborted` hängt
  // die Abbruch-Meldung an `failedRequirement`/`failedAt`. Ein Urteil ohne seinen Beleg lässt sich
  // weder prüfen noch bestreiten.
  // Hier ohne Tatzeit, und das ist kein Versehen: die verstrichenen EIGENEN Fristen hat der Zweig
  // oben bereits abgefangen (er kehrt zurück, sobald es eine gibt). Was hier ankommt, ist ein
  // Fehlschlag ohne früheren Beleg — abgelehnter Nachweis, gebrochene Reihenfolge, oder schlicht
  // nichts abgegeben bis zum Ende. Dafür ist das Ende der Aufgabe die richtige Tatzeit
  // (`failedAt ?? holdUntil` im Strafbuch).
  if (proofVerdict === "failed") return { ...started, state: "missed" };

  // Eine ausstehende Sichtung steht VOR der Selbstmeldung, denn sie ist der Grund, warum noch
  // niemand urteilen kann. Den Sub hier zur Meldung zu drängen, während die Keyholderin am Zug ist,
  // wäre die falsche Aufforderung an die falsche Person.
  if (proofVerdict === "needsReview" || proofVerdict === "checking") return { ...started, state: "awaitingReview" };

  // Durchgehalten. Der Textteil („ist die Wohnung sauber?") ist nicht prüfbar — dafür die Selbstmeldung.
  // Sie muss NACH dem Beginn liegen: eine Meldung aus Minute 1, bevor überhaupt alles anlag, ist keine
  // Aussage über das Ergebnis.
  const confirmed = task.completedAt !== null && task.completedAt >= startedAt;
  if (!confirmed) return { ...started, state: "running", awaitingConfirmation: true };
  return { ...started, state: "done" };
}

/**
 * Steht das Ergebnis endgültig fest — gibt es also etwas zu MELDEN?
 *
 * Positiv formuliert und nicht als „nicht offen": `awaitingReview` ist weder offen noch entschieden,
 * und genau daran ist der Poller schon einmal hängengeblieben. Er meldete den Zustand als „versäumt"
 * und stempelte es fest, weil er nur `isTaskOpen` kannte. Wer einen sechsten Zustand ergänzt, muss
 * ihn hier bewusst aufnehmen, statt dass er stillschweigend als Fehlschlag durchgeht.
 */
export function isTaskResultFinal(state: TaskState): boolean {
  return state === "done" || state === "missed" || state === "aborted";
}

/** Wartet die Aufgabe auf die Sichtung der Keyholderin? Für den Sub ist sie damit erledigt, für die
 *  Keyholderin ist sie eine offene Pflicht — deshalb ein eigenes Prädikat neben {@link isTaskOpen}. */
export function needsKeyholderReview(state: TaskState): boolean {
  return state === "awaitingReview";
}

/** Zählt als offen und damit anzeigepflichtig? Aus Sicht des SUBS: was er noch beeinflussen kann.
 *  `awaitingReview` gehört bewusst nicht dazu — er hat dort nichts mehr zu tun. */
export function isTaskOpen(state: TaskState): boolean {
  return state === "pending" || state === "partial" || state === "running";
}

/**
 * Die Zustände, die ein Vergehen sind — `missed` (nie begonnen) und `aborted` (zu früh abgelegt),
 * die einander ausschliessen.
 *
 * Eigener Typ, weil das Paar sonst an jeder Stelle einzeln abgeschrieben wird, die ein Vergehen
 * weiterreicht (Strafbuch-Daten, Strafbuch-Anzeige). Kommt je ein dritter Vergehens-Zustand dazu,
 * bricht dort der Compiler, statt dass die Anzeige ihn still weglässt.
 */
export type TaskOffenseState = Extract<TaskState, "missed" | "aborted">;

/** Ein Vergehen? Als Type-Guard, damit der Aufrufer den engeren Typ auch bekommt statt ihn zu casten. */
export function isTaskOffense(state: TaskState): state is TaskOffenseState {
  return state === "missed" || state === "aborted";
}
