"use client";

import { useState } from "react";
import { ListChecks } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import Sheet from "@/app/components/Sheet";
import TaskCard from "@/app/components/TaskCard";
import ListPager from "@/app/components/ListPager";
import usePagedList from "@/app/hooks/usePagedList";
import { formatDateTimeDual, toDateLocale } from "@/lib/utils";
import { TASK_STATE_COLOR } from "@/lib/constants";
import { taskDeadlineKey, type TaskCardData } from "@/lib/taskView";

const PAGE_SIZE = 5;

/**
 * Die Aufgaben des Subs als kompakte Liste — dieselbe Rolle wie `WearSessionList` für die
 * Trage-Sessions: das Archiv unter dem, was gerade zu tun ist.
 *
 * Ohne sie war eine Aufgabe nach ihrem Abschluss für den Sub spurlos verschwunden, während die
 * Keyholderin ihre Historie längst hatte. Erst diese Liste erlaubt es, erfüllte Aufgaben sofort vom
 * Dashboard zu nehmen ({@link belongsOnDashboard}) — das eine bedingt das andere.
 *
 * Die Zeile trägt nur Titel, Frist und Zustand; alles Weitere (Bedingungen, Nachweise, Fotos,
 * Anmerkungen der Keyholderin) steht im Sheet, damit die Liste eine Liste bleibt. Die Karte dort ist
 * bewusst OHNE Formular-Links: gehandelt wird oben am Aufgaben-Block, hier wird nachgesehen.
 */
export default function TaskList({
  tasks,
  tz,
  viewerTz,
  subLabel = "",
}: {
  tasks: TaskCardData[];
  /** Zeitzone des Subs — es sind seine Fristen. */
  tz: string;
  /** Zeitzone des Betrachters, wo das eine andere ist (Keyholder-Sicht). Fehlt sie, steht überall
   *  die Sub-Zeit — auf dem Sub-Dashboard genau richtig, auf einer Keyholder-Seite ein stiller
   *  Wechsel der Uhr mitten in der Spalte. */
  viewerTz?: string;
  /** Übersetztes Präfix für die Sub-Lokalzeit, z.B. „Sub:". */
  subLabel?: string;
}) {
  const t = useTranslations("tasks");
  const locale = useLocale();
  const { page, setPage, totalPages, visible } = usePagedList(tasks, PAGE_SIZE);
  // Ein Sheet für die ganze Liste statt eines je Zeile — offen sein kann ohnehin nur eines.
  const [openTask, setOpenTask] = useState<TaskCardData | null>(null);

  if (tasks.length === 0) return null;

  const dl = toDateLocale(locale);

  return (
    <div className="bg-surface rounded-2xl border border-border overflow-hidden">
      <div className="px-5 py-3 border-b border-border-subtle">
        <p className="text-xs font-semibold uppercase tracking-wider text-foreground-faint">
          {t("listTitle")}
        </p>
      </div>

      <div className="divide-y divide-border-subtle">
        {visible.map((task) => (
          <button
            key={task.id}
            type="button"
            onClick={() => setOpenTask(task)}
            className="w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-surface-raised transition"
          >
            <span className="shrink-0 size-8 rounded-lg flex items-center justify-center bg-surface-raised text-foreground-muted" aria-hidden>
              <ListChecks className="size-4" />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-semibold text-foreground truncate">{task.title}</span>
              <span className="block text-xs text-foreground-faint tabular-nums truncate">
                {t(taskDeadlineKey(task), { date: formatDateTimeDual(task.holdUntil, dl, viewerTz, tz, subLabel) })}
              </span>
            </span>
            <span className={`text-xs font-medium shrink-0 ${TASK_STATE_COLOR[task.state]}`}>
              {t(`shortState_${task.state}`)}
            </span>
          </button>
        ))}
      </div>

      <ListPager page={page} totalPages={totalPages} onPage={setPage} />

      <Sheet open={openTask !== null} onClose={() => setOpenTask(null)} title={t("listTitle")}>
        {openTask && <TaskCard task={openTask} viewerTz={viewerTz} subTz={tz} subLabel={subLabel} />}
      </Sheet>
    </div>
  );
}
