import { prisma } from "@/lib/prisma";
import { SESSION_ENTRY_SELECT, getUserTimezone } from "@/lib/queries";
import { buildKgWearPairs, wearingHoursFromPairs, getWeekStart } from "@/lib/utils";
import { buildWearSessions, wearHourPairsByCategory } from "@/lib/sessionModel";
import type { CategoryRow } from "@/app/dashboard/categories/CategoriesClient";

/**
 * Die Kategorie-Karten für die Kategorien-Seite — geteilt von der Sub-Sicht
 * (`/dashboard/categories`) und der Keyholder-Sicht (`/admin/users/[id]/categories`), die
 * dieselbe `CategoriesClient` rendern. Beide Seiten hatten die Query + Ableitung Zeile für Zeile
 * doppelt; eine Änderung an der Stunden-Semantik musste zweimal gemacht werden.
 *
 * Die Zeitzone kommt von hier drinnen (statt als Parameter): sie ist immer die DES SUBS — auch in
 * der Keyholder-Sicht — und so bleibt sie parallel zu den übrigen Queries ladbar.
 *
 * `weeklyHours` ist WANDUHR-Zeit: KG aus VERSCHLUSS/OEFFNEN, die Trage-Kategorien je GERÄT gepaart
 * und überlappungsfrei verschmolzen (zwei gleichzeitig getragene Plugs = 2 h, nicht 4 h).
 */
export async function buildCategoryRows(userId: string, now: Date): Promise<CategoryRow[]> {
  const [categories, entries, tz] = await Promise.all([
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
      select: SESSION_ENTRY_SELECT,
    }),
    getUserTimezone(userId),
  ]);

  const wocheStart = getWeekStart(now, tz);
  const wearPairsByCategory = wearHourPairsByCategory(buildWearSessions(entries, now), now);
  const kgPairs = buildKgWearPairs(entries, now);

  return categories.map((c) => {
    // KG: VERSCHLUSS/OEFFNEN (kein Kategorie-Filter — alle V/O-Einträge sind per Definition KG).
    const pairs = c.isBuiltIn ? kgPairs : wearPairsByCategory.get(c.id) ?? [];
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
  });
}
