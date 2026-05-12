import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect, notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { deviceCategoriesEnabled } from "@/lib/constants";
import { getActiveWearSessionForCategory } from "@/lib/queries";
import WearForm from "../../WearForm";

export default async function NewWearBeginPage({ searchParams }: { searchParams: Promise<{ category?: string }> }) {
  if (!deviceCategoriesEnabled()) notFound();
  const session = await auth();
  if (!session) redirect("/login");

  const { category: categoryId } = await searchParams;
  if (!categoryId) redirect("/dashboard/categories");

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

  const tn = await getTranslations("newEntry");
  const t = await getTranslations("wearForm");

  if (devices.length === 0) {
    return (
      <div className="w-full max-w-2xl mx-auto px-4 py-6">
        <Link href="/dashboard" className="text-sm text-foreground-faint hover:text-foreground-muted transition">{tn("back")}</Link>
        <div className="mt-4 p-6 rounded-xl border border-border bg-surface text-center">
          <p className="text-sm text-foreground-muted mb-3">{t("noDevicesInCategory", { name: category.name })}</p>
          <Link href="/dashboard/geraete" className="text-sm font-medium text-foreground underline">
            {t("addDeviceLink")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-2xl mx-auto px-4 py-6">
      <Link href="/dashboard" className="text-sm text-foreground-faint hover:text-foreground-muted transition">{tn("back")}</Link>
      <h1 className="text-xl font-bold text-foreground mt-1 mb-6">{t("titleBegin")}</h1>
      <WearForm
        kind="begin"
        category={{ id: category.id, name: category.name, color: category.color, icon: category.icon, requirePhoto: category.requirePhoto }}
        devices={devices}
      />
    </div>
  );
}
