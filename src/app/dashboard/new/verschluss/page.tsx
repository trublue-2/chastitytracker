import Link from "next/link";
import VerschlussForm from "../../VerschlussForm";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getUserDeviceOptions, getIsLocked, activeVerschlussAnforderungWhere } from "@/lib/queries";
import { bildersafeEnabled, heimdallEnabled } from "@/lib/constants";
import { nowDatetimeLocal, APP_TZ } from "@/lib/utils";

export default async function NewVerschlussPage() {
  const session = await auth();
  const userId = session!.user.id;
  const tz = session!.user.timezone ?? APP_TZ;
  const heimdall = heimdallEnabled();

  const [isLocked, dbUser, devices, offeneAnforderung, boxes] = await Promise.all([
    getIsLocked(userId),
    prisma.user.findUnique({ where: { id: userId }, select: { mobileDesktopUpload: true } }),
    getUserDeviceOptions(userId),
    prisma.verschlussAnforderung.findFirst({
      where: { userId, art: "ANFORDERUNG", fulfilledAt: null, withdrawnAt: null, ...activeVerschlussAnforderungWhere() },
      select: { deviceId: true },
    }),
    heimdall ? prisma.boxStatus.findMany({ where: { userId }, select: { name: true } }) : Promise.resolve([]),
  ]);

  if (isLocked) redirect("/dashboard");

  // Box-User (Heimdall aktiv + eigene Box): „Schlüssel ist in der Box"-Bestätigung statt Bildersafe.
  const boxConfirm = heimdall && boxes.length > 0;
  const boxName = boxes.map((b) => b.name).filter(Boolean).join(", ");

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
      />
    </div>
  );
}
