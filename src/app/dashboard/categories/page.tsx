import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect, notFound } from "next/navigation";
import { deviceCategoriesEnabled } from "@/lib/constants";
import CategoriesClient from "./CategoriesClient";

export default async function CategoriesPage() {
  if (!deviceCategoriesEnabled()) notFound();
  const session = await auth();
  if (!session) redirect("/login");

  const categories = await prisma.deviceCategory.findMany({
    where: { userId: session.user.id },
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
  });

  return (
    <main className="flex-1 w-full max-w-2xl mx-auto px-4 py-6">
      <CategoriesClient
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
    </main>
  );
}
