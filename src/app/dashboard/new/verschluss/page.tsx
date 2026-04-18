import Link from "next/link";
import VerschlussForm from "../../VerschlussForm";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getUserDeviceOptions, getIsLocked } from "@/lib/queries";

export default async function NewVerschlussPage() {
  const session = await auth();
  const userId = session!.user.id;

  const [isLocked, dbUser, devices, offeneAnforderung] = await Promise.all([
    getIsLocked(userId),
    prisma.user.findUnique({ where: { id: userId }, select: { mobileDesktopUpload: true } }),
    getUserDeviceOptions(userId),
    prisma.verschlussAnforderung.findFirst({
      where: { userId, art: "ANFORDERUNG", fulfilledAt: null, withdrawnAt: null },
      select: { deviceId: true },
    }),
  ]);

  if (isLocked) redirect("/dashboard/new");

  const tn = await getTranslations("newEntry");
  const tf = await getTranslations("lockForm");
  return (
    <div className="w-full max-w-2xl mx-auto px-4 py-6">
      <Link href="/dashboard/new" className="text-sm text-foreground-faint hover:text-foreground-muted transition">{tn("back")}</Link>
      <h1 className="text-xl font-bold text-foreground mt-1 mb-6">{tf("title")}</h1>
      <VerschlussForm
        mobileDesktopMode={dbUser?.mobileDesktopUpload ?? false}
        devices={devices}
        anforderungDeviceId={offeneAnforderung?.deviceId ?? null}
      />
    </div>
  );
}
