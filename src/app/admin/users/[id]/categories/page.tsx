import { assertAdmin } from "@/lib/authGuards";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { deviceCategoriesEnabled } from "@/lib/constants";
import CategoriesClient from "@/app/dashboard/categories/CategoriesClient";

export default async function AdminCategoriesPage({ params }: { params: Promise<{ id: string }> }) {
  if (!deviceCategoriesEnabled()) notFound();
  await assertAdmin();
  const { id } = await params;

  const [user, categories] = await Promise.all([
    prisma.user.findUnique({ where: { id }, select: { id: true, username: true } }),
    prisma.deviceCategory.findMany({
      where: { userId: id },
      orderBy: [{ isBuiltIn: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        name: true,
        slug: true,
        color: true,
        icon: true,
        isBuiltIn: true,
        trackingEnabled: true,
        sortOrder: true,
        createdAt: true,
        _count: { select: { devices: true, vorgaben: true } },
      },
    }),
  ]);
  if (!user) notFound();

  return (
    <CategoriesClient
      userId={user.id}
      username={user.username}
      categories={categories.map((c) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        color: c.color,
        icon: c.icon,
        isBuiltIn: c.isBuiltIn,
        trackingEnabled: c.trackingEnabled,
        sortOrder: c.sortOrder,
        createdAt: c.createdAt.toISOString(),
        deviceCount: c._count.devices,
        vorgabeCount: c._count.vorgaben,
      }))}
    />
  );
}
