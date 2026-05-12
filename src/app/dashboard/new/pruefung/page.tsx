import Link from "next/link";
import PruefungForm from "../../PruefungForm";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getTranslations } from "next-intl/server";

export default async function NewPruefungPage({ searchParams }: { searchParams: Promise<{ code?: string; kommentar?: string }> }) {
  const [{ code, kommentar }, session] = await Promise.all([searchParams, auth()]);
  const userId = session?.user?.id;

  const [dbUser, activeVerschluss] = await Promise.all([
    userId ? prisma.user.findUnique({ where: { id: userId }, select: { mobileDesktopUpload: true } }) : null,
    // Wenn keine Admin-Anforderung vorliegt: Siegel-Nummer aus aktivem Verschluss laden
    (!code && userId)
      ? prisma.entry.findFirst({
          where: { userId, type: "VERSCHLUSS" },
          orderBy: { startTime: "desc" },
          select: { kontrollCode: true },
        })
      : null,
  ]);

  // Admin-Code hat Vorrang; sonst Siegel-Nummer des aktiven Verschlusses
  const effectiveCode = code || activeVerschluss?.kontrollCode || undefined;
  const tn = await getTranslations("newEntry");
  const tf = await getTranslations("inspectionForm");
  return (
    <div className="w-full max-w-2xl mx-auto px-4 py-6">
      <Link href="/dashboard" className="text-sm text-foreground-faint hover:text-foreground-muted transition">{tn("back")}</Link>
      <h1 className="text-xl font-bold text-foreground mt-1 mb-6">{tf("title")}</h1>
      <PruefungForm initialCode={effectiveCode} initialKommentar={kommentar} mobileDesktopMode={dbUser?.mobileDesktopUpload ?? false} />
    </div>
  );
}
