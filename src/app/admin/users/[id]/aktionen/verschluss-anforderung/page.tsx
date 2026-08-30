import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { assertKeyholderOrAdmin } from "@/lib/authGuards";
import { getUserDeviceOptions, getIsLocked, getActiveLockPeriod, getUserTimezone } from "@/lib/queries";
import { nowDatetimeLocal } from "@/lib/utils";
import VerschlussAnforderungForm from "./VerschlussAnforderungForm";

export default async function AdminVerschlussAnforderungPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await assertKeyholderOrAdmin(id);

  const user = await prisma.user.findUnique({ where: { id }, select: { id: true } });
  if (!user) redirect("/admin");

  const [isLocked, activeLockPeriod, devices, tz] = await Promise.all([
    getIsLocked(id),
    getActiveLockPeriod(id),
    getUserDeviceOptions(id),
    getUserTimezone(id),
  ]);

  const art = isLocked ? "SPERRZEIT" : "ANFORDERUNG";
  // Mehrere offene Anforderungen sind erlaubt, und eine E-Mail verlangt die Anforderung nicht
  // (Begründung im Dienst). Exklusiv ist allein die SPERRZEIT.
  if (isLocked && activeLockPeriod) redirect(`/admin/users/${id}/aktionen`);

  return <VerschlussAnforderungForm userId={id} art={art} devices={devices} tz={tz} minNow={nowDatetimeLocal(tz)} />;
}
