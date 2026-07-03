import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect, notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { deviceCategoriesEnabled } from "@/lib/constants";
import { getActiveWearSessionForCategory } from "@/lib/queries";
import { nowDatetimeLocal, APP_TZ } from "@/lib/utils";
import WearForm from "../../WearForm";

export default async function NewWearEndPage({ searchParams }: { searchParams: Promise<{ category?: string }> }) {
  if (!deviceCategoriesEnabled()) notFound();
  const session = await auth();
  if (!session) redirect("/login");
  const tz = session.user.timezone ?? APP_TZ;

  const { category: categoryId } = await searchParams;
  if (!categoryId) redirect("/dashboard/categories");

  const category = await prisma.deviceCategory.findUnique({
    where: { id: categoryId },
    select: { id: true, userId: true, name: true, color: true, icon: true, isBuiltIn: true },
  });
  if (!category || category.userId !== session.user.id || category.isBuiltIn) notFound();

  const active = await getActiveWearSessionForCategory(session.user.id, categoryId);
  // No active session → redirect to begin form
  if (!active) redirect(`/dashboard/new/wear-begin?category=${categoryId}`);

  const tn = await getTranslations("newEntry");
  const t = await getTranslations("wearForm");
  return (
    <div className="w-full max-w-2xl mx-auto px-4 py-6">
      <Link href="/dashboard" className="text-sm text-foreground-faint hover:text-foreground-muted transition">{tn("back")}</Link>
      <h1 className="text-xl font-bold text-foreground mt-1 mb-6">{t("titleEnd")}</h1>
      <WearForm
        kind="end"
        category={{ id: category.id, name: category.name, color: category.color, icon: category.icon }}
        activeSession={{
          deviceId: active.deviceId,
          deviceName: active.deviceName,
          since: active.since.toISOString(),
        }}
        tz={tz}
        nowDefault={nowDatetimeLocal(tz)}
      />
    </div>
  );
}
