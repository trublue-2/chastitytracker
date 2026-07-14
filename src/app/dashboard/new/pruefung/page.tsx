import Link from "next/link";
import PruefungForm from "../../PruefungForm";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateKontrollCode, sealRequiredForCode } from "@/lib/kontrolleService";
import { getLatestKgEntry } from "@/lib/queries";
import { getTranslations } from "next-intl/server";
import { nowDatetimeLocal, APP_TZ } from "@/lib/utils";

export default async function NewPruefungPage({ searchParams }: { searchParams: Promise<{ code?: string; kommentar?: string }> }) {
  const [{ code, kommentar }, session] = await Promise.all([searchParams, auth()]);
  const userId = session?.user?.id;
  const tz = session?.user?.timezone ?? APP_TZ;

  const [dbUser, latest] = await Promise.all([
    userId ? prisma.user.findUnique({ where: { id: userId }, select: { mobileDesktopUpload: true } }) : null,
    userId ? getLatestKgEntry(userId) : null,
  ]);

  // Angeforderter Code (Mail-Link) hat Vorrang; sonst bekommt die Selbstkontrolle bei aktivem
  // Verschluss einen frischen Zufallscode (Frische-Beweis statt wiederverwendbarem Siegel-Foto).
  // Bei aktivem Siegel prüft die Verifikation die Siegel-Nummer zusätzlich (Server-seitig).
  const isLocked = latest?.type === "VERSCHLUSS";
  const effectiveCode = code || (isLocked ? generateKontrollCode() : undefined);
  const sealRequired = sealRequiredForCode(effectiveCode, latest ?? null);
  const tn = await getTranslations("newEntry");
  const tf = await getTranslations("inspectionForm");
  return (
    <div className="w-full max-w-2xl mx-auto px-4 py-6">
      <Link href="/dashboard" className="text-sm text-foreground-faint hover:text-foreground-muted transition">{tn("back")}</Link>
      <h1 className="text-xl font-bold text-foreground mt-1 mb-6">{tf("title")}</h1>
      <PruefungForm tz={tz} nowDefault={nowDatetimeLocal(tz)} initialCode={effectiveCode} initialKommentar={kommentar} sealRequired={sealRequired} mobileDesktopMode={dbUser?.mobileDesktopUpload ?? false} />
    </div>
  );
}
