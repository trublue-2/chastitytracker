import { redirect } from "next/navigation";
import { getMobileDesktopMode } from "@/lib/queries";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import TaskProofFormCore from "@/app/entries/TaskProofFormCore";
import { ownProofWhere, proofSubmitContext } from "@/lib/taskProofService";
import { proofDue } from "@/lib/tasks";
import { APP_TZ } from "@/lib/utils";
import { EntryActionFormShell } from "@/app/components/AdminActionFormShell";
import { actionSign } from "@/app/entries/actionSign";
import { getTranslations } from "next-intl/server";

/**
 * Aufnahme-Seite für EIN gefordertes Nachweis-Foto (Issue #39, Etappe 3).
 *
 * Der Zugriffs-Check sitzt hier UND im Service. Das ist keine doppelte Arbeit aus Bequemlichkeit:
 * die Seite muss die Zeile ohnehin laden (sie zeigt Beschreibung und Code), und ohne die Prüfung
 * wäre genau dieser Ladevorgang der Weg, den Code einer fremden — oder einer noch nicht
 * zugestellten — Aufgabe zu lesen. Formuliert ist er trotzdem nur einmal: `ownProofWhere`.
 */
export default async function TaskProofPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const { id } = await params;

  const now = new Date();
  // Beide Abfragen hängen nur an der Session, keine an der anderen — und die Schranke darunter kann
  // im Dauer-Modus eine ganze Auswertung kosten. Nacheinander wartete die Einstellung des Trägers
  // hinter ihr, für nichts.
  const [proof, mobileDesktopMode] = await Promise.all([
    prisma.taskProof.findFirst({
      where: ownProofWhere(id, session.user.id),
      include: {
        task: {
          // `createdAt`/`wirksamAb` sind der Nullpunkt, an dem die eigene Fälligkeit dieses
          // Nachweises hängt — die Seite braucht sie für die Anzeige. `id`/`holdDurationMin` gehören
          // zur Schranke: sie misst gegen das WIRKSAME Ende der Aufgabe (siehe `proofSubmitContext`).
          select: {
            id: true, title: true, withdrawnAt: true, holdUntil: true, holdDurationMin: true,
            proofOrderMatters: true, createdAt: true, wirksamAb: true,
          },
        },
      },
    }),
    getMobileDesktopMode(session.user.id),
  ]);

  // Nicht vorhanden, fremd, zurückgezogen, bereits eingereicht oder nach dem Ende der Aufgabe:
  // zurück aufs Dashboard, statt ein Formular zu zeigen, dessen Absenden der Service ohnehin
  // abweist. Kein Unterschied zwischen „gibt es nicht" und „gehört dir nicht" — sonst verriete die
  // Seite, dass eine fremde Aufgabe existiert.
  //
  // Eine verstrichene EIGENE Frist des Nachweises leitet NICHT mehr um: verspätet einreichen ist
  // erlaubt, die Keyholderin entscheidet (siehe `proofSubmitBlockedReason`).
  if (!proof) redirect("/dashboard");
  const window = await proofSubmitContext(proof, session.user.id, now);
  if (window.blocked) redirect("/dashboard");

  // Die Fälligkeit, einmal aufgelöst: die eigene, sonst das WIRKSAME Ende der Aufgabe — aus derselben
  // Auswertung, gegen die die Schranke oben geprüft hat (im Dauer-Modus wäre die Spalte bis zu einer
  // Kulanzfrist zu spät). Sie steht im Formular UND entscheidet, ob es den Verspätungs-Hinweis trägt.
  const due = proofDue(proof, proof.task, window.end);

  const [tTasks] = await Promise.all([getTranslations("tasks")]);

  return (
    // Die elfte Erfassungs-Seite. Sie stand als einzige noch nackt da: kein Rücklink, kein Titel
    // und damit — nach der Begradigung der übrigen zehn — die letzte Seite unter `/dashboard/new/`
    // ohne Hauptbereichs-Landmarke. Wer die Nachweis-Meldung antippte, landete auf einem Bildschirm
    // ohne Überschrift und ohne Angabe, wo er ist.
    <EntryActionFormShell
      {...actionSign("TASK")}
      title={tTasks("proofsLabel")}
    >
    <TaskProofFormCore
      proofId={proof.id}
      description={proof.description}
      requiresPhoto={proof.requiresPhoto}
      requiresText={proof.requiresText}
      code={proof.code}
      taskTitle={proof.task.title}
      orderMatters={proof.task.proofOrderMatters}
      dueAt={due.at.toISOString()}
      dueProvisional={due.provisional}
      // Er ist SPÄT dran und weiss es aus der Karte — das Formular darf es nicht verschweigen,
      // sonst führt der ruhige Frist-Satz oben in ein falsches Sicherheitsgefühl.
      //
      // `>=` wie in der Auswertung (`overdueProofsAt`): mit `>` wäre die Zeile im Moment des
      // Fristablaufs auf der Karte überfällig und hier ruhig — dieselbe Sekunde, zwei Auskünfte.
      late={!due.provisional && now >= due.at}
      tz={session.user.timezone ?? APP_TZ}
      // Nachbessern nach Ablehnung: bisherigen Text vorbefüllen (ergänzen statt leer beginnen) und die
      // Begründung mitgeben. `reviewAccepted === false` ist genau der abgelehnte Zustand — bei einer
      // Erst-Einreichung sind beide leer/undefined.
      initialText={proof.proofText ?? undefined}
      rejectionNote={proof.reviewAccepted === false ? (proof.reviewNote ?? "") : undefined}
      mobileDesktopMode={mobileDesktopMode}
    />
    </EntryActionFormShell>
  );
}
