import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import TaskProofFormCore from "@/app/entries/TaskProofFormCore";
import { proofSubmitBlocked } from "@/lib/taskProofService";
import { ownProofDeadline } from "@/lib/tasks";
import { APP_TZ } from "@/lib/utils";

/**
 * Aufnahme-Seite für EIN gefordertes Nachweis-Foto (Issue #39, Etappe 3).
 *
 * Der Besitz-Check sitzt hier UND im Service. Das ist keine doppelte Arbeit aus Bequemlichkeit: die
 * Seite muss die Zeile ohnehin laden (sie zeigt Beschreibung und Code), und ohne die Prüfung wäre
 * genau dieser Ladevorgang der Weg, den Code einer fremden Aufgabe zu lesen.
 */
export default async function TaskProofPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const { id } = await params;

  const now = new Date();
  // Beide Abfragen hängen nur an der Session, keine an der anderen — und die Schranke darunter kann
  // im Dauer-Modus eine ganze Auswertung kosten. Nacheinander wartete die Einstellung des Trägers
  // hinter ihr, für nichts.
  const [proof, user] = await Promise.all([
    prisma.taskProof.findFirst({
      where: { id, task: { userId: session.user.id } },
      include: {
        task: {
          // `createdAt`/`wirksamAb` sind der Nullpunkt, an dem die eigene Fälligkeit dieses
          // Nachweises hängt — die Seite braucht sie für die Anzeige. `id`/`holdDurationMin` gehören
          // zur Schranke: sie misst gegen das WIRKSAME Ende der Aufgabe (siehe `proofSubmitBlocked`).
          select: {
            id: true, title: true, withdrawnAt: true, holdUntil: true, holdDurationMin: true,
            proofOrderMatters: true, createdAt: true, wirksamAb: true,
          },
        },
      },
    }),
    prisma.user.findUnique({ where: { id: session.user.id }, select: { mobileDesktopUpload: true } }),
  ]);

  // Nicht vorhanden, fremd, zurückgezogen, bereits eingereicht oder nach dem Ende der Aufgabe:
  // zurück aufs Dashboard, statt ein Formular zu zeigen, dessen Absenden der Service ohnehin
  // abweist. Kein Unterschied zwischen „gibt es nicht" und „gehört dir nicht" — sonst verriete die
  // Seite, dass eine fremde Aufgabe existiert.
  //
  // Eine verstrichene EIGENE Frist des Nachweises leitet NICHT mehr um: verspätet einreichen ist
  // erlaubt, die Keyholderin entscheidet (siehe `proofSubmitBlockedReason`).
  if (!proof || await proofSubmitBlocked(proof, session.user.id, now)) {
    redirect("/dashboard");
  }

  // Die eigene Fälligkeit, einmal aufgelöst: sie steht im Formular UND entscheidet, ob es den
  // Verspätungs-Hinweis trägt.
  //
  // Gedeckelt auf die SPALTE `holdUntil`, während die Karte gegen das WIRKSAME Ende deckelt. Der
  // Deckel greift hier praktisch nie: der Dienst weist eine Nachweis-Frist ab, die hinter dem
  // FRÜHESTMÖGLICHEN Ende läge (`TASK_PROOF_DUE_AFTER_END`), und das liegt nie nach dem wirksamen.
  // Auseinander gehen die beiden nur, wenn die Frist der Aufgabe nachträglich verkürzt wurde — und
  // dann hat die Schranke oben ohnehin schon entschieden, ob diese Seite überhaupt aufgeht.
  const dueAt = ownProofDeadline(proof, proof.task, proof.task.holdUntil);

  return (
    <TaskProofFormCore
      proofId={proof.id}
      description={proof.description}
      code={proof.code}
      taskTitle={proof.task.title}
      orderMatters={proof.task.proofOrderMatters}
      // Nur die EIGENE Fälligkeit: wo der Nachweis bis zum Ende der Aufgabe offen ist, steht die
      // Frist bereits auf der Karte, von der er hierher kam.
      dueAt={dueAt?.toISOString() ?? null}
      // Er ist SPÄT dran und weiss es aus der Karte — das Formular darf es nicht verschweigen,
      // sonst führt der ruhige Frist-Satz oben in ein falsches Sicherheitsgefühl.
      //
      // `>=` wie in der Auswertung (`overdueProofsAt`): mit `>` wäre die Zeile im Moment des
      // Fristablaufs auf der Karte überfällig und hier ruhig — dieselbe Sekunde, zwei Auskünfte.
      late={dueAt !== null && now >= dueAt}
      tz={session.user.timezone ?? APP_TZ}
      mobileDesktopMode={user?.mobileDesktopUpload ?? false}
    />
  );
}
