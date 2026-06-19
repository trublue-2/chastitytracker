import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { bildersafeEnabled } from "@/lib/constants";
import { isCodePhotoRevealed } from "@/lib/queries";
import CodeAnzeigen from "./CodeAnzeigen";

export default async function ShowBildersafeCodePage() {
  const session = await auth();
  const userId = session!.user.id;
  if (!bildersafeEnabled()) redirect("/dashboard");

  // Aktueller Verschluss = jüngster VERSCHLUSS/OEFFNEN, der ein VERSCHLUSS ist.
  const latest = await prisma.entry.findFirst({
    where: { userId, type: { in: ["VERSCHLUSS", "OEFFNEN"] } },
    orderBy: { startTime: "desc" },
    select: { id: true, type: true, startTime: true, codeImageUrl: true },
  });

  const tn = await getTranslations("newEntry");
  const isLocked = latest?.type === "VERSCHLUSS";
  const hasCode = isLocked && !!latest?.codeImageUrl;
  const revealed = hasCode ? await isCodePhotoRevealed({ userId, startTime: latest!.startTime }) : false;

  return (
    <div className="w-full max-w-2xl mx-auto px-4 py-6">
      <Link href="/dashboard" className="text-sm text-foreground-faint hover:text-foreground-muted transition">{tn("back")}</Link>
      <h1 className="text-xl font-bold text-foreground mt-1 mb-6">{tn("bildersafeShowTitle")}</h1>
      <CodeAnzeigen
        isLocked={!!isLocked}
        codeImageUrl={hasCode ? latest!.codeImageUrl! : null}
        revealed={revealed}
      />
    </div>
  );
}
