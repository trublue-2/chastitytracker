import { redirect } from "next/navigation";
import { assertKeyholderOrAdmin } from "@/lib/authGuards";
import { prisma } from "@/lib/prisma";
import { deviceCategoriesEnabled } from "@/lib/constants";
import { getUserTimezone } from "@/lib/queries";
import { nowDatetimeLocal, toDatetimeLocal } from "@/lib/utils";
import { weightDayKey } from "@/lib/weight";
import AdminActionFormShell from "@/app/components/AdminActionFormShell";
import { actionSign } from "@/app/entries/actionSign";
import { getTranslations } from "next-intl/server";
import TaskFields, { type TaskFormInitial } from "@/app/admin/tasks/TaskFields";
import { recurrenceFromRow } from "@/lib/recurrenceForm";
import { TASK_FORM_QUERY } from "@/lib/entryFormRoute";
import type { RecurrenceFreq } from "@/lib/taskRecurrence";

/** Minuten → Dauer-Eingabe (Stunden bei glattem Wert, sonst Minuten) fürs Vorbefüllen. */
function minutesToDuration(min: number): { hours: string; holdUnit: "h" | "min" } {
  return min % 60 === 0 ? { hours: String(min / 60), holdUnit: "h" } : { hours: String(min), holdUnit: "min" };
}

export default async function AdminTaskPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ offenseRef?: string; offenseType?: string; anlass?: string; recurring?: string; editTask?: string; editSeries?: string }>;
}) {
  const { id: userId } = await params;
  const query = await searchParams;
  const offenseRef = query[TASK_FORM_QUERY.offenseRef];
  const offenseType = query[TASK_FORM_QUERY.offenseType];
  const anlass = query[TASK_FORM_QUERY.anlass];
  await assertKeyholderOrAdmin(userId);

  const [t, tt, ts, categories, tz] = await Promise.all([
    getTranslations("admin"),
    getTranslations("tasks"),
    getTranslations("taskSeries"),
    deviceCategoriesEnabled()
      ? prisma.deviceCategory.findMany({
          where: { userId, isBuiltIn: false, trackingEnabled: true },
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
          select: {
            id: true, name: true, color: true, icon: true,
            devices: { where: { archivedAt: null }, orderBy: { createdAt: "asc" }, select: { id: true, name: true } },
          },
        })
      : Promise.resolve([]),
    getUserTimezone(userId),
  ]);

  const backToTasks = `/admin/users/${userId}/aufgaben`;
  let edit: { kind: "task" | "series"; id: string } | undefined;
  let initial: Partial<TaskFormInitial> | undefined;
  let title = offenseRef ? tt("actionTitlePenalty") : tt("actionTitle");

  if (query.editSeries) {
    const s = await prisma.taskSeries.findFirst({
      where: { id: query.editSeries, userId, deletedAt: null },
      include: { requirements: { orderBy: { sortOrder: "asc" } }, proofs: { orderBy: { sortOrder: "asc" } } },
    });
    if (!s) redirect(backToTasks);
    const dur = minutesToDuration(s.holdDurationMin ?? s.holdWindowMin ?? 60);
    edit = { kind: "series", id: s.id };
    title = ts("editSeriesTitle");
    initial = {
      recurring: true,
      title: s.title,
      description: s.description ?? "",
      requirements: s.requirements.map((r) => ({ type: r.type as "WEAR" | "KG_LOCKED", categoryId: r.categoryId, deviceId: r.deviceId })),
      proofs: s.proofs.map((p) => ({ description: p.description, requiresPhoto: p.requiresPhoto, requiresText: p.requiresText, requireCode: p.requireCode, dueOffsetMin: p.dueOffsetMin })),
      proofOrderMatters: s.proofOrderMatters,
      seriesHoldMode: s.holdDurationMin != null ? "duration" : "window",
      hours: dur.hours,
      holdUnit: dur.holdUnit,
      recurrence: recurrenceFromRow(
        { freq: s.freq as RecurrenceFreq, interval: s.interval, weekdayMask: s.weekdayMask, ordinal: s.ordinal, timeOfDay: s.timeOfDay, startsOn: s.startsOn.toISOString(), until: s.until?.toISOString() ?? null },
        tz,
      ),
    };
  } else if (query.editTask) {
    const task = await prisma.task.findFirst({
      where: { id: query.editTask, userId, withdrawnAt: null, completedAt: null },
      select: {
        id: true, title: true, description: true, holdUntil: true, holdDurationMin: true, startGraceMin: true, isPunishment: true, penaltyReason: true,
        proofOrderMatters: true,
        requirements: { select: { type: true, categoryId: true, deviceId: true } },
        // Bedingungen und Nachweise sind beim Ändern nicht editierbar, werden aber geladen: das
        // Formular zeigt sie gedämpft an, statt sie wortlos wegzulassen.
        proofs: { orderBy: { sortOrder: "asc" }, select: { description: true, requiresPhoto: true, requiresText: true, requireCode: true, dueOffsetMin: true } },
      },
    });
    if (!task) redirect(backToTasks);
    edit = { kind: "task", id: task.id };
    title = ts("editTitle");
    const durationMode = task.holdDurationMin != null;
    const dur = durationMode ? minutesToDuration(task.holdDurationMin!) : { hours: "", holdUnit: "h" as const };
    initial = {
      recurring: false,
      title: task.title,
      description: task.description ?? "",
      // Die Bedingungen sind beim Ändern NICHT editierbar (Picker ausgeblendet), werden aber geladen:
      // an ihnen hängt der Frist-Modus. Ohne sie fiele „Tragezeit ab Beginn" auf „Endet in" zurück und
      // die geänderte Dauer ginge beim Speichern verloren (Modus bleibt fest, `mergeTaskPatch`).
      requirements: task.requirements.map((r) => ({ type: r.type as "WEAR" | "KG_LOCKED", categoryId: r.categoryId, deviceId: r.deviceId })),
      proofs: task.proofs.map((p) => ({ description: p.description, requiresPhoto: p.requiresPhoto, requiresText: p.requiresText, requireCode: p.requireCode, dueOffsetMin: p.dueOffsetMin })),
      proofOrderMatters: task.proofOrderMatters,
      isPunishment: task.isPunishment,
      penaltyReason: task.penaltyReason ?? "",
      mode: durationMode ? "fromStart" : "datetime",
      hours: dur.hours,
      holdUnit: dur.holdUnit,
      holdUntil: durationMode ? "" : toDatetimeLocal(task.holdUntil, tz),
      // Kulanz ist beim Ändern nicht editierbar, wird aber geladen, damit die Frist-Vorschau die
      // echte Zahl rechnet statt der Vorgabe.
      graceMin: String(task.startGraceMin),
    };
  } else if (query.recurring) {
    title = ts("actionTitle");
    initial = { recurring: true };
  }

  return (
    <AdminActionFormShell
      userId={userId}
      backLabel={t("aktionen")}
      {...actionSign("TASK")}
      title={title}
    >
      <TaskFields
        userId={userId}
        categories={categories}
        tz={tz}
        minNow={nowDatetimeLocal(tz)}
        today={weightDayKey(new Date(), tz)}
        redirectTo={offenseRef ? `/admin/users/${userId}/strafbuch` : backToTasks}
        offenseRef={offenseRef}
        offenseType={offenseType}
        initialPenaltyReason={anlass}
        edit={edit}
        initial={initial}
      />
    </AdminActionFormShell>
  );
}
