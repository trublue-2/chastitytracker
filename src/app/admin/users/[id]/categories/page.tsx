import { assertKeyholderOrAdmin } from "@/lib/authGuards";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { deviceCategoriesEnabled } from "@/lib/constants";
import { APP_TZ, buildWearPairs, wearingHoursFromPairs, getWeekStart, KG_PAIR, WEAR_PAIR } from "@/lib/utils";
import CategoriesClient from "@/app/dashboard/categories/CategoriesClient";

export default async function AdminCategoriesPage({ params }: { params: Promise<{ id: string }> }) {
  if (!deviceCategoriesEnabled()) notFound();
  const { id } = await params;
  await assertKeyholderOrAdmin(id);
  const now = new Date();

  const [user, categories, entries] = await Promise.all([
    prisma.user.findUnique({ where: { id }, select: { id: true, username: true, timezone: true } }),
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
        requirePhoto: true,
        allowVorgaben: true,
        sortOrder: true,
        createdAt: true,
        _count: { select: { devices: true, vorgaben: true } },
      },
    }),
    prisma.entry.findMany({
      where: { userId: id, type: { in: ["VERSCHLUSS", "OEFFNEN", "WEAR_BEGIN", "WEAR_END"] } },
      orderBy: { startTime: "asc" },
      select: { type: true, startTime: true, device: { select: { categoryId: true } } },
    }),
  ]);
  if (!user) notFound();

  // Sub's own timezone governs the week boundary — read from the loaded user row.
  const wocheStart = getWeekStart(now, user.timezone ?? APP_TZ);

  return (
    <CategoriesClient
      userId={user.id}
      username={user.username}
      categories={categories.map((c) => {
        const pairs = c.isBuiltIn
          ? buildWearPairs(entries, now, { types: KG_PAIR })
          : buildWearPairs(entries, now, { types: WEAR_PAIR, categoryId: c.id });
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
          weeklyHours: wearingHoursFromPairs(pairs, wocheStart, now),
        };
      })}
    />
  );
}
