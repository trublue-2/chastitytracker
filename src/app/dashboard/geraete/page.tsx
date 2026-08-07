import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { deviceCategoriesEnabled } from "@/lib/constants";
import DevicesClient from "./DevicesClient";
import { CATEGORY_QUERY_KEY } from "@/lib/categoryConstants";

export default async function DevicesPage({
  searchParams,
}: {
  /** `category=<id>` öffnet das Anlege-Formular mit dieser Kategorie — der zweite Schritt nach dem
   *  Anlegen einer Kategorie (Issue #49). */
  searchParams: Promise<{ category?: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/login");
  const requestedCategoryId = (await searchParams)[CATEGORY_QUERY_KEY];

  const [devices, categories] = await Promise.all([
    prisma.device.findMany({
      where: { userId: session.user.id },
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
        requireInspectionCode: true,
        _count: { select: { entries: true } },
      },
    }),
    prisma.deviceCategory.findMany({
      where: { userId: session.user.id },
      orderBy: [{ isBuiltIn: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true, name: true, isBuiltIn: true },
    }),
  ]);

  return (
    <main className="flex-1 w-full max-w-2xl mx-auto px-4 py-6">
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
          requireInspectionCode: d.requireInspectionCode,
        }))}
        categories={categories}
        // Nur eine EIGENE Kategorie wird vorgewählt: eine fremde oder erfundene id landete sonst als
        // Vorwahl im Formular, für die es keine Auswahlzeile gibt — und bei nur einer Kategorie ist
        // die Auswahl ausgeblendet, das Formular also ohne URL-Bearbeitung nicht mehr zu retten.
        initialCategoryId={categories.some((c) => c.id === requestedCategoryId) ? requestedCategoryId : undefined}
        showCategoriesLink={deviceCategoriesEnabled()}
        canEditInspectionCode={session.user.role === "admin"}
      />
    </main>
  );
}
