import { prisma } from "@/lib/prisma";
import { structuredLog } from "@/lib/serverLog";
import { notifyControllers } from "@/lib/notify";
import { getEventChannels, type NotificationChannels } from "@/lib/notificationPrefs";
import { getControllerAudience, type Controller } from "@/lib/keyholder";
import { proofSubmittedLate, type TaskLike, type ProofLike } from "@/lib/tasks";

/**
 * Die Meldung „ein verspäteter Nachweis wartet auf dein Urteil" — und die beiden Stellen, an denen
 * eine Verspätung entstehen kann.
 *
 * EIGENES MODUL, nicht bei `taskProofService`: die zweite Stelle ist die ÄNDERUNG der Aufgabe, und
 * die liegt in `taskService`. Der Nachweis-Dienst hängt bereits an ihm (`settleTaskResult`) — läge
 * die Meldung dort, hingen beide Dienste gegenseitig aneinander. Sie braucht von keinem der beiden
 * etwas, also steht sie darunter.
 *
 * Warum die Schwester-Meldung `notifyProofReviewed` NICHT mit hierher gezogen ist, obwohl der Name
 * es nahelegt: sie ruft `settleTaskResult` und brächte damit genau den Zyklus zurück, den dieses
 * Modul auflöst. Sie bleibt deshalb im Dienst, bei dem Vorgang, den sie abschliesst.
 *
 * Was diese Datei nicht kennt, ist Absicht: sie schreibt nichts an der Aufgabe und urteilt nicht.
 * Ob ein Nachweis zu spät kam, beantwortet {@link proofSubmittedLate} — dieselbe Funktion, die auch
 * die Auswertung stellt.
 */

/** Die Aufgabe, an der eine Nachweis-Frist hängt — Nullpunkt und obere Schranke über `Pick`, nicht
 *  abgeschrieben: `wirksamAb` trägt dort die Bedeutung „wie bisher", und eine Kopie nähme sie nicht
 *  mit. `title` ist der Meldungstext, `id` der Bezug der Posteingangs-Zeile. */
interface LateProofTask extends Pick<TaskLike, "createdAt" | "wirksamAb" | "holdUntil"> {
  id: string;
  title: string;
}

/** Ein Nachweis, so weit die Meldung ihn braucht — dieselbe Zeilenform wie in der Auswertung. */
type LateProofRow = Pick<ProofLike, "dueOffsetMin" | "submittedAt"> & {
  id: string;
  lateNotifiedAt: Date | null;
};

/**
 * Was jede dieser Meldungen braucht und was AN DER PERSON hängt, nicht am einzelnen Nachweis.
 *
 * Als Parameter, weil der Sweep sonst je Nachweis dieselben fünf Abfragen wiederholte — bei drei
 * verspäteten Fotos fünfzehn Reads, von denen zehn dieselbe Antwort geben. Dasselbe Muster, mit dem
 * `processDueTasks` die Empfänger einmal je Nutzer holt statt einmal je Aufgabe. Fehlt der Kontext
 * (Einreiche-Weg: genau ein Nachweis), lädt {@link notifyLateProof} ihn selbst.
 */
interface LateProofAudience {
  controllers: Controller[];
  username: string;
  channels: NotificationChannels;
}

async function lateProofAudience(userId: string): Promise<LateProofAudience> {
  const [audience, channels] = await Promise.all([
    getControllerAudience(userId),
    getEventChannels(userId, "TASK_PROOF_LATE"),
  ]);
  return { ...audience, channels };
}

/**
 * Meldet der Keyholderin, dass ein VERSPÄTETER Nachweis auf ihr Urteil wartet.
 *
 * WARUM ES DIESEN WEG BRAUCHT. Seit der Träger nach der Frist eines Nachweises noch hochladen darf,
 * hängt der ganze Sinn dieser Kulanz an ihrem Urteil: ein verspätetes Foto zählt nur, wenn sie es
 * annimmt (`proofCounted`). Die vorhandene „bitte sichten"-Meldung des Minuten-Ticks erreicht sie
 * dabei nie — die hängt am Zustand `awaitingReview`, und ein verspäteter Nachweis kommt dort gar
 * nicht an: er zählt nicht, also ist die Nachweis-Achse `failed` und die Aufgabe `missed`. Ohne
 * diese Meldung erführe sie vom Foto erst zum Ende der Aufgabe, und dann als „versäumt" — zu spät,
 * um es noch anzunehmen. Das Feature wäre gebaut und funktionslos.
 *
 * FORM WIE DIE NACHBARIN: dieselbe eine Posteingangs-Zeile für alle Keyholder plus Mail/Push je
 * Empfänger (`notifyControllers`), derselbe Bezug auf die AUFGABE — dorthin führt der Weg zur
 * Sichtung — und kein `actor`: dass ein Foto zu spät kam, ist ein Befund der App, kein Entschluss
 * eines Menschen.
 *
 * ABSCHALTBAR, ABER NICHT VERSCHLUCKBAR. Mail und Push hängen am Schalter `TASK_PROOF_LATE` im
 * Raster der Benutzer-Einstellungen; die Posteingangs-Zeile schreibt `notifyControllers` in jedem
 * Fall. Das ist die Regel des Hauses („der Kanal wird leiser, ohne dass Information verloren geht")
 * und hier zusätzlich eine Schutzmassnahme: ein umgelegter Schalter darf die einzige Spur eines
 * wartenden Fotos nicht tilgen.
 *
 * GENAU EINMAL JE NACHWEIS, über `lateNotifiedAt` an der Zeile. Nicht über den abgeleiteten Zustand
 * und nicht über `once` an der Nachricht: `once` deduplizierte über die AUFGABE, und eine Aufgabe mit
 * drei Nachweisen bekäme für den zweiten und dritten keine Meldung mehr, obwohl jeder sein eigenes
 * Urteil braucht. Gestempelt wird NACH dem Versand — schlägt er fehl, bleibt die Spalte leer, statt
 * eine Meldung als erledigt auszuweisen, die nie ankam.
 *
 * WIRFT NIE: der Nachweis IST eingereicht. Eine gescheiterte Meldung darf die Einreichung nicht
 * mitreissen — dieselbe Zusage wie bei `notifyProofReviewed`.
 *
 * Den RÜCKZUG prüft sie nicht: eine zurückgezogene Aufgabe nimmt gar nichts mehr an
 * (`proofSubmitBlockedReason`), und auf dem Einreiche-Weg folgt diese Meldung ausschliesslich auf
 * eine geglückte Einreichung. Auf dem Änderungs-Weg deckt ihn die Where-Klausel von `updateTask` ab
 * — eine zurückgezogene Aufgabe lässt sich gar nicht mehr ändern.
 */
export async function notifyLateProof(
  proof: LateProofRow & { task: LateProofTask },
  userId: string,
  /** Einmal geladen vom Sweep; fehlt er, holt diese Funktion ihn selbst. */
  audience?: LateProofAudience,
): Promise<void> {
  try {
    if (proof.lateNotifiedAt) return;
    // Gegen die SPALTE `holdUntil` gemessen, wie `evaluateProofs` es tut: die Meldung soll genau die
    // Nachweise treffen, die dort nicht zählen. Ein Nachweis ohne eigene Fälligkeit kann auf dem
    // EINREICHE-Weg nie verspätet sein — nach dem Ende der Aufgabe wird gar nichts mehr angenommen.
    if (!proofSubmittedLate(proof, proof.task, proof.task.holdUntil)) return;

    const { controllers, username, channels } = audience ?? await lateProofAudience(userId);

    await notifyControllers(userId, controllers, {
      subjectKey: "taskProofLateSubjectKeyholder",
      messageKey: "taskProofLateMessageKeyholder",
      params: { username, title: proof.task.title },
      channels,
      inbox: { ref: { type: "task", id: proof.task.id } },
    });
    await prisma.taskProof.update({ where: { id: proof.id }, data: { lateNotifiedAt: new Date() } });
  } catch (err) {
    structuredLog("taskProof", "late_notify_failed", { proofId: proof.id, error: (err as Error).message });
  }
}

/**
 * Dieselbe Meldung für die Nachweise, die durch eine VERSCHOBENE Frist verspätet geworden sind —
 * der zweite Weg zur Verspätung, und bis hierher der unbemerkte.
 *
 * Der erste ist ein Foto, das nach seiner Frist hochgeladen wird (`submitTaskProof`); dieser hier
 * ist eine Frist, die nach vorn rückt und ein längst eingereichtes Foto rückwirkend zu spät macht.
 * Für die Keyholderin ist der Ausgang derselbe — ein Nachweis, der nur noch über ihre Annahme
 * zählt —, also ist auch die Meldung dieselbe. Ohne sie fiele der Nachweis still, und zwar durch
 * ihre eigene Änderung.
 *
 * NUR BEIM VORRÜCKEN aufzurufen: `dueOffsetMin` und der Nullpunkt der Aufgabe sind über
 * `mergeTaskPatch` nicht änderbar, also ist das Ende der einzige bewegliche Teil einer
 * Nachweis-Frist — rückt es nach hinten, kann kein eingereichter Nachweis neu zu spät sein. Die
 * Entscheidung trifft der Aufrufer, weil nur er den alten Wert noch hat.
 *
 * Ein Nachweis, der schon gemeldet ist, bleibt es: die Auswahl kennt `lateNotifiedAt: null`, und
 * {@link notifyLateProof} prüft den Stempel ein zweites Mal. Wandert die Frist zurück und wieder
 * nach vorn, kommt also keine zweite Meldung — die Zusage „genau einmal je Nachweis" gilt über beide
 * Wege hinweg.
 *
 * WIRFT NIE, aus demselben Grund wie oben: die Änderung der Aufgabe IST geschrieben.
 */
export async function notifyLateProofsForTask(task: LateProofTask, userId: string): Promise<void> {
  try {
    const proofs = await prisma.taskProof.findMany({
      where: { taskId: task.id, submittedAt: { not: null }, lateNotifiedAt: null },
      select: { id: true, dueOffsetMin: true, submittedAt: true, lateNotifiedAt: true },
    });
    // Erst aussieben, dann laden: der häufige Ausgang ist „keiner betroffen" (die Frist rückte vor,
    // aber über alle Nachweise hinweg), und dafür soll niemand Empfänger und Schalter holen.
    const late = proofs.filter((p) => proofSubmittedLate(p, task, task.holdUntil));
    if (late.length === 0) return;

    // Der Kontext EINMAL — er hängt am Träger, nicht am Nachweis (siehe {@link LateProofAudience}).
    const audience = await lateProofAudience(userId);
    // Nacheinander: hinter jedem Durchlauf steht ein SMTP-Versand je Empfänger, und die Aufgabe hat
    // höchstens eine Handvoll Nachweise. Ein `Promise.all` gewänne nichts und schickte einen Schwall.
    for (const p of late) await notifyLateProof({ ...p, task }, userId, audience);
  } catch (err) {
    // Fängt das Laden — der Versand darunter trägt seine Nie-werfen-Zusage selbst.
    structuredLog("taskProof", "late_notify_sweep_failed", { taskId: task.id, error: (err as Error).message });
  }
}
