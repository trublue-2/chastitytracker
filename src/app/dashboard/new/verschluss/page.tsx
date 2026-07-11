import Link from "next/link";
import VerschlussForm from "../../VerschlussForm";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getUserDeviceOptions, getIsLocked, getActiveSperrzeit, activeVerschlussAnforderungWhere, cleaningBlockReason } from "@/lib/queries";
import { bildersafeEnabled, heimdallEnabled } from "@/lib/constants";
import { nowDatetimeLocal, APP_TZ } from "@/lib/utils";

export default async function NewVerschlussPage() {
  const session = await auth();
  const userId = session!.user.id;
  const tz = session!.user.timezone ?? APP_TZ;
  const now = new Date();
  const heimdall = heimdallEnabled();

  const [isLocked, dbUser, devices, offeneAnforderung, boxes, sperre, latest] = await Promise.all([
    getIsLocked(userId),
    prisma.user.findUnique({ where: { id: userId }, select: { mobileDesktopUpload: true, reinigungErlaubt: true, reinigungsFenster: true } }),
    getUserDeviceOptions(userId),
    prisma.verschlussAnforderung.findFirst({
      where: { userId, art: "ANFORDERUNG", fulfilledAt: null, withdrawnAt: null, ...activeVerschlussAnforderungWhere() },
      select: { deviceId: true },
    }),
    heimdall ? prisma.boxStatus.findMany({ where: { userId }, select: { name: true } }) : Promise.resolve([]),
    heimdall ? getActiveSperrzeit(userId) : Promise.resolve(null),
    heimdall
      ? prisma.entry.findFirst({
          where: { userId, type: { in: ["VERSCHLUSS", "OEFFNEN"] } },
          orderBy: { startTime: "desc" },
          select: { type: true, oeffnenGrund: true },
        })
      : Promise.resolve(null),
  ]);

  if (isLocked) redirect("/dashboard");

  // Box-User (Heimdall aktiv + eigene Box): „Schlüssel ist in der Box"-Bestätigung statt Bildersafe.
  const boxConfirm = heimdall && boxes.length > 0;
  const boxName = boxes.map((b) => b.name).filter(Boolean).join(", ");
  // Reinigungs-Re-Lock: eine erlaubte Reinigungspause läuft (aktive Sperre + letzter Eintrag
  // OEFFNEN(Reinigung)) → leichte Variante (nur Bestätigung, kein Foto/Siegel/Gerät).
  //
  // Die Erlaubnis kommt aus `cleaningBlockReason` — derselben Quelle wie Durchsetzung, Strafbuch und
  // Öffnen-Dialog. Die frühere Handrechnung prüfte `aktivesReinigungsFenster(...) !== null` und wich
  // damit ab: ein Sub OHNE konfigurierte Fenster darf jederzeit reinigen, verlor hier aber den
  // leichten Re-Lock und musste jedes Mal durch den vollen Foto-Flow.
  const reinigungsPauseErlaubt =
    !!sperre &&
    cleaningBlockReason(
      { reinigungErlaubt: dbUser?.reinigungErlaubt ?? false, reinigungsFenster: dbUser?.reinigungsFenster, timezone: tz },
      [sperre],
      now,
    ) === null;
  const lightRelock =
    boxConfirm && reinigungsPauseErlaubt && latest?.type === "OEFFNEN" && latest.oeffnenGrund === "REINIGUNG";

  const tn = await getTranslations("newEntry");
  const tf = await getTranslations("lockForm");
  return (
    <div className="w-full max-w-2xl mx-auto px-4 py-6">
      <Link href="/dashboard" className="text-sm text-foreground-faint hover:text-foreground-muted transition">{tn("back")}</Link>
      <h1 className="text-xl font-bold text-foreground mt-1 mb-6">{tf("title")}</h1>
      <VerschlussForm
        tz={tz}
        nowDefault={nowDatetimeLocal(tz)}
        mobileDesktopMode={dbUser?.mobileDesktopUpload ?? false}
        devices={devices}
        anforderungDeviceId={offeneAnforderung?.deviceId ?? null}
        bildersafe={!boxConfirm && bildersafeEnabled()}
        boxConfirm={boxConfirm}
        boxName={boxName}
        lightRelock={lightRelock}
      />
    </div>
  );
}
