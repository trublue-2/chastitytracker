import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import DevicesClient from "./DevicesClient";

export default async function DevicesPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const devices = await prisma.device.findMany({
    where: { userId: session.user.id },
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
    <main className="flex-1 w-full max-w-2xl mx-auto px-4 py-6">
      <DevicesClient
        devices={devices.map((d) => ({
          ...d,
          archivedAt: d.archivedAt?.toISOString() ?? null,
          createdAt: d.createdAt.toISOString(),
          entryCount: d._count.entries,
        }))}
      />
    </main>
  );
}
