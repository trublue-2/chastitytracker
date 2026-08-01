import Link from "next/link";
import { auth } from "@/lib/auth";
import { assertKeyholderOrAdmin } from "@/lib/authGuards";
import { prisma } from "@/lib/prisma";
import { getTranslations } from "next-intl/server";
import { ClipboardList } from "lucide-react";
import Button from "@/app/components/Button";
import EmptyState from "@/app/components/EmptyState";
import TaskCard from "@/app/components/TaskCard";
import WithdrawButton from "@/app/admin/WithdrawButton";
import { evaluateTasks, TASK_INCLUDE } from "@/lib/taskIntervals";
import { toTaskCard } from "@/lib/taskView";
import { loadTaskProofViews } from "@/lib/taskIntervals";
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
  const evaluated = await evaluateTasks(id, tasks, now, { kgLabel: t("requirementKgLocked") });
  // Auch der Keyholder sieht die Nachweise — ohne Deep-Links (es sind nicht seine Formulare), aber
  // mit Beschreibung, Zustand und seiner eigenen Sichtungs-Anmerkung.
  const proofViews = await loadTaskProofViews(evaluated.map((e) => e.task.id));

  // Bewusst OHNE Kategorien-Gate: eine Aufgabe ist Text plus 0..n Bedingungen. „KG verschlossen"
  // kommt nicht aus den Kategorien, und eine reine Freitext-Aufgabe braucht überhaupt keine —
  // beides funktioniert mit leerer Kategorienliste. Ein Gate hätte hier nur weggesperrt, was geht.
  const newHref = `/admin/users/${id}/aktionen/aufgabe`;

  return (
    <>
      {/* Kein eigener Seitentitel und kein eigener Breiten-Wrapper: den Namen trägt der aktive Reiter,
          die Spaltenbreite und der Abstand kommen aus `admin/users/[id]/layout.tsx`. */}
      {/* Im Leer-Zustand trägt der Ruf-zur-Tat im EmptyState — zwei gleiche Knöpfe auf einem
          Bildschirm wären einer zu viel. */}
      {evaluated.length > 0 && (
        <div className="flex justify-end">
          <Link href={newHref}>
            <Button variant="primary" icon={<ClipboardList size={16} />}>{t("actionTitle")}</Button>
          </Link>
        </div>
      )}

      {evaluated.length === 0 ? (
        <EmptyState
          icon={<ClipboardList size={24} />}
          title={t("empty")}
          description={t("emptyHint")}
          action={{ label: t("actionTitle"), href: newHref }}
        />
      ) : (
        evaluated.map((e) => (
          <TaskCard
            key={e.task.id}
            task={toTaskCard(e, false, proofViews.get(e.task.id) ?? [])}
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
    </>
  );
}
