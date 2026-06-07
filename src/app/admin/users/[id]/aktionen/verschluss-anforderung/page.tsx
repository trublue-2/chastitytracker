import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { assertKeyholderOrAdmin } from "@/lib/authGuards";
import { getUserDeviceOptions, getIsLocked, getActiveSperrzeit } from "@/lib/queries";
import VerschlussAnforderungForm from "./VerschlussAnforderungForm";

export default async function AdminVerschlussAnforderungPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await assertKeyholderOrAdmin(id);

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) redirect("/admin");

  const [isLocked, offeneAnforderung, activeSperrzeit, devices] = await Promise.all([
    getIsLocked(id),
    prisma.verschlussAnforderung.findFirst({
      where: { userId: id, art: "ANFORDERUNG", fulfilledAt: null, withdrawnAt: null },
    }),
    getActiveSperrzeit(id),
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
