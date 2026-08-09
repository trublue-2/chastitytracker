import { prisma } from "@/lib/prisma";
import { SESSION_ENTRY_SELECT, COUNTABLE_DEVICES_SELECT, getUserTimezone, getNonKgTrackingCategories, getActiveWearSessions } from "@/lib/queries";
import { buildKgWearPairs, wearingHoursFromPairs, getWeekStart } from "@/lib/utils";
import { buildWearSessions, isLiveOpenSession, wearHourPairsByCategory } from "@/lib/sessionModel";
import { deviceCategoriesEnabled } from "@/lib/constants";
import { categoryNeedsDevice } from "@/lib/categoryConstants";
import type { CategoryRow } from "@/app/dashboard/categories/CategoriesClient";
import type { NewEntryCategoryRow } from "@/app/components/NewEntrySheet";

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
 *
 * `needsDevice` ist das einzige Feld hier, über das sich diese Seite mit einer ANDEREN einig sein
 * muss: das Dashboard fällt dasselbe Urteil über dieselbe Kategorie. Es kommt deshalb aus
 * `categoryNeedsDevice()` und wird hier nicht nachgerechnet (Issue #49).
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
        // Dieselbe Zählung wie im Dashboard. Vorher zählte diese Seite auch archivierte Geräte:
        // war das einzige Gerät archiviert, wies das Dashboard die Kategorie als unfertig aus,
        // während hier daneben „1 Device" stand — wer dem Hinweis folgte, fand die Gegenaussage.
        _count: { select: { ...COUNTABLE_DEVICES_SELECT, vorgaben: true } },
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
  const wearSessions = buildWearSessions(entries, now);
  const wearPairsByCategory = wearHourPairsByCategory(wearSessions, now);
  const kgPairs = buildKgWearPairs(entries, now);
  // Für `needsDevice`: dieselbe Ausnahme wie im Dashboard, hier aus den ohnehin gebauten Sessions
  // statt aus einer zweiten Abfrage. `isLiveOpenSession` statt eines eigenen `isOpen`-Vergleichs,
  // weil „läuft wirklich" genau eine Definition haben soll. Auf DIESER Eingabe wären beide gleich —
  // `buildWearSessions` lässt verwaiste Paare schon weg —, aber das ist eine Zusicherung eines
  // anderen Moduls, und sie hier stillschweigend vorauszusetzen ist die teurere Variante.
  const categoriesWithActiveSession = new Set(
    wearSessions.filter(isLiveOpenSession).map((s) => s.categoryId),
  );

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
      needsDevice: categoryNeedsDevice({
        isBuiltIn: c.isBuiltIn,
        trackingEnabled: c.trackingEnabled,
        deviceCount: c._count.devices,
        hasActiveSession: categoriesWithActiveSession.has(c.id),
      }),
    };
  });
}

/**
 * Die Kategorie-Zeilen der „Neu erfassen"-Auswahl — je Kategorie mit dem Namen des aktuell
 * getragenen Geräts (oder null), woraus die Auswahl „Tragen beginnen" bzw. „beenden" ableitet.
 *
 * Geteilt vom Sub-Dashboard (`dashboard/layout.tsx`), der Keyholder-Aktionenseite und der
 * Keyholder-Sicht des Sheets (über `GET /api/admin/users/[id]`). Die Ableitung stand dreimal Zeile
 * für Zeile da — und die dritte Kopie war bereits abgedriftet: der Aktionen-Seite fehlte
 * `trackingEnabled: true`, sie bot also auch für Kategorien ohne Zeiterfassung ein „Tragen
 * beginnen" an. Diese Funktion ist ab jetzt die eine Wahrheit.
 *
 * Flag aus: leere Liste, ohne Query — dieselbe Kurzschluss-Regel wie bei den Aufrufern vorher.
 */
export async function buildNewEntryCategoryRows(userId: string): Promise<NewEntryCategoryRow[]> {
  if (!deviceCategoriesEnabled()) return [];
  const [categories, activeWear] = await Promise.all([
    getNonKgTrackingCategories(userId),
    getActiveWearSessions(userId),
  ]);
  const activeByCategory = new Map(activeWear.map((s) => [s.categoryId, s]));
  return categories.map((c) => ({
    id: c.id,
    name: c.name,
    color: c.color,
    icon: c.icon,
    activeDeviceName: activeByCategory.get(c.id)?.deviceName ?? null,
  }));
}
