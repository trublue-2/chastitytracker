import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { assertKeyholderOrAdmin } from "@/lib/authGuards";
import { getUserDeviceOptions, getIsLocked, getActiveSperrzeit, getUserTimezone } from "@/lib/queries";
import { nowDatetimeLocal } from "@/lib/utils";
import VerschlussAnforderungForm from "./VerschlussAnforderungForm";

export default async function AdminVerschlussAnforderungPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await assertKeyholderOrAdmin(id);

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) redirect("/admin");

  const [isLocked, activeSperrzeit, devices, tz] = await Promise.all([
    getIsLocked(id),
    getActiveSperrzeit(id),
    getUserDeviceOptions(id),
    getUserTimezone(id),
  ]);

  const hasEmail = !!user.email;
  const hasActiveSperrzeit = !!activeSperrzeit;

  const art = isLocked ? "SPERRZEIT" : "ANFORDERUNG";
  // Mehrere offene Anforderungen sind erlaubt — kein Gate darauf. Die SPERRZEIT bleibt exklusiv.
  const canSubmit = art === "ANFORDERUNG"
    ? (!isLocked && hasEmail)
    : (isLocked && !hasActiveSperrzeit);

  if (!canSubmit) {
    redirect(`/admin/users/${id}/aktionen`);
  }

  return <VerschlussAnforderungForm userId={id} art={art} devices={devices} tz={tz} minNow={nowDatetimeLocal(tz)} />;
}
