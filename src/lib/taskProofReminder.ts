import { prisma } from "@/lib/prisma";
import { evaluateTasks, TASK_INCLUDE, SUB_VISIBLE_WHERE } from "@/lib/taskIntervals";
import { NOT_PAUSED_WHERE } from "@/lib/healthHold";
import { earliestTaskEnd, isTaskOpen, proofDue, taskAnchor, type TaskEvaluation, type TaskLike } from "@/lib/tasks";
import { notifyUser } from "@/lib/notify";
import { formatDateTime, groupByUser } from "@/lib/utils";
import { TASK_PROOF_REMINDER_LEAD_MIN } from "@/lib/constants";

/** Was die Erinnerung an einem Nachweis liest — die Felder, die `TASK_INCLUDE` ohnehin lädt. */
interface OpenProof {
  id: string;
  submittedAt: Date | null;
  dueOffsetMin?: number | null;
}

/**
 * Kann ein offener Nachweis dieser Aufgabe bis `horizon` fällig werden? Nur aus der Zeile, VOR der
 * Auswertung.
 *
 * Die Fälligkeit liegt zwischen dem frühestmöglichen und dem spätestmöglichen Ende (bzw. der eigenen
 * Frist, wo sie früher liegt); im klassischen Modus fallen beide zusammen. Ohne diese Vorprüfung ginge
 * jede Aufgabe mit einem Nachweis jede Minute durch die Intervall-Rechnung — auch eine, deren Frist
 * erst in drei Tagen liegt.
 */
export function mayBeDueWithin(
  task: Pick<TaskLike, "createdAt" | "wirksamAb" | "holdUntil" | "holdDurationMin"> & { proofs: readonly OpenProof[] },
  now: Date,
  horizon: Date,
): boolean {
  const anchor = taskAnchor(task).getTime();
  const earliestEnd = earliestTaskEnd(task, taskAnchor(task)).getTime();
  return task.proofs.some((p) => {
    if (p.submittedAt !== null) return false;
    const own = p.dueOffsetMin != null ? anchor + p.dueOffsetMin * 60_000 : Infinity;
    return Math.min(own, earliestEnd) <= horizon.getTime() && Math.min(own, task.holdUntil.getTime()) > now.getTime();
  });
}

/**
 * Welcher offene Nachweis dieser ausgewerteten Aufgabe als nächstes fällig wird — und wann. `null`, wo
 * keiner mehr eine Frist vor sich hat.
 *
 * Offen heisst: nichts eingereicht. Ein abgelehnter Nachweis ist eingereicht und hat seine Ablehnung
 * schon gemeldet bekommen. Übersprungen wird eine VORLÄUFIGE Frist (Dauer-Modus vor dem Beginn — sie
 * entsteht erst mit dem Anlegen) und eine VERSTRICHENE: dazu gibt es nichts mehr zu erinnern, und sie
 * darf die Erinnerung an einen späteren Nachweis nicht verstellen.
 */
export function nextDueProof<P extends OpenProof>(
  proofs: readonly P[],
  task: Pick<TaskLike, "createdAt" | "wirksamAb" | "holdDurationMin">,
  evaluation: Pick<TaskEvaluation, "holdUntil" | "startedAt">,
  now: Date,
): { proof: P; due: Date } | null {
  let next: { proof: P; due: Date } | null = null;
  for (const p of proofs) {
    if (p.submittedAt !== null) continue;
    const due = proofDue(p, task, evaluation);
    if (due.provisional || due.at <= now) continue;
    if (!next || due.at < next.due) next = { proof: p, due: due.at };
  }
  return next;
}

/**
 * Erinnert den Träger kurz vor einer Nachweis-Frist, wenn noch nichts eingereicht ist — einmal je
 * Aufgabe, {@link TASK_PROOF_REMINDER_LEAD_MIN} Minuten vorher. Sonst erfuhr er von einem vergessenen
 * Foto erst durch das Vergehen.
 *
 * Läuft im Minuten-Tick. Gestempelt wird VOR dem Versand, anders als bei der Ergebnismeldung: eine
 * Erinnerung, die bei einem Absturz ausfällt, ist das kleinere Übel als eine doppelte — und der
 * Stempel über `updateMany` mit `proofReminderSentAt: null` ist zugleich die Einmal-Zusage, falls
 * zwei Ticks überlappen.
 */
export async function remindDueProofs(now: Date): Promise<void> {
  const horizon = new Date(now.getTime() + TASK_PROOF_REMINDER_LEAD_MIN * 60_000);
  // Vorauswahl über die Spalte: sie ist die obere Schranke jedes wirksamen Endes, und jede
  // Nachweis-Frist liegt davor. Was hier durchfällt, ist entweder vorbei oder hat nichts Offenes.
  const candidates = await prisma.task.findMany({
    where: {
      withdrawnAt: null, completedAt: null, resultNotifiedAt: null, proofReminderSentAt: null,
      holdUntil: { gt: now },
      proofs: { some: { submittedAt: null } },
      ...SUB_VISIBLE_WHERE, ...NOT_PAUSED_WHERE,
    },
    orderBy: { holdUntil: "asc" },
    take: 50,
    include: TASK_INCLUDE,
  });
  const due = candidates.filter((t) => mayBeDueWithin(t, now, horizon));
  if (due.length === 0) return;

  for (const [userId, tasks] of groupByUser(due)) {
    try {
      for (const e of await evaluateTasks(userId, tasks, now)) {
        if (!isTaskOpen(e.evaluation.state)) continue;
        const next = nextDueProof(e.task.proofs, e.task, e.evaluation, now);
        if (!next || next.due > horizon) continue;

        const stamped = await prisma.task.updateMany({
          where: { id: e.task.id, proofReminderSentAt: null },
          data: { proofReminderSentAt: now },
        });
        if (stamped.count === 0) continue;

        // Die Beschreibung nur für DIESEN Nachweis nachladen: `TASK_INCLUDE` lässt sie bewusst weg
        // (Anzeige-Feld, auf dem Minuten-Tick sonst für jede Aufgabe mitgeladen).
        const shown = await prisma.taskProof.findUnique({ where: { id: next.proof.id }, select: { description: true } });
        await notifyUser(userId, {
          subjectKey: "taskProofReminderSubject",
          messageKey: "taskProofReminderMessage",
          params: { title: e.task.title, description: shown?.description ?? "", until: formatDateTime(next.due) },
          inbox: { ref: { type: "task", id: e.task.id } },
        });
      }
    } catch (err) {
      console.error(`[remindDueProofs] Erinnerung fehlgeschlagen (${userId}):`, (err as Error).message);
    }
  }
}
