import type { EvaluatedTask, TaskProofView } from "@/lib/taskIntervals";
import { firstOutOfOrderProof, isTaskOpen, ownProofDeadline, startDeadline, type TaskEvaluation, type TaskState } from "@/lib/tasks";
import { isHiddenFromSub } from "@/lib/delayedTrigger";
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
  | "outOfOrder"
  /** EIGENE Fälligkeit verstrichen: nichts eingereicht — oder erst NACH ihr und (noch) nicht
   *  angenommen, was für das Urteil dasselbe ist. Aus demselben Grund ein eigener Zustand wie
   *  `outOfOrder`: er ist der Beleg für das Urteil der Aufgabe.
   *
   *  Er nimmt der Zeile ihren Aufnahme-Link NICHT mehr (Produkt-Entscheidung 16.08.2026):
   *  nachreichen ist erlaubt, solange die Aufgabe läuft — nur beschriftet die Karte den Weg dann
   *  ehrlich als verspätet. Nach dem Ende der Aufgabe fällt er weg, mit erkennbarem Grund.
   *
   *  Nimmt die Keyholderin das späte Foto an, ist die Zeile `confirmed` und die Aufgabe erfüllt. */
  | "overdue";

export interface TaskCardProof {
  id: string;
  /** Was zu sehen sein muss. */
  description: string;
  /** Der Code, den der Sub ins Bild schreiben muss. Null ohne Code-Pflicht.
   *  MUSS sichtbar sein — ohne ihn kann er den Nachweis gar nicht erbringen. */
  code: string | null;
  state: TaskCardProofState;
  /**
   * EIGENE Fälligkeit dieses Nachweises als ISO — null, wo er bis zum Ende der Aufgabe offen ist
   * (dann gilt die Frist im Kartenkopf, und eine zweite Zeile mit derselben Uhrzeit wäre Lärm).
   *
   * Als aufgelöster ZEITPUNKT und nicht als Minuten-Abstand: gespeichert ist der Abstand zum
   * Nullpunkt, gemeint ist eine Uhrzeit — und die Karte soll sie nicht selbst ausrechnen müssen,
   * schon gar nicht mit einem zweiten Begriff davon, wo der Nullpunkt liegt.
   */
  dueAt: string | null;
  /**
   * Wurde überhaupt etwas eingereicht? Die Grundlage der Sichtung ({@link proofIsSubmitted}).
   *
   * Ein eigenes Feld, weil {@link TaskCardProofState} die Frage nicht beantwortet: `overdue` trägt
   * beide Fälle (nie eingereicht / zu spät eingereicht), und nur im zweiten gibt es ein Foto zu
   * beurteilen. Der Zeitpunkt selbst reist nicht mit — die Karte zeigt ihn nirgends, und ein Feld,
   * das niemand liest, wäre bloss eine weitere Zusicherung, die auseinanderlaufen kann.
   */
  submitted: boolean;
  /** Deep-Link ins Aufnahme-Formular. Null beim Keyholder, bei bereits eingereichten und überall
   *  dort, wo nichts mehr anzunehmen ist ({@link proofCaptureHref}). */
  href: string | null;
  /** Der i18n-Schlüssel des Verspätungs-Satzes an dieser Zeile — null, wo keiner hingehört
   *  ({@link proofLateNote}). Als SCHLÜSSEL und nicht als Text: die Karte übersetzt, die Sicht
   *  entscheidet. Dasselbe Muster wie {@link taskDeadlineLine} eine Ebene höher. */
  lateNote: "proofLateHint" | "proofLateClosed" | null;
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
  /**
   * TERMINIERT und noch nicht ausgelöst: ab wann sie gilt (ISO) — sonst null.
   *
   * Nur die KEYHOLDER-Sicht bekommt hier je einen Wert: dem Träger wird eine solche Aufgabe gar
   * nicht erst geladen. Sie steht trotzdem an der geteilten Karte und nicht an der Keyholder-Hülle,
   * weil sie die Frist-Zeile darüber ERKLÄRT — ohne sie sähe die Keyholderin eine Aufgabe mit einem
   * Ende weit in der Zukunft und keinen Hinweis, dass der Träger noch nichts davon weiss.
   */
  scheduledFor: string | null;
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

/**
 * Liegt an diesem Nachweis überhaupt ein Foto? — die Frage, an der die Sichtung hängt.
 *
 * Am eigenen Feld und NICHT aus {@link TaskCardProof.state} erschlossen, obwohl das kürzer wäre: der
 * Zustand fasst Sachverhalte zusammen, die für die Sichtung auseinanderfallen. `overdue` heisst „die
 * Frist ist um" — und das trifft sowohl den Nachweis, zu dem nie etwas kam (nichts zu sichten), als
 * auch den, der zu SPÄT kam (Foto da, Urteil weiterhin möglich und sinnvoll). Aus dem Zustand
 * abgeleitet verlor die Keyholderin für den zweiten Fall Annehmen und Ablehnen, während das Bild
 * darüber sichtbar blieb.
 */
export function proofIsSubmitted(proof: Pick<TaskCardProof, "submitted">): boolean {
  return proof.submitted;
}

/**
 * Führt diese Nachweis-Zeile ins Aufnahme-Formular?
 *
 * EINE Regel, und es ist Wort für Wort die des Dienstes (`proofSubmitBlockedReason`): nichts
 * Eingereichtes, und die Aufgabe nimmt noch an. Mehr steht dort auch nicht, seit die eigene Frist
 * eines Nachweises weich ist — eine strengere Regel hier hiesse, eine Zeile stumm zu sperren, die
 * das Formular annehmen würde.
 *
 * BIS ZUM 16.08.2026 stand hier `isTaskOpen(evaluation.state)`, mit der Begründung: steht das
 * Ergebnis fest, ändert kein weiteres Foto mehr etwas. Diese Begründung ist mit der späten Annahme
 * weggefallen — eine wegen eines Nachweises versäumte Aufgabe ist gerade NICHT endgültig, und ihre
 * Zeilen sind die einzigen, über die sie noch zu retten ist. Die alte Regel hätte ausserdem sprunghaft
 * gewirkt: von zwei offenen Nachweisen wäre der zweite erst wieder antippbar geworden, nachdem auch
 * SEINE Frist verstrichen war.
 *
 * Dass ein Foto an einer abgebrochenen Aufgabe nichts mehr rettet, sperrt den Weg bewusst NICHT: das
 * ist ein Urteil über den Wert der Einreichung, und das fällt die Keyholderin. Die Beschriftung
 * verspricht deshalb nirgends die Rettung der Aufgabe — nur, dass der Nachweis noch zählen kann.
 *
 * Bereits EINGEREICHTE führen nie irgendwohin — auch nicht die verspäteten: sie warten auf ein
 * Urteil, nicht auf ein zweites Foto (`TASK_PROOF_ALREADY_SUBMITTED`).
 */
function proofCaptureHref(
  proof: Pick<TaskCardProof, "id" | "submitted">,
  evaluation: Pick<TaskEvaluation, "proofSubmitOpen">,
  /** Nur für den Sub: es sind seine Formulare. */
  withLinks: boolean,
): string | null {
  if (!withLinks || proof.submitted || !evaluation.proofSubmitOpen) return null;
  return `/dashboard/new/task-proof/${proof.id}`;
}

/**
 * Der Satz unter einer ÜBERFÄLLIGEN Zeile — oder `null`, wo keiner hingehört.
 *
 * Neben dem Weg und nicht in der Komponente: beide Antworten folgen aus derselben Frage („nimmt die
 * Aufgabe noch an?"), und die Karte hatte sie sonst aus dem FEHLEN eines Links zurückgeschlossen —
 * eine Herleitung, die schweigend falsch wird, sobald der Link aus einem zweiten Grund fehlt.
 *
 * Nur in der Sicht des TRÄGERS: die Keyholderin sieht die Verspätung an ihrer Sichtungs-Zeile, und
 * „du kannst nichts mehr nachreichen" wäre an sie gerichtet schlicht falsch.
 */
function proofLateNote(
  proof: Pick<TaskCardProof, "state" | "submitted">,
  evaluation: Pick<TaskEvaluation, "proofSubmitOpen">,
  withLinks: boolean,
): "proofLateHint" | "proofLateClosed" | null {
  if (!withLinks || proof.state !== "overdue") return null;
  // Eingereicht zählt als Hinweis, nicht als Absage: das Foto liegt vor, es wartet nur noch auf ein
  // Urteil — auch dann, wenn die Aufgabe inzwischen zu Ende ist.
  return proof.submitted || evaluation.proofSubmitOpen ? "proofLateHint" : "proofLateClosed";
}

/** Der Zustand eines einzelnen Nachweises. Dieselbe Rangfolge wie in `evaluateProofs`: das Urteil
 *  eines MENSCHEN schlägt jede Automatik.
 *
 *  Exportiert, weil auch das MCP-Dashboard ihn ausliefert — der Keyholder-Agent sieht dann genau das,
 *  was die Karte zeigt. Zwei Ableitungen desselben Zustands wären zwei Antworten auf dieselbe Frage. */
export function taskProofState(
  p: TaskProofView,
  outOfOrderId: string | null,
  /** Ist die EIGENE Fälligkeit dieses Nachweises verstrichen? Aus `evaluation.overdueProofIds` —
   *  die Auswertung ist die einzige Schicht, die „jetzt" kennt (siehe dort).
   *
   *  PFLICHT-Angabe ohne Vorgabewert: ein vergessenes Argument fiele sonst still auf „nicht
   *  überfällig" zurück und zeigte einen versäumten Nachweis als offen — dieselbe Klasse stiller
   *  Falschauskunft, gegen die `firstOutOfOrderProof` seinen `task`-Parameter bekommen hat. */
  overdue: boolean,
): TaskCardProofState {
  // Die Reihenfolge schlägt alles: sie ist der Grund, aus dem die Aufgabe scheitert, und muss an der
  // Zeile stehen, die sie gebrochen hat.
  if (p.id === outOfOrderId) return "outOfOrder";
  if (p.reviewAccepted === true) return "confirmed";
  if (p.reviewAccepted === false) return "rejected";
  // Hier landet auch ein EINGEREICHTER Nachweis — nämlich einer, der nach seiner Frist kam und noch
  // NICHT gesichtet ist. Fürs Urteil zählt er nicht (`proofCounted`), und ohne diesen Zweig zeigte
  // die Zeile ein grünes „erbracht" über einer versäumten Aufgabe, ohne dass irgendwo stünde, woran
  // es lag.
  //
  // Dass die Annahme oben davorsteht, ist seit der späten Annahme nur noch Absicherung: ein
  // angenommener Nachweis steht gar nicht mehr in `overdueProofIds` (`proofCounted` zählt ihn), die
  // beiden Zweige können sich also nicht mehr widersprechen. Die Reihenfolge bleibt trotzdem, weil
  // sie die richtige Aussage macht, falls die beiden Schichten je wieder auseinanderlaufen.
  if (overdue) return "overdue";
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

  // Die überfälligen kommen aus der AUSWERTUNG, nicht aus einer eigenen Uhr hier — siehe
  // `TaskEvaluation.overdueProofIds`. Lineare Suche statt eines `Set`: die Liste ist durch
  // `TASK_PROOF_MAX` auf zehn gedeckelt und fast immer leer, ein Set je Aufgabe wäre teurer als
  // das, was es beschleunigen soll.
  const proofs: TaskCardProof[] = proofViews.map((p) => {
    const state = taskProofState(p, outOfOrderId, e.evaluation.overdueProofIds.includes(p.id));
    const submitted = p.submittedAt !== null;
    return {
      id: p.id,
      description: p.description,
      code: p.code,
      state,
      // Gegen das WIRKSAME Ende gedeckelt (`evaluation.holdUntil`), wie jede andere Frist-Anzeige
      // dieser Karte: im Dauer-Modus steht in der Spalte nur das spätestmögliche.
      dueAt: ownProofDeadline(p, e.task, e.evaluation.holdUntil)?.toISOString() ?? null,
      submitted,
      // Weg UND Hinweis aus derselben Frage — welche das ist, steht bei `proofCaptureHref`.
      href: proofCaptureHref({ id: p.id, submitted }, e.evaluation, withLinks),
      lateNote: proofLateNote({ state, submitted }, e.evaluation, withLinks),
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
    // Ausgelöste Aufgaben tragen ihr `wirksamAb` weiter (die Zustellung schreibt es fort) — gemeint
    // ist hier aber nur das noch AUSSTEHENDE, also dieselbe Frage, die `isHiddenFromSub` beantwortet.
    scheduledFor: isHiddenFromSub(e.task) ? e.task.wirksamAb!.toISOString() : null,
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
