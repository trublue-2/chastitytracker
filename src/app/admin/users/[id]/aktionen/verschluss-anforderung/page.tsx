import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { assertAdmin } from "@/lib/authGuards";
import { getUserDeviceOptions, getIsLocked } from "@/lib/queries";
import VerschlussAnforderungForm from "./VerschlussAnforderungForm";

export default async function AdminVerschlussAnforderungPage({ params }: { params: Promise<{ id: string }> }) {
  await assertAdmin();

  const { id } = await params;

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) redirect("/admin");

  const now = new Date();

  const [isLocked, offeneAnforderung, activeSperrzeit, devices] = await Promise.all([
    getIsLocked(id),
    prisma.verschlussAnforderung.findFirst({
      where: { userId: id, art: "ANFORDERUNG", fulfilledAt: null, withdrawnAt: null },
    }),
    prisma.verschlussAnforderung.findFirst({
      where: { userId: id, art: "SPERRZEIT", withdrawnAt: null, OR: [{ endetAt: { gt: now } }, { endetAt: null }] },
    }),
    getUserDeviceOptions(id),
  ]);

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

  return <VerschlussAnforderungForm userId={id} art={art} devices={devices} />;
}
