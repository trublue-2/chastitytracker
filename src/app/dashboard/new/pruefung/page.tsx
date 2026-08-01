import Link from "next/link";
import PruefungForm from "../../PruefungForm";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sealRequiredForCode, inspectionCodeRequired } from "@/lib/kontrolleService";
import { generateKontrollCode } from "@/lib/utils";
import { getLatestKgEntry, getBoxFormContext } from "@/lib/queries";
import { getTranslations } from "next-intl/server";
import { nowDatetimeLocal, APP_TZ } from "@/lib/utils";

export default async function NewPruefungPage({ searchParams }: { searchParams: Promise<{ code?: string; kommentar?: string }> }) {
  const [{ code, kommentar }, session] = await Promise.all([searchParams, auth()]);
  const userId = session?.user?.id;
  const tz = session?.user?.timezone ?? APP_TZ;

  const [dbUser, latest, box] = await Promise.all([
    userId ? prisma.user.findUnique({ where: { id: userId }, select: { mobileDesktopUpload: true } }) : null,
    userId ? getLatestKgEntry(userId) : null,
    // Box-User: die Kontrolle verlangt zusätzlich ein Foto durchs Sichtfenster — der Nachweis,
    // dass der Schlüssel seit dem Einschliessen drin GEBLIEBEN ist.
    userId ? getBoxFormContext(userId) : null,
  ]);

  // Angeforderter Code (Mail-Link) hat Vorrang; sonst bekommt die Selbstkontrolle bei aktivem
  // Verschluss einen frischen Zufallscode (Frische-Beweis statt wiederverwendbarem Siegel-Foto).
  // Bei aktivem Siegel prüft die Verifikation die Siegel-Nummer zusätzlich (Server-seitig).
  const isLocked = latest?.type === "VERSCHLUSS";
  // Verlangt das getragene Gerät überhaupt einen Code? Wenn nicht, wird auch für die Selbstkontrolle
  // KEINER gewürfelt — das Formular fragte sonst nach einer Zahl, die die Anforderung nicht hat und
  // die niemand prüft.
  const codeRequired = await inspectionCodeRequired(isLocked ? latest.deviceId : null);
  const effectiveCode = codeRequired ? (code || (isLocked ? generateKontrollCode() : undefined)) : undefined;
  const sealRequired = sealRequiredForCode(effectiveCode, latest ?? null, codeRequired);
  const tn = await getTranslations("newEntry");
  const tf = await getTranslations("inspectionForm");
  return (
    <div className="w-full max-w-2xl mx-auto px-4 py-6">
      <Link href="/dashboard" className="text-sm text-foreground-faint hover:text-foreground-muted transition">{tn("back")}</Link>
      <h1 className="text-xl font-bold text-foreground mt-1 mb-6">{tf("title")}</h1>
      <PruefungForm tz={tz} nowDefault={nowDatetimeLocal(tz)} initialCode={effectiveCode} initialKommentar={kommentar} sealRequired={sealRequired} codeRequired={codeRequired} mobileDesktopMode={dbUser?.mobileDesktopUpload ?? false} boxConfirm={box?.boxConfirm ?? false} />
    </div>
  );
}
