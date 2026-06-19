import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getIsLocked } from "@/lib/queries";
import { bildersafeEnabled } from "@/lib/constants";
import BildersafeSealForm from "./BildersafeSealForm";

export default async function NewBildersafePage() {
  const session = await auth();
  const userId = session!.user.id;
  if (!bildersafeEnabled()) redirect("/dashboard");

  const [isLocked, dbUser] = await Promise.all([
    getIsLocked(userId),
    prisma.user.findUnique({ where: { id: userId }, select: { mobileDesktopUpload: true } }),
  ]);
  // Versiegeln nur im verschlossenen Zustand (das Code-Foto hängt am aktuellen Verschluss).
  if (!isLocked) redirect("/dashboard");

  const tn = await getTranslations("newEntry");
  return (
    <div className="w-full max-w-2xl mx-auto px-4 py-6">
      <Link href="/dashboard" className="text-sm text-foreground-faint hover:text-foreground-muted transition">{tn("back")}</Link>
      <h1 className="text-xl font-bold text-foreground mt-1 mb-2">{tn("bildersafeTitle")}</h1>
      <p className="text-sm text-foreground-muted mb-6">{tn("bildersafeSubtitle")}</p>
      <BildersafeSealForm mobileDesktopMode={dbUser?.mobileDesktopUpload ?? false} />
    </div>
  );
}
