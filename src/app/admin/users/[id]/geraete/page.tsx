import { assertAdmin } from "@/lib/authGuards";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import DevicesClient from "@/app/dashboard/geraete/DevicesClient";

export default async function AdminDevicesPage({ params }: { params: Promise<{ id: string }> }) {
  await assertAdmin();
  const { id } = await params;

  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, username: true },
  });
  if (!user) notFound();

  const devices = await prisma.device.findMany({
    where: { userId: user.id },
    orderBy: [{ archivedAt: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      name: true,
      description: true,
      imageUrl: true,
      purchasePrice: true,
      currency: true,
      createdAt: true,
      archivedAt: true,
      _count: { select: { entries: true } },
    },
  });

  return (
    <DevicesClient
      devices={devices.map((d) => ({
        ...d,
        archivedAt: d.archivedAt?.toISOString() ?? null,
        createdAt: d.createdAt.toISOString(),
        entryCount: d._count.entries,
      }))}
      userId={user.id}
      username={user.username}
    />
  );
}
