import { redirect } from "next/navigation";
import { assertKeyholderOrAdmin } from "@/lib/authGuards";
import { prisma } from "@/lib/prisma";
import { deviceCategoriesEnabled } from "@/lib/constants";
import { getUserTimezone } from "@/lib/queries";
import { nowDatetimeLocal } from "@/lib/utils";
import AdminActionFormShell from "@/app/components/AdminActionFormShell";
import { ClipboardList } from "lucide-react";
import { getTranslations } from "next-intl/server";
import TaskFields from "@/app/admin/tasks/TaskFields";
import { TASK_FORM_QUERY } from "@/lib/entryFormRoute";

export default async function AdminTaskPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  /** Aus dem Strafbuch: `offenseRef` macht die Aufgabe zur Strafe für dieses Vergehen,
   *  `offenseType` sagt welche Art an dieser ref gemeint ist, `anlass` belegt den Anlass-Text vor.
   *  Alles nur Durchreichung — geprüft werden ref und Art auf dem Server. */
  searchParams: Promise<{ offenseRef?: string; offenseType?: string; anlass?: string }>;
}) {
  const { id: userId } = await params;
  const query = await searchParams;
  // Über die geteilten Schlüssel, nicht über Feldnamen: so bricht ein Umbenennen hier und im
  // Link-Bauplatz gemeinsam, statt die Vorbelegung still abzuschalten.
  const offenseRef = query[TASK_FORM_QUERY.offenseRef];
  const offenseType = query[TASK_FORM_QUERY.offenseType];
  const anlass = query[TASK_FORM_QUERY.anlass];
  await assertKeyholderOrAdmin(userId);

  const [t, tt, categories, tz] = await Promise.all([
    getTranslations("admin"),
    getTranslations("tasks"),
    // Trage-Bedingungen gibt es nur mit Kategorien; ohne das Feature bleibt „KG verschlossen" plus
    // reine Textaufgaben.
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

  return (
    <AdminActionFormShell
      userId={userId}
      backLabel={t("aktionen")}
      icon={<ClipboardList size={20} strokeWidth={2} />}
      iconBg="var(--background-subtle)"
      iconColor="var(--foreground)"
      title={offenseRef ? tt("actionTitlePenalty") : tt("actionTitle")}
    >
      <TaskFields
        userId={userId}
        categories={categories}
        tz={tz}
        minNow={nowDatetimeLocal(tz)}
        // Zurück dorthin, wo die Aufgabe gestellt wurde: aus dem Strafbuch ins Strafbuch, sonst in
        // die Aufgaben-Liste.
        redirectTo={`/admin/users/${userId}/${offenseRef ? "strafbuch" : "aufgaben"}`}
        offenseRef={offenseRef}
        offenseType={offenseType}
        initialPenaltyReason={anlass}
      />
    </AdminActionFormShell>
  );
}
