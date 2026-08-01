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
  /** Ein Nachweis wartet noch auf seine automatische Code-Prüfung. Nur für den Poller: er darf ein
   *  Ergebnis erst melden UND stempeln, wenn es feststeht — sonst ist die Meldung „bitte sichten"
   *  raus und dauerhaft gestempelt, während die Prüfung Sekunden später „erfüllt" ergibt und das
   *  niemand mehr erfährt. */
  proofCheckPending: boolean;
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

/** Ein gefordertes Nachweis-Foto, so weit die Auswertung es kennt (siehe `TaskProof`). */
export interface ProofLike {
  id: string;
  sortOrder: number;
  /** Verlangt einen Zufallscode im Bild — nur damit ist der Nachweis maschinell entscheidbar. */
  requireCode: boolean;
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
 * Erwartet eine nach `sortOrder` sortierte Liste mit vollständigen Aufnahmezeiten.
 */
export function firstOutOfOrderProof(orderedWithTimes: ProofLike[]): ProofLike | null {
  for (let i = 1; i < orderedWithTimes.length; i++) {
    const prev = orderedWithTimes[i - 1].imageExifTime;
    const cur = orderedWithTimes[i].imageExifTime;
    if (!prev || !cur) continue;
    if (cur.getTime() <= prev.getTime()) return orderedWithTimes[i];
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
 */
export function evaluateProofs(proofs: ProofLike[], task: Pick<TaskLike, "holdUntil">, now: Date): ProofVerdict {
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

  // Eingereicht heisst: RECHTZEITIG eingereicht. Nach der Frist zählt es nicht mehr, sonst wäre die
  // Frist bedeutungslos — man könnte beliebig lange nachliefern.
  const counted = (p: ProofLike) => p.submittedAt !== null && p.submittedAt <= task.holdUntil;
  if (!ordered.every(counted)) {
    return now < task.holdUntil ? "pending" : "failed";
  }

  // Reihenfolge: streng aufsteigende Aufnahmezeiten. Fehlt eine, ist sie nicht prüfbar — dann
  // entscheidet die Keyholderin, statt dass wir raten.
  const times = ordered.map((p) => p.imageExifTime);
  if (times.some((t) => t === null)) return "needsReview";
  if (firstOutOfOrderProof(ordered)) return "failed";

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
 * liegt. Von dort muss die Schnittmenge bis `holdUntil` lückenlos decken.
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
  const base: TaskEvaluation = {
    state: "pending",
    startedAt: null,
    missing: [],
    failedRequirement: null,
    failedAt: null,
    awaitingConfirmation: false,
    proofCheckPending: proofs.some(
      (p) => p.requireCode && p.submittedAt !== null && p.verifikationStatus === null && p.verifikationReason === null,
    ),
  };

  // Zurückgezogen schlägt alles: weder offen noch Vergehen, egal was die Einträge sagen.
  if (task.withdrawnAt) return { ...base, state: "withdrawn" };

  const proofVerdict = evaluateProofs(proofs, task, now);

  // Aufgabe ohne Bedingungen: allein die Selbstmeldung entscheidet — aber sie muss RECHTZEITIG sein.
  // Ohne den Zeitvergleich heilte eine Meldung von heute eine gestern verpasste Frist rückwirkend und
  // das Vergehen verschwände spurlos.
  if (requirements.length === 0) {
    // Ohne Bedingungen tragen allein Selbstmeldung und Nachweise. Stehen Nachweise noch aus, ist die
    // Aufgabe offen bzw. wartet auf die Sichtung — die Selbstmeldung allein macht sie nicht fertig.
    if (proofVerdict === "failed") return { ...base, state: "missed" };
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

  // Bedingungen gehalten. Jetzt die Nachweise.
  //
  // Der Fehlschlag steht hier und NICHT als früher Ausstieg oben: sonst überschriebe er die
  // Bedingungs-Achse vollständig und meldete `missed` ohne `startedAt` — „nie begonnen" für jemanden,
  // der durchgehend getragen und nur das letzte Foto vergessen hat. Der Beleg ist kein Beiwerk: das
  // Strafbuch liest `missed` ausdrücklich als „nie (rechtzeitig) begonnen", und bei `aborted` hängt
  // die Abbruch-Meldung an `failedRequirement`/`failedAt`. Ein Urteil ohne seinen Beleg lässt sich
  // weder prüfen noch bestreiten.
  if (proofVerdict === "failed") return { ...base, state: "missed", startedAt };

  // Eine ausstehende Sichtung steht VOR der Selbstmeldung, denn sie ist der Grund, warum noch
  // niemand urteilen kann. Den Sub hier zur Meldung zu drängen, während die Keyholderin am Zug ist,
  // wäre die falsche Aufforderung an die falsche Person.
  if (proofVerdict === "needsReview" || proofVerdict === "checking") return { ...base, state: "awaitingReview", startedAt };

  // Durchgehalten. Der Textteil („ist die Wohnung sauber?") ist nicht prüfbar — dafür die Selbstmeldung.
  // Sie muss NACH dem Beginn liegen: eine Meldung aus Minute 1, bevor überhaupt alles anlag, ist keine
  // Aussage über das Ergebnis.
  const confirmed = task.completedAt !== null && task.completedAt >= startedAt;
  if (!confirmed) return { ...base, state: "running", startedAt, awaitingConfirmation: true };
  return { ...base, state: "done", startedAt };
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
