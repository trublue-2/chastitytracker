import { auth } from "@/lib/auth";
import { assertKeyholderOrAdmin } from "@/lib/authGuards";
import { prisma } from "@/lib/prisma";
import { getTranslations } from "next-intl/server";
import { ClipboardList } from "lucide-react";
import EmptyState from "@/app/components/EmptyState";
import TaskCard from "@/app/components/TaskCard";
import WithdrawButton from "@/app/admin/WithdrawButton";
import { evaluateTasks, TASK_INCLUDE } from "@/lib/taskIntervals";
import { toTaskCard } from "@/lib/taskView";
import { isTaskOpen } from "@/lib/tasks";
import { APP_TZ } from "@/lib/utils";

/** Die Aufgaben-Historie eines Subs — ohne sie sähe der Keyholder im Web nie, ob eine gestellte
 *  Aufgabe erfüllt wurde. Zurückgezogene bleiben sichtbar: es sind seine eigenen Rückzüge, gleiche
 *  Regel wie in der Kontroll-Historie. */
export default async function AdminUserTasksPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  await assertKeyholderOrAdmin(id);
  const [t, ta] = await Promise.all([getTranslations("tasks"), getTranslations("admin")]);

  const user = await prisma.user.findUnique({ where: { id }, select: { timezone: true } });
  if (!user) return <div className="p-8 text-foreground-faint">{ta("userNotFound")}</div>;

  const now = new Date();
  const tasks = await prisma.task.findMany({
    where: { userId: id },
    orderBy: { holdUntil: "desc" },
    take: 100,
    include: TASK_INCLUDE,
  });
  const evaluated = await evaluateTasks(id, tasks, now, t("requirementKgLocked"));

  return (
    <div className="w-full max-w-2xl mx-auto px-4 py-6 flex flex-col gap-3">
      <h1 className="text-xl font-bold text-foreground">{t("historyTitle")}</h1>
      {evaluated.length === 0 ? (
        <EmptyState icon={<ClipboardList size={24} />} title={t("empty")} />
      ) : (
        evaluated.map((e) => (
          <TaskCard
            key={e.task.id}
            task={toTaskCard(e, false)}
            viewerTz={session?.user?.timezone ?? APP_TZ}
            subTz={user.timezone ?? APP_TZ}
            subLabel={ta("subTimePrefix")}
          >
            {isTaskOpen(e.evaluation.state) && (
              <WithdrawButton id={e.task.id} apiPath="/api/admin/tasks" title={t("withdraw")} showLabel colorToken="neutral" />
            )}
          </TaskCard>
        ))
      )}
    </div>
  );
}
