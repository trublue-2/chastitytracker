import { notFound, redirect } from "next/navigation";
import { assertKeyholderOrAdmin } from "@/lib/authGuards";
import { prisma } from "@/lib/prisma";
import { deviceCategoriesEnabled } from "@/lib/constants";
import { getActiveWearSessionForCategory } from "@/lib/queries";
import WearForm from "@/app/dashboard/WearForm";
import AdminActionFormShell from "@/app/components/AdminActionFormShell";
import { Circle } from "lucide-react";
import { getTranslations } from "next-intl/server";

export default async function AdminWearEndPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ category?: string }>;
}) {
  if (!deviceCategoriesEnabled()) notFound();
  const { id: userId } = await params;
  await assertKeyholderOrAdmin(userId);
  const { category: categoryId } = await searchParams;
  if (!categoryId) redirect(`/admin/users/${userId}/aktionen`);

  const [t, tw, category, active] = await Promise.all([
    getTranslations("admin"),
    getTranslations("wearForm"),
    prisma.deviceCategory.findUnique({
      where: { id: categoryId },
      select: { id: true, userId: true, name: true, color: true, icon: true, isBuiltIn: true },
    }),
    getActiveWearSessionForCategory(userId, categoryId),
  ]);
  if (!category || category.userId !== userId || category.isBuiltIn) notFound();
  if (!active) redirect(`/admin/users/${userId}/aktionen/wear-begin?category=${categoryId}`);

  return (
    <AdminActionFormShell
      userId={userId}
      backLabel={t("aktionen")}
      icon={<Circle size={20} strokeWidth={2} />}
      iconBg="var(--background-subtle)"
      iconColor="var(--foreground)"
      title={tw("titleEnd")}
    >
      <WearForm
        kind="end"
        category={{ id: category.id, name: category.name, color: category.color, icon: category.icon }}
        activeSession={{ deviceId: active.deviceId, deviceName: active.deviceName, since: active.since.toISOString() }}
        adminUserId={userId}
        redirectTo={`/admin/users/${userId}/aktionen`}
      />
    </AdminActionFormShell>
  );
}
