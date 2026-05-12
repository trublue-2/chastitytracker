import { notFound, redirect } from "next/navigation";
import { assertAdmin } from "@/lib/authGuards";
import { prisma } from "@/lib/prisma";
import { deviceCategoriesEnabled } from "@/lib/constants";
import { getActiveWearSessionForCategory } from "@/lib/queries";
import WearForm from "@/app/dashboard/WearForm";
import AdminActionFormShell from "@/app/components/AdminActionFormShell";
import { Circle } from "lucide-react";
import { getTranslations } from "next-intl/server";

export default async function AdminWearBeginPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ category?: string }>;
}) {
  if (!deviceCategoriesEnabled()) notFound();
  await assertAdmin();
  const { id: userId } = await params;
  const { category: categoryId } = await searchParams;
  if (!categoryId) redirect(`/admin/users/${userId}/aktionen`);

  const [t, tw, category, devices, active] = await Promise.all([
    getTranslations("admin"),
    getTranslations("wearForm"),
    prisma.deviceCategory.findUnique({
      where: { id: categoryId },
      select: { id: true, userId: true, name: true, color: true, icon: true, isBuiltIn: true, requirePhoto: true },
    }),
    prisma.device.findMany({
      where: { userId, categoryId, archivedAt: null },
      orderBy: [{ createdAt: "asc" }],
      select: { id: true, name: true },
    }),
    getActiveWearSessionForCategory(userId, categoryId),
  ]);
  if (!category || category.userId !== userId || category.isBuiltIn) notFound();
  if (active) redirect(`/admin/users/${userId}/aktionen/wear-end?category=${categoryId}`);

  return (
    <AdminActionFormShell
      userId={userId}
      backLabel={t("aktionen")}
      icon={<Circle size={20} strokeWidth={2} />}
      iconBg="var(--background-subtle)"
      iconColor="var(--foreground)"
      title={tw("titleBegin")}
    >
      <WearForm
        kind="begin"
        category={{ id: category.id, name: category.name, color: category.color, icon: category.icon, requirePhoto: category.requirePhoto }}
        devices={devices}
        adminUserId={userId}
        redirectTo={`/admin/users/${userId}/aktionen`}
      />
    </AdminActionFormShell>
  );
}
