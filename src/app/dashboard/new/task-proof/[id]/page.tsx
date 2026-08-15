import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import TaskProofFormCore from "@/app/entries/TaskProofFormCore";
import { proofSubmitBlockedReason } from "@/lib/taskProofService";
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

  const proof = await prisma.taskProof.findFirst({
    where: { id, task: { userId: session.user.id } },
    include: {
      task: {
        // `createdAt`/`wirksamAb` sind der Nullpunkt, an dem die eigene Fälligkeit dieses Nachweises
        // hängt — die Seite braucht sie für dieselbe Schranke wie der Dienst UND für die Anzeige.
        select: {
          title: true, withdrawnAt: true, holdUntil: true, proofOrderMatters: true,
          createdAt: true, wirksamAb: true,
        },
      },
    },
  });

  // Nicht vorhanden, fremd, zurückgezogen, bereits eingereicht oder verfristet: zurück aufs
  // Dashboard, statt ein Formular zu zeigen, dessen Absenden der Service ohnehin abweist. Kein
  // Unterschied zwischen „gibt es nicht" und „gehört dir nicht" — sonst verriete die Seite, dass
  // eine fremde Aufgabe existiert.
  if (!proof || proofSubmitBlockedReason(proof, new Date())) {
    redirect("/dashboard");
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { mobileDesktopUpload: true },
  });

  return (
    <TaskProofFormCore
      proofId={proof.id}
      description={proof.description}
      code={proof.code}
      taskTitle={proof.task.title}
      orderMatters={proof.task.proofOrderMatters}
      // Nur die EIGENE Fälligkeit: wo der Nachweis bis zum Ende der Aufgabe offen ist, steht die
      // Frist bereits auf der Karte, von der er hierher kam.
      //
      // Gedeckelt auf die SPALTE `holdUntil`, nicht auf das wirksame Ende — dieselbe Wahl wie in
      // `proofSubmitBlockedReason` und aus demselben Grund: das wirksame Ende gäbe es nur mit der
      // ganzen Intervall-Rechnung des Trägers, und diese Seite würde dafür seine gesamte
      // Trage-Historie paaren, um eine Handvoll Minuten genauer zu sein.
      dueAt={ownProofDeadline(proof, proof.task, proof.task.holdUntil)?.toISOString() ?? null}
      tz={session.user.timezone ?? APP_TZ}
      mobileDesktopMode={user?.mobileDesktopUpload ?? false}
    />
  );
}
