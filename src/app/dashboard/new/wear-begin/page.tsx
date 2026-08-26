import { EntryActionFormShell } from "@/app/components/AdminActionFormShell";
import { actionSign } from "@/app/entries/actionSign";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect, notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { deviceCategoriesEnabled } from "@/lib/constants";
import { deviceFormHref } from "@/lib/categoryConstants";
import { getActiveWearSessionForCategory, getMobileDesktopMode } from "@/lib/queries";
import { nowDatetimeLocal, safeInternalPath, APP_TZ } from "@/lib/utils";
import WearForm from "../../WearForm";

export default async function NewWearBeginPage({ searchParams }: { searchParams: Promise<{ category?: string; device?: string; redirectTo?: string }> }) {
  if (!deviceCategoriesEnabled()) notFound();
  const session = await auth();
  if (!session) redirect("/login");
  const tz = session.user.timezone ?? APP_TZ;

  // `redirectTo` kommt hier aus der URL (Ketten-Weiterleitung der Aufgaben-Bedingungen) — deshalb
  // durch `safeInternalPath`, anders als bei den serverseitig gebauten Zielen der Admin-Formulare.
  const { category: categoryId, device: wantedDevice, redirectTo } = await searchParams;
  if (!categoryId) redirect("/dashboard/categories");
  const target = safeInternalPath(redirectTo) ?? undefined;

  const category = await prisma.deviceCategory.findUnique({
    where: { id: categoryId },
    select: { id: true, userId: true, name: true, color: true, icon: true, isBuiltIn: true, requirePhoto: true },
  });
  if (!category || category.userId !== session.user.id || category.isBuiltIn) notFound();

  // Block if a session is already active in this category
  const active = await getActiveWearSessionForCategory(session.user.id, categoryId);
  if (active) redirect(`/dashboard/new/wear-end?category=${categoryId}`);

  const devices = await prisma.device.findMany({
    where: { userId: session.user.id, categoryId, archivedAt: null },
    orderBy: [{ createdAt: "asc" }],
    select: { id: true, name: true },
  });

  // Verlangt eine Aufgabe ein BESTIMMTES Gerät, steht es vorne — `WearForm` wählt das erste vor.
  // Bewusst nur umsortiert und nicht gefiltert: die Vorgabe soll führen, nicht die freie Wahl
  // ersetzen (und ein Gerät, das es nicht mehr gibt, darf das Formular nicht leer machen).
  const preferred = devices.findIndex((d) => d.id === wantedDevice);
  if (preferred > 0) devices.unshift(...devices.splice(preferred, 1));

  const [t, mobileDesktopMode] = await Promise.all([
    getTranslations("wearForm"),
    getMobileDesktopMode(session.user.id),
  ]);

  // Kopf einmal, für beide Ausgänge unten: der Leerfall ist derselbe Bildschirm, nur ohne Geräte —
  // ein zweiter, von Hand gleich gehaltener Kopf wäre genau die Stelle, an der die zwei
  // auseinanderlaufen.
  const shell = { ...actionSign("WEAR_BEGIN"), title: t("titleBegin") };

  // Auch der Leerfall bekommt Kopf und Titel. Vorher stand hier eine Seite aus Rücklink und Kasten,
  // ohne zu sagen, WELCHE Handlung gerade nicht möglich ist — nur der Kategorie-Name im Satz
  // verriet es.
  if (devices.length === 0) {
    return (
      <EntryActionFormShell {...shell}>
        <div className="p-6 rounded-xl border border-border bg-surface text-center">
          <p className="text-fliess text-foreground-muted mb-3">{t("noDevicesInCategory", { name: category.name })}</p>
          <Link href={deviceFormHref(category.id)} className="text-fliess font-medium text-foreground underline">
            {t("addDeviceLink")}
          </Link>
        </div>
      </EntryActionFormShell>
    );
  }

  return (
    <EntryActionFormShell {...shell}>
      <WearForm
        kind="begin"
        mobileDesktopMode={mobileDesktopMode}
        category={{ id: category.id, name: category.name, color: category.color, icon: category.icon, requirePhoto: category.requirePhoto }}
        devices={devices}
        redirectTo={target}
        tz={tz}
        nowDefault={nowDatetimeLocal(tz)}
      />
    </EntryActionFormShell>
  );
}
