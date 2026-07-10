import Link from "next/link";
import OeffnenForm from "../../OeffnenForm";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getIsLocked, getActiveSperrzeit } from "@/lib/queries";
import { nowDatetimeLocal, APP_TZ } from "@/lib/utils";
import { effectiveOeffnenGruende, resolveReasonList } from "@/lib/reasonsService";
import { reinigungVerbrauchtHeute, nextReinigungsFenster } from "@/lib/reinigungService";
import { boxHoldOutlook } from "@/lib/boxOpenOutlook";

export default async function NewOeffnenPage() {
  const session = await auth();
  const userId = session!.user.id;
  const tz = session!.user.timezone ?? APP_TZ;

  if (!(await getIsLocked(userId))) redirect("/dashboard");

  const now = new Date();
  // Tages-Zählung über `reinigungVerbrauchtHeute` — dieselbe Kalendertag-Regel wie die
  // Strafbuch-Ableitung (buildStrafbuch), statt sie hier ein zweites Mal auszuformulieren.
  const [activeSperrzeit, user, reinigungHeute, box] = await Promise.all([
    getActiveSperrzeit(userId),
    prisma.user.findUnique({ where: { id: userId }, select: { reinigungErlaubt: true, reinigungMaxMinuten: true, reinigungMaxProTag: true, reinigungsFenster: true, oeffnenGruendeConfig: true } }),
    reinigungVerbrauchtHeute(userId, now, tz),
    // Die Selbstauskunft der Box: ihre eigene Frist.
    prisma.boxStatus.findFirst({ where: { userId }, orderBy: { name: "asc" }, select: { lockUntil: true } }),
  ]);

  // Das Urteil fällt hier, nicht im Client: der Server kennt die Sub-Zeitzone und hat EINE Uhr.
  // Rechnete der Client mit `new Date()` nach, flackerte die Karte an der Fristgrenze zwischen
  // Server-Render und Hydration. `box.lockUntil` ist die Selbstauskunft der Box — nicht das
  // Sperrzeit-Ende, das sie erst beim nächsten Sync einfaltet.
  const boxHold = boxHoldOutlook({
    sperrzeit: activeSperrzeit ? { endetAt: activeSperrzeit.endetAt?.toISOString() ?? null, unbefristet: activeSperrzeit.endetAt === null } : null,
    box: box ? { lockUntil: box.lockUntil?.toISOString() ?? null } : null,
    now,
  });

  const tn = await getTranslations("newEntry");
  const tf = await getTranslations("openForm");
  const grundOptions = resolveReasonList(effectiveOeffnenGruende(user?.oeffnenGruendeConfig), "opening", tf);

  return (
    <div className="w-full max-w-2xl mx-auto px-4 py-6">
      <Link href="/dashboard" className="text-sm text-foreground-faint hover:text-foreground-muted transition">{tn("back")}</Link>
      <h1 className="text-xl font-bold text-foreground mt-1 mb-6">{tf("title")}</h1>
      <OeffnenForm
        grundOptions={grundOptions}
        tz={tz}
        nowDefault={nowDatetimeLocal(tz)}
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
          nextWindow: nextReinigungsFenster(user?.reinigungsFenster, now, tz),
        }}
        boxHold={boxHold}
      />
    </div>
  );
}
