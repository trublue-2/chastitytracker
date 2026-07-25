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

export default async function AdminTaskPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: userId } = await params;
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
      title={tt("actionTitle")}
    >
      <TaskFields
        userId={userId}
        categories={categories}
        tz={tz}
        minNow={nowDatetimeLocal(tz)}
        redirectTo={`/admin/users/${userId}/aufgaben`}
      />
    </AdminActionFormShell>
  );
}
