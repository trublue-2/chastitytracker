import Link from "next/link";
import VerschlussForm from "../../VerschlussForm";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

export default async function NewVerschlussPage() {
  const session = await auth();
  const userId = session!.user.id;

  const latest = await prisma.entry.findFirst({
    where: { userId, type: { in: ["VERSCHLUSS", "OEFFNEN"] } },
    orderBy: { startTime: "desc" },
  });

  if (latest?.type === "VERSCHLUSS") {
    redirect("/dashboard/new");
  }

  const tn = await getTranslations("newEntry");
  const tf = await getTranslations("lockForm");
  return (
    <div className="w-full max-w-5xl px-6 py-8">
      <Link href="/dashboard/new" className="text-sm text-foreground-faint hover:text-foreground-muted transition">{tn("back")}</Link>
      <h1 className="text-xl font-bold text-foreground mt-1 mb-8">{tf("title")}</h1>
      <div className="max-w-lg"><VerschlussForm /></div>
    </div>
  );
}
