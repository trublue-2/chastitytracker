import { assertKeyholderOrAdmin } from "@/lib/authGuards";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { deviceCategoriesEnabled } from "@/lib/constants";
import DevicesClient from "@/app/dashboard/geraete/DevicesClient";

export default async function AdminDevicesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await assertKeyholderOrAdmin(id);

  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, username: true },
  });
  if (!user) notFound();

  const [devices, categories] = await Promise.all([
    prisma.device.findMany({
      where: { userId: user.id },
      orderBy: [{ archivedAt: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        name: true,
        description: true,
        imageUrl: true,
        purchasePrice: true,
        currency: true,
        categoryId: true,
        createdAt: true,
        archivedAt: true,
        _count: { select: { entries: true } },
      },
    }),
    prisma.deviceCategory.findMany({
      where: { userId: user.id },
      orderBy: [{ isBuiltIn: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true, name: true, isBuiltIn: true },
    }),
  ]);

  return (
    <DevicesClient
      devices={devices.map((d) => ({
        id: d.id,
        name: d.name,
        description: d.description,
        imageUrl: d.imageUrl,
        purchasePrice: d.purchasePrice,
        currency: d.currency,
        categoryId: d.categoryId,
        archivedAt: d.archivedAt?.toISOString() ?? null,
        createdAt: d.createdAt.toISOString(),
        entryCount: d._count.entries,
      }))}
      categories={categories}
      userId={user.id}
      username={user.username}
      showCategoriesLink={deviceCategoriesEnabled()}
    />
  );
}
