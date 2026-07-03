import Link from "next/link";
import OeffnenForm from "../../OeffnenForm";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getIsLocked, getActiveSperrzeit } from "@/lib/queries";
import { midnightInTZ, APP_TZ } from "@/lib/utils";

export default async function NewOeffnenPage() {
  const session = await auth();
  const userId = session!.user.id;
  const tz = session!.user.timezone ?? APP_TZ;

  if (!(await getIsLocked(userId))) redirect("/dashboard");

  // „pro Tag" = Kalendertag (des Users), nicht rollendes 24h-Fenster — sonst zählt eine Öffnung von
  // gestern Abend heute noch mit und löst eine falsche Limit-Warnung aus. Muss zur
  // Strafbuch-Ableitung (buildStrafbuch, ebenfalls Kalendertag) passen.
  const dayStart = midnightInTZ(new Date(), tz);
  const [activeSperrzeit, user, reinigungHeute] = await Promise.all([
    getActiveSperrzeit(userId),
    prisma.user.findUnique({ where: { id: userId }, select: { reinigungErlaubt: true, reinigungMaxMinuten: true, reinigungMaxProTag: true } }),
    prisma.entry.count({ where: { userId, type: "OEFFNEN", oeffnenGrund: "REINIGUNG", startTime: { gte: dayStart } } }),
  ]);

  const tn = await getTranslations("newEntry");
  const tf = await getTranslations("openForm");

  return (
    <div className="w-full max-w-2xl mx-auto px-4 py-6">
      <Link href="/dashboard" className="text-sm text-foreground-faint hover:text-foreground-muted transition">{tn("back")}</Link>
      <h1 className="text-xl font-bold text-foreground mt-1 mb-6">{tf("title")}</h1>
      <OeffnenForm
        sperrzeit={{
          endetAt: activeSperrzeit?.endetAt?.toISOString() ?? null,
          unbefristet: !!activeSperrzeit && activeSperrzeit.endetAt === null,
          reinigungErlaubt: activeSperrzeit?.reinigungErlaubt ?? false,
        }}
        reinigung={{
          erlaubt: user?.reinigungErlaubt ?? false,
          maxMinuten: user?.reinigungMaxMinuten ?? 15,
          maxProTag: user?.reinigungMaxProTag ?? 0,
          heuteAnzahl: reinigungHeute,
        }}
      />
    </div>
  );
}
