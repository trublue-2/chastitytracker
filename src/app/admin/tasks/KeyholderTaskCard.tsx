"use client";

import Link from "next/link";
import { Pencil } from "lucide-react";
import { useTranslations } from "next-intl";
import TaskCard from "@/app/components/TaskCard";
import Button from "@/app/components/Button";
import ProofReviewActions from "@/app/admin/tasks/ProofReviewActions";
import WithdrawButton from "@/app/admin/WithdrawButton";
import DeleteTaskButton from "@/app/admin/tasks/DeleteTaskButton";
import { isTaskOpen, needsKeyholderReview } from "@/lib/tasks";
import type { TaskCardData } from "@/lib/taskView";

/**
 * Eine Aufgabe, wie der Keyholder sie sieht — Karte plus das, was er daran tun kann.
 *
 * Geteilt von seinem Aufgaben-Reiter und seiner Übersicht. Als die beiden Stellen die Karte je
 * selbst zusammensetzten, war die Übersicht eine Sackgasse: dort stand „warten auf Sichtung" ohne
 * den einzigen Knopf, der da herausführt. Zwei Zusammensetzungen desselben Objekts driften genau so
 * auseinander.
 */
export default function KeyholderTaskCard({
  task,
  userId,
  viewerTz,
  subTz,
}: {
  task: TaskCardData;
  /** Der Träger — für den „Bearbeiten"-Link. */
  userId: string;
  /** Zeitzone des Keyholders. */
  viewerTz: string;
  /** Zeitzone des Subs — Fristen stehen in beiden, wenn sie auseinanderfallen. */
  subTz: string;
}) {
  const t = useTranslations("tasks");
  const ts = useTranslations("taskSeries");
  const ta = useTranslations("admin");

  return (
    <TaskCard task={task} viewerTz={viewerTz} subTz={subTz} subLabel={ta("subTimePrefix")}>
      {/* Die Sichtung steht an der Karte, nicht hinter einer weiteren Seite: sie ist der einzige
          Ausweg aus `awaitingReview`, und dort liegt auch das Foto, über das geurteilt wird. */}
      <ProofReviewActions
        proofs={task.proofs}
        tz={viewerTz}
        awaitingReview={needsKeyholderReview(task.state)}
      />
      {isTaskOpen(task.state) && (
        <div className="flex items-center gap-1">
          <Link href={`/admin/users/${userId}/aktionen/aufgabe?editTask=${task.id}`}>
            <Button variant="ghost" icon={<Pencil size={15} />}>{ts("edit")}</Button>
          </Link>
          <WithdrawButton id={task.id} apiPath="/api/admin/tasks" title={t("withdraw")} showLabel colorToken="neutral" />
        </div>
      )}
      {/* Was NACH dem Rückzug an dieser Karte übrigbleibt. Die beiden schliessen einander aus: was
          offen ist, wird zurückgezogen, was zurückgezogen ist, kann weg. Nur hier — eine erledigte
          oder versäumte Aufgabe ist ein Urteil über den Träger und bleibt in seiner Historie. */}
      {task.state === "withdrawn" && <DeleteTaskButton id={task.id} />}
    </TaskCard>
  );
}
