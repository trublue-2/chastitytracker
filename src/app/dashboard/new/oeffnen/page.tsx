import Link from "next/link";
import OeffnenForm from "../../OeffnenForm";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

export default async function NewOeffnenPage() {
  const session = await auth();
  const userId = session!.user.id;

  const latest = await prisma.entry.findFirst({
    where: { userId, type: { in: ["VERSCHLUSS", "OEFFNEN"] } },
    orderBy: { startTime: "desc" },
  });

  if (!latest || latest.type !== "VERSCHLUSS") {
    redirect("/dashboard/new");
  }

  const now = new Date();
  const activeSperrzeit = await prisma.verschlussAnforderung.findFirst({
    where: { userId, art: "SPERRZEIT", withdrawnAt: null, OR: [{ endetAt: { gt: now } }, { endetAt: null }] },
  });

  const tn = await getTranslations("newEntry");
  const tf = await getTranslations("openForm");

  return (
    <div className="w-full max-w-5xl px-6 py-8">
      <Link href="/dashboard/new" className="text-sm text-gray-400 hover:text-gray-600 transition">{tn("back")}</Link>
      <h1 className="text-xl font-bold text-gray-900 mt-1 mb-8">{tf("title")}</h1>
      <div className="max-w-lg">
        <OeffnenForm
          sperrzeitEndetAt={activeSperrzeit?.endetAt?.toISOString() ?? null}
          sperrzeitUnbefristet={!!activeSperrzeit && activeSperrzeit.endetAt === null}
        />
      </div>
    </div>
  );
}
