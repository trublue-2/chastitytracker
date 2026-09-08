import { assertKeyholderOrAdmin } from "@/lib/authGuards";
import { prisma } from "@/lib/prisma";
import { deviceCategoriesEnabled } from "@/lib/constants";
import { getUserTimezone } from "@/lib/queries";
import { weightDayKey } from "@/lib/weight";
import AdminActionFormShell from "@/app/components/AdminActionFormShell";
import { actionSign } from "@/app/entries/actionSign";
import { getTranslations } from "next-intl/server";
import TaskSeriesFields from "@/app/admin/tasks/TaskSeriesFields";

/** Keyholder stellt eine WIEDERKEHRENDE Aufgabe (#26). */
export default async function AdminTaskSeriesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: userId } = await params;
  await assertKeyholderOrAdmin(userId);

  const [t, ts, categories, tz] = await Promise.all([
    getTranslations("admin"),
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

  return (
    <AdminActionFormShell userId={userId} backLabel={t("aktionen")} {...actionSign("TASK")} title={ts("actionTitle")}>
      <TaskSeriesFields
        userId={userId}
        categories={categories}
        tz={tz}
        today={weightDayKey(new Date(), tz)}
        redirectTo={`/admin/users/${userId}/aufgaben`}
      />
    </AdminActionFormShell>
  );
}
