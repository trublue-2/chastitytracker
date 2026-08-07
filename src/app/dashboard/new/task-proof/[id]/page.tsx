import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import TaskProofFormCore from "@/app/entries/TaskProofFormCore";
import { proofSubmitBlockedReason } from "@/lib/taskProofService";

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
    include: { task: { select: { title: true, withdrawnAt: true, holdUntil: true } } },
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
      mobileDesktopMode={user?.mobileDesktopUpload ?? false}
    />
  );
}
