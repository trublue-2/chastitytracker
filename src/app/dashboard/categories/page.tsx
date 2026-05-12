import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect, notFound } from "next/navigation";
import { deviceCategoriesEnabled } from "@/lib/constants";
import { buildWearPairs, wearingHoursFromPairs, getWeekStart, KG_PAIR, WEAR_PAIR } from "@/lib/utils";
import CategoriesClient from "./CategoriesClient";

export default async function CategoriesPage() {
  if (!deviceCategoriesEnabled()) notFound();
  const session = await auth();
  if (!session) redirect("/login");

  const userId = session.user.id;
  const now = new Date();
  const wocheStart = getWeekStart(now);

  const [categories, entries] = await Promise.all([
    prisma.deviceCategory.findMany({
      where: { userId },
      orderBy: [{ isBuiltIn: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        name: true,
        slug: true,
        color: true,
        icon: true,
        isBuiltIn: true,
        trackingEnabled: true,
        requirePhoto: true,
        allowVorgaben: true,
        sortOrder: true,
        createdAt: true,
        _count: { select: { devices: true, vorgaben: true } },
      },
    }),
    prisma.entry.findMany({
      where: { userId, type: { in: ["VERSCHLUSS", "OEFFNEN", "WEAR_BEGIN", "WEAR_END"] } },
      orderBy: { startTime: "asc" },
      select: { type: true, startTime: true, device: { select: { categoryId: true } } },
    }),
  ]);

  return (
    <main className="flex-1 w-full max-w-2xl mx-auto px-4 py-6">
      <CategoriesClient
        categories={categories.map((c) => {
          // KG: VERSCHLUSS/OEFFNEN pairs (no category filter — all V/O entries are KG by design).
          // Non-KG: WEAR_BEGIN/END pairs filtered to this category.
          const pairs = c.isBuiltIn
            ? buildWearPairs(entries, now, { types: KG_PAIR })
            : buildWearPairs(entries, now, { types: WEAR_PAIR, categoryId: c.id });
          const wocheH = wearingHoursFromPairs(pairs, wocheStart, now);
          return {
            id: c.id,
            name: c.name,
            slug: c.slug,
            color: c.color,
            icon: c.icon,
            isBuiltIn: c.isBuiltIn,
            trackingEnabled: c.trackingEnabled,
            requirePhoto: c.requirePhoto,
            allowVorgaben: c.allowVorgaben,
            sortOrder: c.sortOrder,
            createdAt: c.createdAt.toISOString(),
            deviceCount: c._count.devices,
            vorgabeCount: c._count.vorgaben,
            weeklyHours: wocheH,
          };
        })}
      />
    </main>
  );
}
