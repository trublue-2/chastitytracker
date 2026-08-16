"use client";

import { useState } from "react";
import IconTile from "@/app/components/IconTile";
import { ListChecks } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import Sheet from "@/app/components/Sheet";
import TaskCard from "@/app/components/TaskCard";
import ListPager from "@/app/components/ListPager";
import usePagedList from "@/app/hooks/usePagedList";
import { formatDateTimeDual, formatElapsedMs, toDateLocale } from "@/lib/utils";
import { TASK_LIST_ANCHOR, TASK_STATE_COLOR, BLOCK_PAGE_SIZE } from "@/lib/constants";
import { taskDeadlineLine, type TaskCardData } from "@/lib/taskView";


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
  const { page, setPage, totalPages, visible } = usePagedList(tasks, BLOCK_PAGE_SIZE);
  // Ein Sheet für die ganze Liste statt eines je Zeile — offen sein kann ohnehin nur eines.
  const [openTask, setOpenTask] = useState<TaskCardData | null>(null);

  if (tasks.length === 0) return null;

  const dl = toDateLocale(locale);
  // Dieselbe Ableitung wie am Kartenkopf (`TaskCard`) — welche Zeile hier steht, entscheidet
  // `taskDeadlineLine` und nicht diese Datei.
  const deadlineOf = (task: TaskCardData) => taskDeadlineLine(task, {
    date: (iso) => formatDateTimeDual(iso, dl, viewerTz, tz, subLabel),
    duration: (ms) => formatElapsedMs(ms, locale),
  });

  return (
    // Sprungziel des Aufgaben-Badges an `OffenseCard` (Begründung an `TASK_LIST_ANCHOR`).
    // `scroll-mt-20` hält den Listenkopf frei: der Dashboard-Header ist `sticky` und deckte die
    // Überschrift sonst genau nach dem Sprung ab.
    <div id={TASK_LIST_ANCHOR} className="scroll-mt-20 bg-surface rounded-2xl border border-border overflow-hidden">
      <div className="px-5 py-3 border-b border-border-subtle">
        <p className="text-xs font-semibold uppercase tracking-wider text-foreground-faint">
          {t("listTitle")}
        </p>
      </div>

      <div className="divide-y divide-border-subtle">
        {visible.map((task) => {
          const deadline = deadlineOf(task);
          return (
          <button
            key={task.id}
            type="button"
            onClick={() => setOpenTask(task)}
            className="w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-surface-raised transition"
          >
            <IconTile size="sm" icon={<ListChecks className="size-4" />} />
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-semibold text-foreground truncate">{task.title}</span>
              <span className="block text-xs text-foreground-faint tabular-nums truncate">
                {t(deadline.key, { value: deadline.value })}
              </span>
            </span>
            <span className={`text-xs font-medium shrink-0 ${TASK_STATE_COLOR[task.state]}`}>
              {t(`shortState_${task.state}`)}
            </span>
          </button>
          );
        })}
      </div>

      <ListPager page={page} totalPages={totalPages} onPage={setPage} />

      <Sheet open={openTask !== null} onClose={() => setOpenTask(null)} title={t("listTitle")}>
        {openTask && <TaskCard task={openTask} viewerTz={viewerTz} subTz={tz} subLabel={subLabel} />}
      </Sheet>
    </div>
  );
}
