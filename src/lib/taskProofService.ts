import { prisma } from "@/lib/prisma";
import { serviceFail, type ServiceResult } from "@/lib/serviceResult";
import { verifyKontrolleCodeDetailed, type VerifyDetailedResult } from "@/lib/verifyCode";
import { structuredLog } from "@/lib/serverLog";
import { notifyUser } from "@/lib/notify";
import { getControllersOfUser } from "@/lib/keyholder";
import { evaluateTasks, TASK_INCLUDE } from "@/lib/taskIntervals";
import { isTaskResultFinal } from "@/lib/tasks";
import { settleTaskResult } from "@/lib/taskService";
import type { MessageActor } from "@/lib/messageService";

/**
 * Der Sub reicht ein gefordertes Nachweis-Foto ein (Issue #39, Etappe 3).
 *
 * Bewusst ein eigener Service und KEIN Eintrag über `POST /api/entries`: ein Nachweis ist kein
 * Tracker-Eintrag, er hat weder Paar-Partner noch Kategorie und hätte in Statistik und Zeitstrahl
 * nichts verloren. Derselbe Grund, aus dem `TaskProof` eine eigene Tabelle bekam.
 */

export interface SubmitProofParams {
  imageUrl: string;
  /** Aufnahmezeit aus den EXIF-Daten des Bildes. `null`, wenn das Bild keine trägt — dann ist die
   *  Reihenfolge nicht belegbar und der Nachweis geht zur Sichtung (siehe `evaluateProofs`). */
  imageExifTime: Date | null;
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
export async function runTaskProofVerification(proofId: string, imageUrl: string, code: string): Promise<void> {
  try {
    const result = await verifyKontrolleCodeDetailed(imageUrl, code);
    if (result === null || result.error) {
      structuredLog("taskProof", "verify_unavailable", { proofId, error: result?.error ?? "not_configured" });
    }
    await prisma.taskProof.update({ where: { id: proofId }, data: proofVerificationOutcome(result) });
  } catch (err) {
    // Nie werfen: der Nachweis IST eingereicht, und ein gescheiterter Prüflauf darf das nicht
    // rückgängig machen. Ohne Ergebnis bleibt er in der Sichtung — der sichere Ausgang.
    structuredLog("taskProof", "verify_failed", { proofId, error: (err as Error).message });
  }
}

export async function submitTaskProof(
  proofId: string,
  userId: string,
  p: SubmitProofParams,
): Promise<ServiceResult<{ taskId: string }>> {
  const proof = await prisma.taskProof.findFirst({
    // Besitz über die Aufgabe — ein Nachweis gehört niemandem für sich. `userId` ist Pflicht, nicht
    // optional: ein vergessener Besitz-Check wäre ein IDOR, den kein Typfehler auffängt.
    where: { id: proofId, task: { userId } },
    include: { task: { select: { id: true, withdrawnAt: true, holdUntil: true } } },
  });
  if (!proof) return serviceFail(404, "TASK_PROOF_NOT_FOUND");

  const blocked = proofSubmitBlockedReason(proof, new Date());
  if (blocked) return serviceFail(400, blocked);

  const now = new Date();
  // Zustand in der Where-Klausel: reicht der Sub parallel zweimal ein (Doppel-Tap, Offline-Replay),
  // trifft der zweite Aufruf null Zeilen statt den ersten zu überschreiben.
  const res = await prisma.taskProof.updateMany({
    where: { id: proofId, submittedAt: null },
    data: { imageUrl: p.imageUrl, imageExifTime: p.imageExifTime, submittedAt: now },
  });
  if (res.count === 0) return serviceFail(400, "TASK_PROOF_ALREADY_SUBMITTED");

  // Code-Prüfung erst NACH dem Speichern (siehe `runTaskProofVerification`). `proof.code` ist genau
  // dann gesetzt, wenn ein Code gefordert ist — `checkProofs` vergibt ihn nur dann.
  if (proof.code) void runTaskProofVerification(proofId, p.imageUrl, proof.code);

  return { ok: true, data: { taskId: proof.task.id } };
}

/** Was einer Einreichung im Weg steht — oder `null`, wenn sie zulässig ist.
 *
 *  Geteilt von der Formular-Seite (sie leitet aufs Dashboard um, statt ein Formular zu zeigen,
 *  dessen Absenden ohnehin scheitert) und dem Service (er hat das letzte Wort). Zwei unabhängig
 *  formulierte Bedingungsketten wären genau die Stelle, an der eine künftige fünfte Bedingung nur in
 *  einer der beiden landet. */
export function proofSubmitBlockedReason(
  proof: { submittedAt: Date | null; task: { withdrawnAt: Date | null; holdUntil: Date } },
  now: Date,
): "TASK_NOT_EDITABLE" | "TASK_PROOF_ALREADY_SUBMITTED" | "TASK_PROOF_TOO_LATE" | null {
  // `task.holdUntil` ist hier die ZEILE, im Dauer-Modus also das spätestmögliche Ende. Das ist
  // Absicht: die Schranke ist damit nie STRENGER als die Auswertung — sie weist nur ab, was auch
  // `evaluateProofs` sicher nicht mehr zählt. Sie hier auf das wirksame Ende zu verschärfen hiesse,
  // auf der Foto-Seite die gesamte Intervall-Rechnung des Subs zu laden, nur um eine Handvoll
  // Minuten früher „zu spät" zu sagen — für einen Nachweis, den die Auswertung ohnehin beurteilt.
  if (proof.task.withdrawnAt) return "TASK_NOT_EDITABLE";
  // Einmal eingereicht ist eingereicht. Ohne diese Schranke liesse sich ein beanstandetes oder
  // zeitlich unpassendes Foto beliebig oft durch ein besseres ersetzen — die Reihenfolge-Prüfung
  // wäre damit wertlos, weil man sie nachträglich zurechtlegen könnte.
  if (proof.submittedAt) return "TASK_PROOF_ALREADY_SUBMITTED";
  // Nach der Frist nehmen wir gar nicht erst an. `evaluateProofs` würde einen späten Nachweis ohnehin
  // nicht zählen — ihn trotzdem zu speichern hiesse, dem Sub ein Erfolgserlebnis zu geben, das keins
  // ist. Die klare Absage im Moment des Absendens ist ehrlicher.
  if (now > proof.task.holdUntil) return "TASK_PROOF_TOO_LATE";
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
  if (proof.task.withdrawnAt) return serviceFail(400, "TASK_NOT_EDITABLE");
  // Über einen Nachweis, den es noch gar nicht gibt, lässt sich nicht urteilen.
  if (!proof.submittedAt) return serviceFail(400, "TASK_PROOF_NOT_SUBMITTED");

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
    const rows = await prisma.task.findMany({ where: { id: taskId }, include: TASK_INCLUDE });
    const [evaluated] = await evaluateTasks(userId, rows, new Date());
    if (!evaluated) return;

    if (!isTaskResultFinal(evaluated.evaluation.state)) {
      await notifyUser(userId, {
        subjectKey: accepted ? "taskProofAcceptedSubject" : "taskProofRejectedSubject",
        messageKey: accepted ? "taskProofAcceptedMessage" : "taskProofRejectedMessage",
        params: { title },
        alwaysNotify: true,
        // Das URTEIL über den Nachweis ist die Entscheidung eines Menschen und nennt ihn. Anders als
        // die Ergebnis-Meldung darunter (`settleTaskResult`), die ein Befund der App ist.
        inbox: { ref: { type: "task", id: taskId }, actor },
      });
      return;
    }

    const [controllers, user] = await Promise.all([
      getControllersOfUser(userId),
      prisma.user.findUnique({ where: { id: userId }, select: { username: true } }),
    ]);
    // Derselbe Helfer, den der Poller benutzt — er stempelt auch, damit dieser nicht nachlegt.
    await settleTaskResult({
      userId, taskId, title,
      done: evaluated.evaluation.state === "done",
      controllers, username: user?.username ?? "", now: new Date(),
      // KEIN `once`: eine zweite Sichtung ist ein korrigiertes Urteil. Verschluckte der Posteingang
      // sie, bliebe nach „abgelehnt → doch angenommen" das falsche Ergebnis als letzte Zeile stehen.
      once: false,
    });
  } catch (err) {
    // Die Sichtung IST geschrieben — eine gescheiterte Meldung darf sie nicht mitreissen.
    structuredLog("taskProof", "review_notify_failed", { taskId, error: (err as Error).message });
  }
}
