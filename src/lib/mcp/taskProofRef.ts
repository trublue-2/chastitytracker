import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Löst „Aufgabe + Position" zu EINEM Nachweis auf — die gemeinsame Adressierung aller Werkzeuge,
 * die einen Nachweis ansprechen.
 *
 * Angesprochen über Position statt über die Nachweis-id: die id steht in keiner Lese-Sicht, die
 * Position ist genau das, was der Agent sieht („der zweite Nachweis"). Eine id zu verlangen, die er
 * sich nicht beschaffen kann, wäre ein Werkzeug ohne Eingang.
 *
 * Warum geteilt: Sichtung und Bildabruf versprechen dem Agenten dieselbe Adresse. Als zwei Kopien
 * — samt zweier gleichlautender Fehlertexte — hätten sie leise auseinanderlaufen können, sobald
 * einer die Zählweise ändert oder zurückgezogene Aufgaben anders behandelt.
 *
 * `proofSelect` bleibt beim Aufrufer: die Sichtung darf `imageUrl` und `code` NICHT laden (dieselbe
 * Regel wie `TASK_INCLUDE`), der Bildabruf braucht `imageUrl` und darf `code` ebenso wenig sehen.
 * Ein gemeinsames, breiteres Select hätte beiden mehr gegeben, als sie dürfen.
 */
export async function resolveTaskProof<S extends Prisma.TaskProofSelect>(
  userId: string,
  taskId: string,
  index: number,
  proofSelect: S,
): Promise<{
  task: { id: string; title: string; withdrawnAt: Date | null };
  proof: Prisma.TaskProofGetPayload<{ select: S }>;
}> {
  // `userId` in der Bedingung statt als Prüfung danach: eine fremde Aufgabe ist damit von einer
  // nicht existierenden ununterscheidbar — die Fehlermeldung verrät nicht, dass es sie gibt.
  const task = await prisma.task.findFirst({
    where: { id: taskId, userId },
    select: {
      id: true,
      title: true,
      withdrawnAt: true,
      proofs: { orderBy: { sortOrder: "asc" }, select: proofSelect },
    },
  });
  // Auflösung, nicht Zustand: eine unbekannte id ist keine Vorschau wert.
  if (!task) throw new Error(`Task not found: ${taskId}`);

  const proof = task.proofs[index - 1];
  if (!proof) {
    throw new Error(`Task "${task.title}" has ${task.proofs.length} proof(s); index ${index} does not exist.`);
  }
  // Der Cast trägt nur die generische Select-Form weiter; Prisma leitet sie über die verschachtelte
  // Relation nicht selbst durch.
  return { task, proof: proof as Prisma.TaskProofGetPayload<{ select: S }> };
}
