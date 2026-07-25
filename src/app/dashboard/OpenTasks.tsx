"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import DashboardBlock from "@/app/components/DashboardBlock";
import TaskCard from "@/app/components/TaskCard";
import ExpandToggle from "@/app/components/ExpandToggle";
import Button from "@/app/components/Button";
import useToast from "@/app/hooks/useToast";
import useOfflineQueue from "@/app/hooks/useOfflineQueue";
import { parseApiErrorCode } from "@/lib/apiClient";
import { useApiError } from "@/app/hooks/useApiError";
import { isTaskOpen } from "@/lib/tasks";
import type { TaskCardData } from "@/lib/taskView";

/** Wie viele Aufgaben offen ausliegen, bevor der Rest zusammenklappt. Eine Aufgabe mit Frist ist das
 *  Dringendste auf der Seite — aber fünf davon wären eine Wand statt eines Signals. */
const EXPANDED = 2;

/**
 * Der Aufgaben-Block des Sub-Dashboards — Rang 3, direkt über der Session-Karte.
 *
 * Begründung der Platzierung: eine Aufgabe mit Frist ist das Einzige auf der Seite, das in den
 * nächsten Stunden zu einem Vergehen werden kann.
 */
export default function OpenTasks({ tasks, tz }: { tasks: TaskCardData[]; tz: string }) {
  const t = useTranslations("tasks");
  const [showAll, setShowAll] = useState(false);

  if (tasks.length === 0) return null;

  const visible = showAll ? tasks : tasks.slice(0, EXPANDED);
  const hidden = tasks.length - visible.length;

  return (
    <DashboardBlock>
      <ul className="flex flex-col gap-2">
        {visible.map((task) => (
          <li key={task.id}>
            <TaskCard task={task} subTz={tz} subLabel="">
              {/* Gemeldet wird erst, wenn die Bedingungen auch wirklich gelten — vorher wäre die
                  Meldung eine Aussage über ein Ergebnis, das es noch nicht gibt. */}
              {isTaskOpen(task.state) && task.missing.length === 0 && <MarkDoneButton taskId={task.id} />}
            </TaskCard>
          </li>
        ))}
      </ul>
      {hidden > 0 && (
        <div className="mt-2">
          <ExpandToggle label={t("showMore", { count: hidden })} open={showAll} onToggle={() => setShowAll(true)} />
        </div>
      )}
    </DashboardBlock>
  );
}

/** „Als erledigt melden" — sitzt auf dem Dashboard, nicht in einem Formular; Fehler gehen deshalb an
 *  den Toast und nicht an einen `FormError`-Slot. */
function MarkDoneButton({ taskId }: { taskId: string }) {
  const t = useTranslations("tasks");
  const tc = useTranslations("common");
  const toast = useToast();
  const router = useRouter();
  const apiError = useApiError();
  const { offlineFetch } = useOfflineQueue();
  const [saving, setSaving] = useState(false);

  async function handle() {
    setSaving(true);
    try {
      const res = await offlineFetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "complete" }),
      });
      // `null` = offline in die Warteschlange gelegt. Das ehrlich sagen, statt „erledigt" zu melden,
      // was der Server noch gar nicht gesehen hat.
      if (res === null) {
        toast.info(t("markDoneQueued"));
      } else if (res.ok) {
        toast.success(t("markDoneDone"));
        router.refresh();
      } else {
        toast.error(apiError(await parseApiErrorCode(res)));
      }
    } catch {
      toast.error(tc("networkError"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Button type="button" variant="secondary" fullWidth loading={saving} onClick={handle} icon={<Check size={16} />}>
      {t("markDone")}
    </Button>
  );
}
