"use client";

import { useTranslations } from "next-intl";
import TaskCard from "@/app/components/TaskCard";
import ProofReviewActions from "@/app/admin/tasks/ProofReviewActions";
import WithdrawButton from "@/app/admin/WithdrawButton";
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
  viewerTz,
  subTz,
}: {
  task: TaskCardData;
  /** Zeitzone des Keyholders. */
  viewerTz: string;
  /** Zeitzone des Subs — Fristen stehen in beiden, wenn sie auseinanderfallen. */
  subTz: string;
}) {
  const t = useTranslations("tasks");
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
        <WithdrawButton id={task.id} apiPath="/api/admin/tasks" title={t("withdraw")} showLabel colorToken="neutral" />
      )}
    </TaskCard>
  );
}
