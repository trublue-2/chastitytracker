import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { serviceFail, type ServiceResult } from "@/lib/serviceResult";
import { verifyKontrolleCodeDetailed, type VerifyDetailedResult } from "@/lib/verifyCode";
import { structuredLog } from "@/lib/serverLog";
import { notifyUser } from "@/lib/notify";
import { getControllerAudience } from "@/lib/keyholder";
import { notifyLateProof } from "@/lib/taskProofNotify";
import { evaluateTaskById, SUB_VISIBLE_WHERE } from "@/lib/taskIntervals";
import { isTaskResultFinal, proofResubmittable, type TaskEvaluation } from "@/lib/tasks";
import { settleIfFinal, settleIfNowDone } from "@/lib/taskService";
import { TASK_PROOF_TEXT_MAX_LENGTH } from "@/lib/constants";
import type { MessageActor } from "@/lib/messageService";

/**
 * Der Sub reicht ein gefordertes Nachweis-Foto ein (Issue #39, Etappe 3).
 *
 * Bewusst ein eigener Service und KEIN Eintrag über `POST /api/entries`: ein Nachweis ist kein
 * Tracker-Eintrag, er hat weder Paar-Partner noch Kategorie und hätte in Statistik und Zeitstrahl
 * nichts verloren. Derselbe Grund, aus dem `TaskProof` eine eigene Tabelle bekam.
 */

export interface SubmitProofParams {
  /** Das Foto — `null`, wo kein Foto verlangt ist (reiner Text-Nachweis). Wo `requiresPhoto` gilt,
   *  ist es Pflicht (`TASK_PROOF_PHOTO_REQUIRED`). */
  imageUrl: string | null;
  /** Aufnahmezeit aus den EXIF-Daten des Bildes. `null`, wenn das Bild keine trägt (oder kein Bild
   *  eingereicht wird) — dann ist die Reihenfolge nicht belegbar und der Nachweis geht zur Sichtung
   *  (siehe `evaluateProofs`). */
  imageExifTime: Date | null;
  /** Der Text-Nachweis — `null`, wo kein Text verlangt ist. Wo `requiresText` gilt, ist er Pflicht
   *  (`TASK_PROOF_TEXT_REQUIRED`) und auf {@link TASK_PROOF_TEXT_MAX_LENGTH} begrenzt. */
  proofText: string | null;
}

/** Die drei Verifikations-Felder, wie sie an die Zeile geschrieben werden. Rein abgeleitet aus dem
 *  Prüf-Ergebnis, damit die Zuordnung an EINER Stelle steht und isoliert prüfbar ist. */
export function proofVerificationOutcome(result: VerifyDetailedResult | null): {
  verifikationStatus: string | null;
  verifikationReason: string | null;
  verifikationReasonDetected: string | null;
} {
  // Kein Vision-Provider oder ein Fehler beim Prüfen: KEIN Grund setzen. „Nicht geprüft" und
  // „geprüft und durchgefallen" müssen unterscheidbar bleiben — sonst sähe ein Ausfall unserer
  // Infrastruktur aus wie ein Fehlverhalten des Subs, und `evaluateProofs` unterscheidet die beiden
  // Fälle genau an diesem Feld.
  if (result === null || result.error) {
    return { verifikationStatus: null, verifikationReason: null, verifikationReasonDetected: null };
  }
  if (result.match) {
    return { verifikationStatus: "ai", verifikationReason: null, verifikationReasonDetected: null };
  }
  return { verifikationStatus: null, verifikationReason: result.reason, verifikationReasonDetected: result.detected };
}

/**
 * Die Code-Prüfung eines eingereichten Nachweises — NACH dem Commit, fire-and-forget.
 *
 * Dieselbe Ebene wie `runInspectionVerification` bei der Kontrolle, und aus demselben Grund: das
 * Vision-Backend braucht Sekunden. Sie in die Einreichung zu legen hiesse, den Sub bei jedem
 * Code-Nachweis so lange auf einen Spinner schauen zu lassen — obwohl das Foto längst gespeichert ist
 * und der Ausgang nichts blockiert.
 *
 * Der Zwischenzustand ist ungefährlich, weil der Aufgaben-Zustand ABGELEITET ist: bis das Ergebnis
 * da ist, sieht `evaluateProofs` einen Nachweis ohne Bestätigung und ohne Grund — also „wartet auf
 * Sichtung". Landet die Bestätigung, wechselt er von selbst. Ein Fehlschlag der Prüfung lässt ihn in
 * der Sichtung, was ohnehin der richtige Ausgang ist.
 */
export async function runTaskProofVerification(proofId: string, imageUrl: string, code: string, userId: string, taskId: string): Promise<void> {
  try {
    const result = await verifyKontrolleCodeDetailed(imageUrl, code);
    if (result === null || result.error) {
      structuredLog("taskProof", "verify_unavailable", { proofId, error: result?.error ?? "not_configured" });
    }
    await prisma.taskProof.update({ where: { id: proofId }, data: proofVerificationOutcome(result) });

    // Ein bestätigter Code SICHTET den Nachweis von selbst (`codeConfirmed`) — dann kann diese
    // Prüfung die letzte fehlende Handlung gewesen sein, und die Aufgabe ist damit erfüllt. Ohne
    // diese Zeile wartete das Ergebnis bis zur Frist, wie es die Selbstmeldung vor dem Befund vom
    // 17.08.2026 tat.
    await settleIfNowDone(userId, taskId);
  } catch (err) {
    // Nie werfen: der Nachweis IST eingereicht, und ein gescheiterter Prüflauf darf das nicht
    // rückgängig machen. Ohne Ergebnis bleibt er in der Sichtung — der sichere Ausgang.
    structuredLog("taskProof", "verify_failed", { proofId, error: (err as Error).message });
  }
}

/**
 * WELCHE Nachweis-Zeile der Träger überhaupt anfassen darf.
 *
 * Zwei Bedingungen, beide in SQL und nicht als Prüfung danach:
 *  - Besitz über die Aufgabe — ein Nachweis gehört niemandem für sich. Ein vergessener Besitz-Check
 *    wäre ein IDOR, den kein Typfehler auffängt.
 *  - `SUB_VISIBLE_WHERE` — bis zum Auslösen existiert eine terminierte Aufgabe für ihn NICHT. Ein
 *    Nachweis, den er nicht sehen darf, ist damit von einem fremden ununterscheidbar; beide enden im
 *    selben Ausgang, und der verrät nicht, dass die Aufgabe schon angelegt ist.
 *
 * GETEILT von der Formular-Seite und dem Dienst, aus demselben Grund wie
 * {@link proofSubmitBlockedReason}: die beiden laden dieselbe Zeile zum selben Zweck (nur mit
 * unterschiedlichen Spalten), und zwei unabhängig formulierte Bedingungsketten sind genau die
 * Stelle, an der eine künftige dritte Bedingung nur in einer der beiden landet — hier ist das
 * bereits einmal passiert.
 */
export function ownProofWhere(proofId: string, userId: string): Prisma.TaskProofWhereInput {
  return { id: proofId, task: { userId, ...SUB_VISIBLE_WHERE } };
}

export async function submitTaskProof(
  proofId: string,
  userId: string,
  p: SubmitProofParams,
): Promise<ServiceResult<{ taskId: string }>> {
  const proof = await prisma.taskProof.findFirst({
    where: ownProofWhere(proofId, userId),
    // `dueOffsetMin` und `lateNotifiedAt` gehören zur Verspätungs-Meldung ({@link notifyLateProof}),
    // die Nullpunkt-Felder der Aufgabe (`createdAt`/`wirksamAb`) und ihr Titel ebenso.
    select: {
      id: true, code: true, submittedAt: true, dueOffsetMin: true, lateNotifiedAt: true,
      // `reviewAccepted` entscheidet mit über die Einreiche-Schranke: ein abgelehnter Nachweis darf neu
      // eingereicht, ein angenommener nie, ein Foto in Sichtung nicht (one-shot) — siehe
      // {@link proofSubmitBlockedReason}.
      reviewAccepted: true,
      // Was der Nachweis überhaupt fordert — entscheidet, welche Einreichung Pflicht ist.
      requiresPhoto: true, requiresText: true,
      // `holdDurationMin` gehört zur Schranke: es entscheidet, ob `holdUntil` das Ende IST oder nur
      // dessen obere Grenze (siehe {@link taskAcceptsProof}).
      task: {
        select: {
          id: true, title: true, withdrawnAt: true, holdUntil: true, holdDurationMin: true,
          createdAt: true, wirksamAb: true,
        },
      },
    },
  });
  if (!proof) return serviceFail(404, "TASK_PROOF_NOT_FOUND");

  // EIN „jetzt" für Schranke und Zeitstempel: im Dauer-Modus liegt zwischen beiden eine ganze
  // Auswertung, und ein Nachweis, der die Frist gerade noch bestanden hat, soll nicht mit einem
  // Zeitstempel dahinter gespeichert werden.
  const now = new Date();
  const { blocked } = await proofSubmitContext(proof, userId, now);
  if (blocked) return serviceFail(400, blocked);

  // Was der Nachweis fordert, muss auch da sein — die eine Prüfung der EINREICHUNGS-Form (der
  // Zustand steckt in `proofSubmitContext` darüber). Nur die geforderte Art wird geschrieben: ein
  // reiner Text-Nachweis speichert kein `imageUrl`, ein reiner Foto-Nachweis keinen `proofText`.
  const kindError = proofKindError(proof, p);
  if (kindError) return serviceFail(400, kindError);
  const imageUrl = proof.requiresPhoto ? p.imageUrl : null;
  const imageExifTime = proof.requiresPhoto ? p.imageExifTime : null;
  const proofText = proof.requiresText ? p.proofText!.trim() : null;

  // Zustand in der Where-Klausel: reicht der Sub parallel zweimal ein (Doppel-Tap, Offline-Replay),
  // trifft der zweite Aufruf null Zeilen statt den ersten zu überschreiben. Drei zulässige Vor-Zustände
  // (die Schranke oben hat sie bereits durchgesetzt, hier ist es der Renn-Schutz): Erst-Einreichung,
  // abgelehnt (neuer Versuch), oder Text in Sichtung (bearbeitbar). Ein abgelehntes Foto wird beim
  // ersten Neu-Upload zu `reviewAccepted: null` und fällt damit aus dem Filter — der zweite Tap
  // trifft nichts.
  const res = await prisma.taskProof.updateMany({
    where: {
      id: proofId,
      OR: [
        { submittedAt: null }, // Erst-Einreichung
        { reviewAccepted: false }, // abgelehnt → neuer Versuch
        { requiresPhoto: false, reviewAccepted: null }, // Text in Sichtung → bearbeitbar (Erst-Fall deckt bereits Zeile 1)
      ],
    },
    // (Wieder-)Einreichen setzt die Sichtung und die Code-Prüfung ZURÜCK: die frische Einreichung wird
    // neu beurteilt. Bei einer Erst-Einreichung sind diese Felder ohnehin null (kein Effekt).
    //
    // `lateNotifiedAt` bleibt bewusst STEHEN: die Verspätungs-Meldung ist „genau einmal je Nachweis"
    // (siehe `notifyLateProof`), und `notifyLateProof` dedupliziert über den in `proof` geladenen
    // Wert. Es zurückzusetzen erzeugte einen Widerspruch (Spalte null, Speicher gesetzt) und bräche die
    // Einmal-Zusage. War der Nachweis vorher NICHT verspätet (Stempel null), meldet ein verspäteter
    // Neu-Upload trotzdem — dann ist der Stempel eben noch leer.
    data: {
      imageUrl, imageExifTime, proofText, submittedAt: now,
      reviewedAt: null, reviewAccepted: null, reviewNote: null,
      verifikationStatus: null, verifikationReason: null, verifikationReasonDetected: null,
    },
  });
  if (res.count === 0) return serviceFail(400, "TASK_PROOF_ALREADY_SUBMITTED");

  // Code-Prüfung erst NACH dem Speichern (siehe `runTaskProofVerification`). `proof.code` ist genau
  // dann gesetzt, wenn ein Code gefordert ist — `checkProofs` vergibt ihn nur mit Foto-Pflicht, das
  // `imageUrl` ist dann verbindlich da.
  if (proof.code && imageUrl) void runTaskProofVerification(proofId, imageUrl, proof.code, userId, proof.task.id);

  // Kam das Foto zu spät, wartet es auf ein URTEIL — und niemand sonst sagt das der Keyholderin
  // (`taskProofNotify.ts`; die zweite Stelle, an der dieselbe Verspätung entsteht, ist eine nach vorn
  // verschobene Frist). `submittedAt: now`, weil die Zeile oben gerade so geschrieben wurde; sie noch
  // einmal zu laden hiesse, den eben gesetzten Wert von der Platte zurückzulesen.
  //
  // Fire-and-forget wie die Zeile darüber und wie die Keyholder-Meldung der Erfassungs-Route
  // (`api/entries/route.ts`): dahinter steht ein SMTP-Versand je Empfänger, und das Gegenüber ist
  // ein Handy, das gerade ein Foto hochlädt. Die Antwort hängt nicht davon ab — die Funktion wirft
  // nie und stempelt sich selbst.
  void notifyLateProof({ ...proof, submittedAt: now }, userId);

  return { ok: true, data: { taskId: proof.task.id } };
}

/**
 * Nimmt die Aufgabe noch ein Nachweis-Foto an? — dieselbe Frage, die die Auswertung als
 * {@link TaskEvaluation.proofSubmitOpen} beantwortet, und bewusst DEREN Antwort. Dazu das Ende, gegen
 * das ein Nachweis ohne eigene Fälligkeit fällig wird — aus DERSELBEN Auswertung, damit die
 * Formular-Seite die Frist nennt, gegen die hier geprüft wird (über `proofDue`).
 *
 * Nicht „das wirksame Ende holen und selbst vergleichen": das wären zwei Formulierungen einer
 * Grenze, die Karte und Dienst gemeinsam ziehen müssen — bekäme sie je einen zweiten Term, zeigte
 * die Karte einen Weg, den das Formular gleich wieder verwehrt. Der Vergleich steht deshalb genau
 * einmal, in `evaluateTask`.
 *
 * Im KLASSISCHEN Modus wird dafür nichts geladen: dort IST die Spalte das Ende, und der Ausdruck ist
 * derselbe Einzeiler wie in der Auswertung. Nur im DAUER-Modus steht in `holdUntil` bloss das
 * spätestmögliche Ende (Kulanzfrist voll ausgereizt) — das wirkliche hängt am abgeleiteten Beginn,
 * und den kennt allein die Intervall-Rechnung.
 *
 * Warum diese Genauigkeit zählt, seit die Nachweis-Frist weich ist: früher war die Aufgaben-Frist
 * nur die äussere Klammer um die schärfere Nachweis-Frist, ein paar Minuten Ungenauigkeit fielen
 * nicht auf. Jetzt ist sie die EINZIGE Grenze — gegen die Spalte gemessen nähme der Dienst im
 * Dauer-Modus noch Fotos für eine Aufgabe an, die längst durch ist, und eine Annahme der
 * Keyholderin machte daraus rückwirkend eine erfüllte.
 *
 * Fällt die Zeile zwischen den beiden Abfragen weg, gilt die Spalte: sie liegt nie VOR dem wirklichen
 * Ende, also weist dieser Pfad im Zweifel nicht fälschlich ab.
 *
 * Den RÜCKZUG beantwortet sie nicht — {@link proofSubmitBlockedReason} prüft ihn davor und nennt ihn
 * beim Namen, statt ihn als „zu spät" auszugeben.
 */
async function taskProofWindow(
  userId: string,
  task: { id: string; holdUntil: Date; holdDurationMin: number | null },
  now: Date,
): Promise<{ accepts: boolean; end: Pick<TaskEvaluation, "holdUntil" | "startedAt"> }> {
  // Ohne Auswertung (klassischer Modus, oder die Zeile fiel eben weg) gilt die Spalte; ob das Ende
  // dabei noch vorläufig ist, beantwortet `endIsProvisional` aus Modus und Beginn.
  const column = { accepts: now <= task.holdUntil, end: { holdUntil: task.holdUntil, startedAt: null } };
  if (!task.holdDurationMin) return column;
  const evaluated = await evaluateTaskById(userId, task.id, now);
  return evaluated ? { accepts: evaluated.evaluation.proofSubmitOpen, end: evaluated.evaluation } : column;
}

/**
 * Was einer Einreichung im Weg steht — oder `null`, wenn sie zulässig ist.
 *
 * Der EINE Aufruf für die Formular-Seite (sie leitet aufs Dashboard um, statt ein Formular zu
 * zeigen, dessen Absenden ohnehin scheitert) und den Dienst (er hat das letzte Wort). Zwei unabhängig
 * formulierte Bedingungsketten wären genau die Stelle, an der eine künftige vierte Bedingung nur in
 * einer der beiden landet.
 *
 * Dazu das Ende aus DERSELBEN Auswertung: die Formular-Seite nennt damit die Frist, gegen die hier
 * geprüft wird, und bezahlt die Auswertung im Dauer-Modus nur einmal.
 */
export async function proofSubmitContext(
  proof: {
    submittedAt: Date | null;
    requiresPhoto: boolean;
    reviewAccepted: boolean | null;
    task: { id: string; withdrawnAt: Date | null; holdUntil: Date; holdDurationMin: number | null };
  },
  userId: string,
  now: Date,
): Promise<{ blocked: ReturnType<typeof proofSubmitBlockedReason>; end: Pick<TaskEvaluation, "holdUntil" | "startedAt"> }> {
  const window = await taskProofWindow(userId, proof.task, now);
  return { blocked: proofSubmitBlockedReason(proof, window.accepts), end: window.end };
}

/** Die Regel selbst — ohne Datenbank, damit sie für sich prüfbar bleibt. Die Rangfolge ist Teil der
 *  Aussage: ein zurückgezogener oder erledigter Nachweis bekommt SEINEN Grund genannt, nicht den der
 *  Frist. */
export function proofSubmitBlockedReason(
  proof: { submittedAt: Date | null; requiresPhoto: boolean; reviewAccepted: boolean | null; task: { withdrawnAt: Date | null } },
  /** Nimmt die Aufgabe überhaupt noch etwas an? ({@link taskAcceptsProof}) */
  taskAccepts: boolean,
): "TASK_NOT_EDITABLE" | "TASK_PROOF_ALREADY_SUBMITTED" | "TASK_PROOF_TOO_LATE" | null {
  if (proof.task.withdrawnAt) return "TASK_NOT_EDITABLE";
  // Die Foto-vs-Text-/Ablehnungs-Regel steht an EINEM Ort ({@link proofResubmittable}); hier nur der
  // Rahmen (Rückzug, Frist).
  if (proof.submittedAt && !proofResubmittable({ submitted: true, requiresPhoto: proof.requiresPhoto, reviewAccepted: proof.reviewAccepted })) {
    return "TASK_PROOF_ALREADY_SUBMITTED";
  }
  // DIE EIGENE FRIST DES NACHWEISES STEHT HIER NICHT (Produkt-Entscheidung 16.08.2026): der Träger
  // darf nach ihr noch einreichen, die Keyholderin entscheidet (die Karte sagt „verspätet"). Die
  // harte Grenze ist das WIRKSAME ENDE der Aufgabe — danach nimmt sie nichts mehr an.
  if (!taskAccepts) return "TASK_PROOF_TOO_LATE";
  return null;
}

/**
 * Fehlt der Einreichung, was der Nachweis fordert? — die Prüfung der EINREICHUNGS-FORM (Foto und/oder
 * Text), getrennt vom Zustand ({@link proofSubmitBlockedReason}).
 *
 * Ohne Datenbank, damit sie für sich prüfbar bleibt und der Dienst sie mit der eben geladenen Zeile
 * aufruft. Der Text wird VOR der Längen-Prüfung getrimmt — dieselbe Form, die gespeichert wird, sonst
 * ginge eine Einreichung aus lauter Leerzeichen als „vorhanden" durch.
 */
export function proofKindError(
  proof: { requiresPhoto: boolean; requiresText: boolean },
  p: { imageUrl: string | null; proofText: string | null },
): "TASK_PROOF_PHOTO_REQUIRED" | "TASK_PROOF_TEXT_REQUIRED" | "TASK_PROOF_TEXT_TOO_LONG" | null {
  if (proof.requiresPhoto && !p.imageUrl) return "TASK_PROOF_PHOTO_REQUIRED";
  if (proof.requiresText) {
    const text = p.proofText?.trim();
    if (!text) return "TASK_PROOF_TEXT_REQUIRED";
    if (text.length > TASK_PROOF_TEXT_MAX_LENGTH) return "TASK_PROOF_TEXT_TOO_LONG";
  }
  return null;
}

/** Was einer SICHTUNG im Weg steht — oder `null`, wenn sie zulässig ist.
 *
 *  Das Gegenstück zu {@link proofSubmitBlockedReason} auf der anderen Seite desselben Nachweises,
 *  und eigenständig aus demselben Grund: geteilt vom Service (er hat das letzte Wort) und von der
 *  dryRun-Vorschau des MCP (`mcpReviewTaskProof`), die diese Kette sonst ein zweites Mal führte.
 *  Genau daran ist `edit_task` gescheitert — der Abschrift dort fehlte `completedAt`, und die
 *  Vorschau versprach Erfolg für einen Commit, der mit 400 endete. Eine dritte Schranke kommt so bei
 *  beiden an, statt nur bei einem von beiden.
 *
 *  Zwei Argumente statt der verschachtelten Form des Geschwisters: die Vorschau bekommt Aufgabe und
 *  Nachweis von `resolveTaskProof` als zwei Objekte, und ein nur zum Prüfen gebautes
 *  `{ ...proof, task }` wäre eine Attrappe der Zeile, die es dort gar nicht gibt. */
export function proofReviewBlockedReason(
  proof: { submittedAt: Date | null },
  task: { withdrawnAt: Date | null },
): "TASK_NOT_EDITABLE" | "TASK_PROOF_NOT_SUBMITTED" | null {
  if (task.withdrawnAt) return "TASK_NOT_EDITABLE";
  // Über einen Nachweis, den es noch gar nicht gibt, lässt sich nicht urteilen.
  if (!proof.submittedAt) return "TASK_PROOF_NOT_SUBMITTED";
  return null;
}

/**
 * Die Keyholderin sichtet einen eingereichten Nachweis (Issue #39, Etappe 4).
 *
 * Sie ist der Ausweg aus `awaitingReview` — und ohne sie wäre der Zustand eine Sackgasse: die
 * Felder `reviewAccepted`/`reviewNote` wurden bis hierher überall GELESEN, aber von niemandem
 * geschrieben.
 *
 * Bewusst WIEDERHOLBAR: ein Urteil lässt sich ändern. Der Zustand einer Aufgabe ist abgeleitet, eine
 * korrigierte Sichtung wirkt also sofort und vollständig — und die Alternative wäre, dass eine
 * versehentliche Ablehnung den Sub unwiderruflich ein Vergehen kostet.
 */
export async function reviewTaskProof(
  proofId: string,
  userId: string,
  p: { accepted: boolean; note?: string | null },
  actor: MessageActor,
): Promise<ServiceResult<{ taskId: string }>> {
  const proof = await prisma.taskProof.findFirst({
    where: { id: proofId, task: { userId } },
    include: { task: { select: { id: true, title: true, withdrawnAt: true } } },
  });
  if (!proof) return serviceFail(404, "TASK_PROOF_NOT_FOUND");

  const blocked = proofReviewBlockedReason(proof, proof.task);
  if (blocked) return serviceFail(400, blocked);

  await prisma.taskProof.update({
    where: { id: proofId },
    data: { reviewedAt: new Date(), reviewAccepted: p.accepted, reviewNote: p.note?.trim() || null },
  });

  await notifyProofReviewed(proof.task.id, userId, proof.task.title, p.accepted, actor);
  return { ok: true, data: { taskId: proof.task.id } };
}

/**
 * Meldet, was aus der Aufgabe nach der Sichtung geworden ist.
 *
 * Warum HIER und nicht im Poller: der hat seine Meldung längst abgegeben („bitte sichten") und die
 * Zeile dabei gestempelt — er sieht sie nie wieder. Das Ergebnis muss deshalb von der Handlung
 * kommen, die es herbeigeführt hat. Das ist ohnehin die bessere Stelle: ein menschliches Urteil soll
 * nicht bis zum nächsten Minuten-Tick warten.
 *
 * Steht die Aufgabe danach fest, geht die ERGEBNIS-Meldung raus (an Sub und Keyholder) und die Zeile
 * wird gestempelt, damit der Poller nicht nachlegt. Steht sie noch nicht fest — die Frist läuft
 * noch, oder ein anderer Nachweis fehlt —, erfährt nur der Sub, dass sein Nachweis beurteilt wurde.
 */
async function notifyProofReviewed(taskId: string, userId: string, title: string, accepted: boolean, actor: MessageActor): Promise<void> {
  try {
    // `once: false` — eine zweite Sichtung ist ein korrigiertes Urteil. Verschluckte der Posteingang
    // sie, bliebe nach „abgelehnt → doch angenommen" das falsche Ergebnis als letzte Zeile stehen.
    if (await settleIfFinal(userId, taskId, false) !== "notFinal") return;

    /**
     * Die Aufgabe steht (wieder) NICHT fest — ein etwaiger Ergebnis-Stempel ist damit überholt und
     * muss weg.
     *
     * `resultNotifiedAt` ist das EINWEG-TOR des Pollers: er wählt über `resultNotifiedAt: null`
     * (`taskService.ts`), eine gestempelte Zeile sieht er nie wieder. Der Weg zurück ist ein
     * Normalfall, seit eine Annahme eine bereits versäumte Aufgabe rettet: nach Fristablauf abgelehnt
     * (Aufgabe `missed`, Ergebnis gemeldet UND gestempelt), die Keyholderin nimmt später doch an — die
     * Aufgabe ist wieder erfüllbar, der überholte Stempel muss weg. (Eine Ablehnung MITTEN in der
     * Frist erzeugt seit dem 08.09.2026 gar kein Ergebnis mehr: die Aufgabe bleibt offen zum
     * Nachbessern, `settleIfFinal` liefert dann `notFinal`.)
     *
     * Ohne das Zurücksetzen bliebe die Aufgabe dem Poller für immer verborgen — der Träger bekäme
     * sein Ergebnis nie, und eine Strafaufgabe schlösse ihre Strafe nicht ab (`settleTaskResult`
     * tut beides). Auch die Wege des Trägers kämen nicht mehr durch: `settleIfNowDone` liest
     * denselben Stempel und steigt an ihm aus.
     *
     * `updateMany` mit dem Stempel in der Bedingung: ohne ihn wäre es ein Schreibzugriff bei jeder
     * Sichtung, obwohl der Regelfall gar nichts zu löschen hat.
     */
    await prisma.task.updateMany({
      where: { id: taskId, userId, resultNotifiedAt: { not: null } },
      data: { resultNotifiedAt: null },
    });

    // Steht die Aufgabe noch nicht fest — die Frist läuft, oder ein anderer Nachweis fehlt —,
    // erfährt nur der Sub, dass sein Nachweis beurteilt wurde.
    await notifyUser(userId, {
      subjectKey: accepted ? "taskProofAcceptedSubject" : "taskProofRejectedSubject",
      messageKey: accepted ? "taskProofAcceptedMessage" : "taskProofRejectedMessage",
      params: { title },
      // Das URTEIL über den Nachweis ist die Entscheidung eines Menschen und nennt ihn. Anders als
      // die Ergebnis-Meldung darüber (`settleTaskResult`), die ein Befund der App ist.
      inbox: { ref: { type: "task", id: taskId }, actor },
    });
  } catch (err) {
    // Die Sichtung IST geschrieben — eine gescheiterte Meldung darf sie nicht mitreissen.
    structuredLog("taskProof", "review_notify_failed", { taskId, error: (err as Error).message });
  }
}
