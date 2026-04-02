import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { assertAdmin } from "@/lib/authGuards";
import VerschlussAnforderungForm from "./VerschlussAnforderungForm";

export default async function AdminVerschlussAnforderungPage({ params }: { params: Promise<{ id: string }> }) {
  await assertAdmin();

  const { id } = await params;

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) redirect("/admin");

  const now = new Date();

  const [latest, offeneAnforderung, activeSperrzeit] = await Promise.all([
    prisma.entry.findFirst({
      where: { userId: id, type: { in: ["VERSCHLUSS", "OEFFNEN"] } },
      orderBy: { startTime: "desc" },
      select: { type: true },
    }),
    prisma.verschlussAnforderung.findFirst({
      where: { userId: id, art: "ANFORDERUNG", fulfilledAt: null, withdrawnAt: null },
    }),
    prisma.verschlussAnforderung.findFirst({
      where: { userId: id, art: "SPERRZEIT", withdrawnAt: null, OR: [{ endetAt: { gt: now } }, { endetAt: null }] },
    }),
  ]);

  const isLocked = latest?.type === "VERSCHLUSS";
  const hasEmail = !!user.email;
  const hasOffeneAnforderung = !!offeneAnforderung;
  const hasActiveSperrzeit = !!activeSperrzeit;

  const art = isLocked ? "SPERRZEIT" : "ANFORDERUNG";
  const canSubmit = art === "ANFORDERUNG"
    ? (!isLocked && hasEmail && !hasOffeneAnforderung)
    : (isLocked && !hasActiveSperrzeit);

  if (!canSubmit) {
    redirect(`/admin/users/${id}/aktionen`);
  }

  return <VerschlussAnforderungForm userId={id} art={art} />;
}
