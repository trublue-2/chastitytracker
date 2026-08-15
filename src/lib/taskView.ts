import type { EvaluatedTask, TaskProofView } from "@/lib/taskIntervals";
import { firstOutOfOrderProof, isTaskOpen, startDeadline, type TaskState } from "@/lib/tasks";
import { wearActionHref } from "@/lib/categoryConstants";

/**
 * Die serialisierbare Sicht auf eine ausgewertete Aufgabe — das, was `TaskCard` rendert.
 *
 * Eigene Schicht, weil die Auswertung mit `Date`-Objekten und Prisma-Zeilen arbeitet, die Karte aber
 * eine Client-Komponente ist: alles reist als ISO-String über die Grenze. Und beide Aufrufer
 * (Keyholder-Historie, Sub-Dashboard) sollen dieselbe Karte sehen — sonst driften zwei Darstellungen
 * desselben Zustands auseinander.
 */

export interface TaskCardRequirement {
  id: string;
  label: string;
  satisfied: boolean;
  /** Deep-Link ins passende Formular. null beim Keyholder (es sind nicht seine Formulare) und bei
   *  Bedingungen, deren Kategorie gelöscht wurde. */
  href: string | null;
}

/** Der Zustand EINES Nachweises, wie ihn die Karte zeigt. Bewusst feiner als das Gesamturteil der
 *  Aufgabe: der Sub muss sehen, welches Foto noch fehlt und welches beanstandet wurde. */
export type TaskCardProofState =
  /** Noch nicht eingereicht. */
  | "open"
  /** Erbracht — entweder maschinell über den Code bestätigt oder von der Keyholderin angenommen.
   *  Die beiden sind bewusst EIN Zustand: für den Sub bedeuten sie dasselbe („erledigt"), und wer
   *  geurteilt hat, steht in der Sichtungs-Anmerkung. Zwei Zustände, die überall gleich behandelt
   *  werden, sind einer zu viel. */
  | "confirmed"
  /** Eingereicht, wartet auf die Sichtung der Keyholderin (ohne Code-Pflicht, ohne Aufnahmezeit,
   *  oder Code nicht erkannt). */
  | "review"
  /** Von der Keyholderin abgelehnt. */
  | "rejected"
  /** Aufnahmezeit bricht die geforderte Reihenfolge — dieser Nachweis ist der Grund, warum die
   *  Aufgabe scheitert. Ohne diesen Zustand zeigte die Zeile „erbracht" (ihr Code stimmte ja),
   *  während die Aufgabe darunter „versäumt" meldet. */
  | "outOfOrder";

export interface TaskCardProof {
  id: string;
  /** Was zu sehen sein muss. */
  description: string;
  /** Der Code, den der Sub ins Bild schreiben muss. Null ohne Code-Pflicht.
   *  MUSS sichtbar sein — ohne ihn kann er den Nachweis gar nicht erbringen. */
  code: string | null;
  state: TaskCardProofState;
  /** Deep-Link ins Aufnahme-Formular. Null beim Keyholder und bei bereits eingereichten. */
  href: string | null;
  /** Das eingereichte Foto. Ohne es kann die Keyholderin nicht urteilen — und der Sub sieht, was er
   *  abgegeben hat. Null, solange nichts eingereicht ist. */
  imageUrl: string | null;
  /** Anmerkung der Keyholderin zur Sichtung. */
  reviewNote: string | null;
  /**
   * Das Urteil eines MENSCHEN, mit seinem Zeitpunkt — getrennt von {@link state}, der es mit der
   * Code-Bestätigung zu „erbracht" verschmilzt.
   *
   * Für den Sub ist diese Verschmelzung richtig (beides heisst „erledigt"), für die Sichtungs-Ansicht
   * nicht: dort stand über einem längst angenommenen Nachweis dasselbe neutrale „Annehmen /
   * Ablehnen" wie über einem unbeurteilten. Wer über den MCP geurteilt hatte, sah im Web keine Spur
   * davon und beurteilte dieselben Fotos ein zweites Mal (Rückmeldung 02.08.2026).
   *
   * Urteil und Zeitpunkt als EIN Feld, weil sie zusammen geschrieben werden (`reviewTaskProof`) und
   * nur zusammen etwas aussagen: „angenommen" ohne Zeitpunkt lässt offen, ob das vor einer Minute
   * oder vor einer Woche geschah. Zwei nullbare Felder hätten dieselbe Anzeige um einen Zweig
   * erweitert, den niemand je erreicht.
   */
  review: { accepted: boolean; at: string } | null;
}

/**
 * Was der Sub als NÄCHSTES tun muss — die eine Frage, die Karte und Knopf gemeinsam beantworten.
 *
 * Hier und nicht in den Komponenten, weil sie sonst zweimal beantwortet wird: die Karte fragte nach
 * `requirements[].satisfied`, der Melde-Knopf nach `evaluation.missing` — zwei Felder, die sich
 * unterscheiden, sobald die Frist verstrichen ist. Die Karte zeigte dann „Bedingung erfüllen" und
 * darunter den Abschluss-Knopf: zwei Aufforderungen für einen Schritt.
 */
export type TaskNextStep =
  /** Eine Bedingung gilt noch nicht. `href` fehlt, wo die Kategorie gelöscht wurde. */
  | { kind: "requirement"; label: string; href: string | null }
  /** Der nächste Nachweis ist fällig. */
  | { kind: "proof"; label: string; href: string | null }
  /** Alles liegt an, die Haltefrist läuft — zu tun ist nur noch: so lassen. Kein Handlungsangebot,
   *  sondern ein Zustand; `until` trägt die Frist für den Countdown. */
  | { kind: "hold"; until: string }
  /** Nur noch die Selbstmeldung — den nicht messbaren Teil bestätigt der Sub selbst. */
  | { kind: "confirm" };

/** @returns null, wenn der Sub nichts (mehr) tun kann: fremde Sicht, erfüllt, versäumt oder in
 *  der Sichtung der Keyholderin. */
export function nextTaskStep(task: TaskCardData): TaskNextStep | null {
  if (!task.actionable || !isTaskOpen(task.state)) return null;
  // Die Selbstmeldung steht VOR den Bedingungen: ist die Frist einmal durchgehalten, darf der Sub
  // ablegen (siehe `isHeldByTask`) — eine dann unerfüllte Bedingung ist kein offener Schritt mehr,
  // sondern erledigte Vergangenheit. Ohne diesen Vorrang schickte die Karte ihn zurück ins
  // Trage-Formular für eine Aufgabe, die er nur noch melden muss.
  if (task.awaitingConfirmation) return { kind: "confirm" };
  const requirement = task.requirements.find((r) => !r.satisfied);
  if (requirement) return { kind: "requirement", label: requirement.label, href: requirement.href };
  const proof = task.proofs.find((p) => p.state === "open");
  if (proof) return { kind: "proof", label: proof.description, href: proof.href };
  // Läuft die Haltefrist, ist Halten der Schritt — die Selbstmeldung wäre eine Aussage über eine
  // Stunde, die noch nicht stattgefunden hat. Welche Frist eine Haltefrist ist und welche bloss ein
  // Termin („staubsauge bis 18:36" — da ist „erledigt" wahr, sobald es getan ist), beantwortet
  // `holdRunning` aus der Auswertung; hier wird es nicht noch einmal hergeleitet.
  if (task.holdRunning) return { kind: "hold", until: task.holdUntil };
  return { kind: "confirm" };
}

export interface TaskCardData {
  id: string;
  title: string;
  description: string | null;
  isPunishment: boolean;
  penaltyReason: string | null;
  /**
   * Das WIRKSAME Ende als ISO — die Karte formatiert in der Zeitzone des Betrachters.
   *
   * Aus der AUSWERTUNG, nicht aus der Zeile: im Dauer-Modus entsteht es erst mit dem abgeleiteten
   * Beginn, und vor ihm ist es das spätestmögliche Ende. Zusammen mit {@link holdDurationMin}
   * entscheidet die Karte damit, ob sie einen Zeitpunkt nennt oder eine Dauer.
   */
  holdUntil: string;
  /**
   * Dauer-Modus: die Haltezeit in Minuten ab dem Anlegen — null im klassischen Modus.
   *
   * Die Karte braucht beides. Vor dem Beginn wäre ein Zeitpunkt eine Behauptung über etwas, das noch
   * niemand ausgelöst hat („Ohne Unterbrechung bis 21:15", obwohl das nur gilt, wenn er die Kulanz
   * voll ausreizt); die ehrliche Aussage ist dann die DAUER. Ab dem Beginn steht der Zeitpunkt fest
   * und ist die nützlichere von beiden.
   */
  holdDurationMin: number | null;
  /**
   * Bis wann spätestens ALLE Bedingungen anliegen müssen (`createdAt` + Kulanzfrist) — ISO, null
   * ohne Bedingungen (dann gibt es nichts anzulegen).
   *
   * Diese Frist ist hart: wer danach erst anfängt, hat per Definition nicht durchgehend gehalten und
   * bekommt ein Vergehen. Sie stand bisher NUR im Datenmodell — weder das Formular der Keyholderin
   * noch die Karte des Subs nannten sie. Eine Frist, die eine Strafe auslöst und die niemand sehen
   * kann, ist die eine Sorte Frist, die es nicht geben darf.
   */
  startDeadline: string | null;
  state: TaskState;
  startedAt: string | null;
  /** Namen der jetzt fehlenden Bedingungen — „Fehlt noch: Knebel". */
  missing: string[];
  failedRequirement: string | null;
  failedAt: string | null;
  awaitingConfirmation: boolean;
  /** Die Haltefrist läuft gerade — siehe `TaskEvaluation.holdRunning`. */
  holdRunning: boolean;
  requirements: TaskCardRequirement[];
  /** Geforderte Nachweis-Fotos (Issue #39). Leer, wo keine gefordert sind. */
  proofs: TaskCardProof[];
  completionNote: string | null;
  /** Sieht der Sub seine eigene, noch beeinflussbare Aufgabe an? Dann — und nur dann — trägt die
   *  Karte den nächsten Schritt und der Aufrufer den Melde-Knopf. Fällt mit `withLinks` zusammen und
   *  wird deshalb dort gesetzt: als zweites Prop an der Karte wäre es eine Angabe, die man an jedem
   *  neuen Aufrufer passend zum Ersten raten muss. */
  actionable: boolean;
}

/**
 * Welcher Text steht über der Frist einer Aufgabe: „Halten bis" oder „Erledigen bis"?
 *
 * `holdUntil` bedeutet zweierlei — mit Bedingungen eine HALTEFRIST, ohne Bedingungen ein TERMIN
 * (dieselbe Unterscheidung, die {@link TaskEvaluation.holdRunning} für den nächsten Schritt trifft).
 * Die Karte zeigte bisher fest „Halten bis", auch über einer reinen Textaufgabe, bei der es nichts zu
 * halten gibt.
 *
 * NICHT über `holdRunning`, obwohl das naheliegt: das misst „die Haltefrist läuft GERADE" und ist bei
 * einer erfüllten oder versäumten Aufgabe mit Bedingungen falsch — die Karte trägt ihre Überschrift
 * aber in JEDEM Zustand. Die Frage hier ist „gibt es überhaupt etwas zu halten", und die beantwortet
 * allein die Bedingungsliste.
 *
 * Hier und nicht in der Komponente: Kartenkopf und Listenzeile ({@link TaskCardData}-Verwender)
 * stellen dieselbe Frage, und zwei Ternäre in zwei Dateien driften auseinander.
 *
 * Bewusst NICHT exportiert: der Schlüssel allein genügt seit dem Dauer-Modus nicht mehr, weil er
 * mitentscheidet, WAS für ein Wert hineingehört (Zeitpunkt oder Dauer). Wer ihn ohne
 * {@link taskDeadlineLine} nähme, träfe genau die Fallunterscheidung wieder selbst — also die, die
 * hier zusammengezogen wurde.
 */
function taskDeadlineKey(
  task: Pick<TaskCardData, "requirements" | "holdDurationMin" | "startedAt">,
): "holdUntilShort" | "holdDurationShort" | "deadlineShort" {
  if (task.requirements.length === 0) return "deadlineShort";
  // Dauer-Modus, noch nicht begonnen: einen Zeitpunkt zu nennen wäre eine Behauptung über etwas, das
  // noch niemand ausgelöst hat — das spätestmögliche Ende gilt ja nur, wenn er die Kulanz voll
  // ausreizt. Sobald der Beginn feststeht, ist der Zeitpunkt die nützlichere Angabe.
  return task.holdDurationMin && !task.startedAt ? "holdDurationShort" : "holdUntilShort";
}

/**
 * Die fertige Frist-Zeile: Schlüssel UND der Wert, der hineingehört.
 *
 * Beides zusammen, weil beides zusammengehört — der Schlüssel entscheidet, OB dort ein Zeitpunkt
 * oder eine Dauer steht, und diese Fallunterscheidung darf nicht an jeder Anzeige neu hängen.
 * Kartenkopf und Listenzeile stellen dieselbe Frage; als zwei Ternäre in zwei Dateien wäre das die
 * Sorte Doppelung, bei der die eine Stelle den Dauer-Modus kennt und die andere nicht.
 *
 * Die Formatierer kommen von aussen: sie brauchen Locale, Zeitzone und die Sub-Beschriftung, und
 * genau die hat nur die Komponente.
 */
export function taskDeadlineLine(
  task: Pick<TaskCardData, "requirements" | "holdDurationMin" | "startedAt" | "holdUntil">,
  fmt: { date: (iso: string) => string; duration: (ms: number) => string },
): { key: ReturnType<typeof taskDeadlineKey>; value: string } {
  const key = taskDeadlineKey(task);
  return {
    key,
    value: key === "holdDurationShort" && task.holdDurationMin
      ? fmt.duration(task.holdDurationMin * 60_000)
      : fmt.date(task.holdUntil),
  };
}

/**
 * Die Startfrist, WENN sie noch etwas aussagt — sonst null.
 *
 * Nur solange nie begonnen wurde. Danach ist sie beantwortet: über einer laufenden Aufgabe wäre
 * „Beginn spätestens 17:06" eine Warnung vor etwas, das längst geschehen ist. Bei `missed` bleibt sie
 * bewusst stehen — dort ist sie kein Hinweis mehr, sondern der BELEG für das Urteil, und ein Vorwurf
 * ohne Beleg lässt sich nicht bestreiten.
 *
 * `withdrawn` fällt heraus: eine zurückgenommene Aufgabe hat keine Frist mehr, die jemanden bindet.
 *
 * Gibt den WERT zurück und nicht bloss ein Ja/Nein: ein Prädikat zwingt jeden Aufrufer, die
 * Null-Prüfung daneben zu wiederholen (der Typ `string | null` verengt sich an einem `boolean`
 * nicht), und die zweite Frage kann von der ersten abweichen.
 */
export function visibleStartDeadline(task: Pick<TaskCardData, "startDeadline" | "startedAt" | "state">): string | null {
  if (task.startedAt !== null || task.state === "withdrawn") return null;
  return task.startDeadline;
}

/** Der Zustand eines einzelnen Nachweises. Dieselbe Rangfolge wie in `evaluateProofs`: das Urteil
 *  eines MENSCHEN schlägt jede Automatik.
 *
 *  Exportiert, weil auch das MCP-Dashboard ihn ausliefert — der Keyholder-Agent sieht dann genau das,
 *  was die Karte zeigt. Zwei Ableitungen desselben Zustands wären zwei Antworten auf dieselbe Frage. */
export function taskProofState(p: TaskProofView, outOfOrderId: string | null): TaskCardProofState {
  // Die Reihenfolge schlägt alles: sie ist der Grund, aus dem die Aufgabe scheitert, und muss an der
  // Zeile stehen, die sie gebrochen hat.
  if (p.id === outOfOrderId) return "outOfOrder";
  if (p.reviewAccepted === true) return "confirmed";
  if (p.reviewAccepted === false) return "rejected";
  if (!p.submittedAt) return "open";
  return p.verifikationStatus !== null ? "confirmed" : "review";
}

/** Wohin führt eine offene Bedingung? KG in die Verschluss-Maske, alles andere ins Trage-Formular
 *  der Kategorie (mit dem geforderten Gerät, falls eines genannt ist).
 *
 *  Der Pfad kommt aus `wearActionHref` — dem einen Bauplatz dieser Route. Ihn hier nachzubauen
 *  hiesse, dass eine Routen-Änderung die Bedingungs-Links still ins Leere zeigen lässt: genau auf
 *  dem Weg, der den Sub vor einem Vergehen bewahren soll. */
function requirementHref(r: EvaluatedTask["requirements"][number], redirectTo: string | null): string | null {
  if (r.type === "KG_LOCKED") {
    const q = redirectTo ? `?${new URLSearchParams({ redirectTo })}` : "";
    return `/dashboard/new/verschluss${q}`;
  }
  if (!r.categoryId) return null; // Kategorie gelöscht — es gibt kein Formular mehr dafür.
  return wearActionHref({ categoryId: r.categoryId, active: false, deviceId: r.deviceId, redirectTo });
}

/**
 * @param withLinks Nur für den Sub: seine eigenen Formulare. Der Keyholder bekommt reine Anzeige.
 *
 * Die Links sind GEKETTET: der Link der ersten offenen Bedingung trägt als `redirectTo` den Link der
 * zweiten, dieser den der dritten. Damit wird aus drei Navigationen eine — fürs Leitbeispiel
 * (KG + Halsband + Knebel) der Unterschied zwischen „drei Mal zurück aufs Dashboard" und einem Durchlauf.
 */
export function toTaskCard(
  e: EvaluatedTask,
  withLinks: boolean,
  /** Anzeige-Felder der Nachweise (Beschreibung, Code) — separat geladen, siehe
   *  `loadTaskProofViews`. Fehlen sie, zeigt die Karte keine Nachweise: besser nichts als eine
   *  Zeile ohne den Code, den der Sub zeigen müsste. */
  proofViews: TaskProofView[] = [],
): TaskCardData {
  const requirements: TaskCardRequirement[] = e.requirements.map((r) => ({
    id: r.id,
    label: r.label,
    satisfied: r.satisfied,
    href: withLinks ? requirementHref(r, null) : null,
  }));

  // Von hinten nach vorne verketten: jeder offene Schritt kennt so den bereits fertig verketteten
  // Rest. Erfüllte Bedingungen sind keine Kettenglieder — sonst schickte die Kette den Sub in ein
  // Formular für ein Gerät, das er schon trägt.
  //
  // Neu gebaut statt angehängt: das Ziel gehört als Parameter in den Bauplatz der URL, nicht als
  // `?`/`&`-Rechnerei an eine fertige Zeichenkette.
  let next: string | null = null;
  for (let i = requirements.length - 1; i >= 0; i--) {
    const r = requirements[i];
    if (r.satisfied || !r.href) continue;
    if (next) r.href = withLinks ? requirementHref(e.requirements[i], next) : null;
    next = r.href;
  }

  // Nachweise sind KEINE Kettenglieder: jeder ist eine eigene Aufnahme zu einem eigenen Zeitpunkt,
  // und die Reihenfolge ist gerade die Forderung — sie hintereinander wegzuklicken wäre das
  // Gegenteil dessen, was verlangt ist.
  // Welcher Nachweis die Reihenfolge bricht, weiss nur die geteilte Regel aus `tasks.ts` — die
  // Anzeige darf sie nicht nachbauen, sonst zeigt sie irgendwann etwas anderes als das Urteil.
  const outOfOrderId = firstOutOfOrderProof(
    [...proofViews].sort((a, b) => a.sortOrder - b.sortOrder),
    e.task,
  )?.id ?? null;

  const proofs: TaskCardProof[] = proofViews.map((p) => {
    const state = taskProofState(p, outOfOrderId);
    return {
      id: p.id,
      description: p.description,
      code: p.code,
      state,
      href: withLinks && state === "open" ? `/dashboard/new/task-proof/${p.id}` : null,
      imageUrl: p.imageUrl,
      reviewNote: p.reviewNote,
      // Beides oder nichts: `reviewTaskProof` schreibt Urteil und Zeitstempel in einem Zug.
      review: p.reviewAccepted !== null && p.reviewedAt
        ? { accepted: p.reviewAccepted, at: p.reviewedAt.toISOString() }
        : null,
    };
  });

  return {
    id: e.task.id,
    title: e.task.title,
    description: e.task.description,
    isPunishment: e.task.isPunishment,
    penaltyReason: e.task.penaltyReason,
    holdUntil: e.evaluation.holdUntil.toISOString(),
    holdDurationMin: e.task.holdDurationMin,
    // Ohne Bedingungen ist die Kulanzfrist bedeutungslos (es gibt nichts anzulegen) — dieselbe
    // Unterscheidung, die `createTask` beim Prüfen der Endzeit trifft.
    startDeadline: e.requirements.length > 0 ? startDeadline(e.task).toISOString() : null,
    state: e.evaluation.state,
    startedAt: e.evaluation.startedAt?.toISOString() ?? null,
    missing: e.evaluation.missing.map((m) => m.label),
    failedRequirement: e.evaluation.failedRequirement?.label ?? null,
    failedAt: e.evaluation.failedAt?.toISOString() ?? null,
    awaitingConfirmation: e.evaluation.awaitingConfirmation,
    holdRunning: e.evaluation.holdRunning,
    requirements,
    proofs,
    completionNote: e.task.completionNote,
    actionable: withLinks,
  };
}
