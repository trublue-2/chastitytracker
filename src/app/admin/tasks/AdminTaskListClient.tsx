"use client";

import ListPager from "@/app/components/ListPager";
import usePagedList from "@/app/hooks/usePagedList";
import { LIST_PAGE_SIZE } from "@/lib/constants";
import KeyholderTaskCard from "@/app/admin/tasks/KeyholderTaskCard";
import type { TaskCardData } from "@/lib/taskView";


/**
 * Ein Abschnitt der Aufgaben-Historie, geblättert — dieselbe Form wie die Kontroll-Historie nebenan.
 *
 * Die Seite zeigte bis hierher ALLE Aufgaben am Stück (bis zu hundert), offene und alte
 * durcheinander. Bei einem Träger, der lange dabei ist, steht die laufende Aufgabe damit hinter
 * Dutzenden abgeschlossenen — die Seite „müllt sich zu" (Rückmeldung 16.08.2026).
 *
 * ZEHN je Seite, wie jede Liste im Adminportal (`AdminKontrolleListClient`, `StatsKontrollenList`).
 * Das Dashboard des Trägers blättert zu fünft, weil seine Spalte schmaler ist — auch seine
 * Aufgabenliste tut das längst. Diese hier war die letzte ohne.
 *
 * Der Zustand bleibt in dieser Komponente und nicht in der Seite: jeder Abschnitt blättert für sich,
 * und die Seite ist eine Server-Komponente ohne Zustand.
 */
export default function AdminTaskListClient({
  tasks,
  viewerTz,
  subTz,
}: {
  tasks: TaskCardData[];
  /** Zeitzone des Keyholders. */
  viewerTz: string;
  /** Zeitzone des Subs — Fristen stehen in beiden, wenn sie auseinanderfallen. */
  subTz: string;
}) {
  const { page, setPage, totalPages, visible } = usePagedList(tasks, LIST_PAGE_SIZE);

  return (
    <div className="flex flex-col gap-4">
      {visible.map((task) => (
        <KeyholderTaskCard key={task.id} task={task} viewerTz={viewerTz} subTz={subTz} />
      ))}
      <ListPager page={page} totalPages={totalPages} onPage={setPage} />
    </div>
  );
}
