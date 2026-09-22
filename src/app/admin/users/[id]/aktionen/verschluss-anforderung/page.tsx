import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { assertKeyholderOrAdmin } from "@/lib/authGuards";
import { getUserDeviceOptions, getIsLocked, getUserTimezone } from "@/lib/queries";
import { subLockPeriodCached } from "@/lib/dashboardData";
import { nowDatetimeLocal } from "@/lib/utils";
import { resolveLockFormArt } from "@/lib/lockRequestPlanning";
import VerschlussAnforderungForm from "./VerschlussAnforderungForm";

export default async function AdminVerschlussAnforderungPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ mode?: string | string[] }>;
}) {
  const [{ id }, { mode }] = await Promise.all([params, searchParams]);
  await assertKeyholderOrAdmin(id);

  const user = await prisma.user.findUnique({ where: { id }, select: { id: true } });
  if (!user) redirect("/admin");

  const [isLocked, activeLockPeriod, devices, tz] = await Promise.all([
    getIsLocked(id),
    subLockPeriodCached(id),
    getUserDeviceOptions(id),
    getUserTimezone(id),
  ]);

  const art = resolveLockFormArt(isLocked, mode);
  // Mehrere offene Anforderungen sind erlaubt, und eine E-Mail verlangt die Anforderung nicht
  // (Begründung im Dienst). Exklusiv ist allein die SPERRZEIT — nur für sie gilt die Umleitung.
  if (art === "SPERRZEIT" && activeLockPeriod) redirect(`/admin/users/${id}/aktionen`);

  return (
    <VerschlussAnforderungForm
      userId={id} art={art} scheduleOnly={isLocked && art === "ANFORDERUNG"} devices={devices} tz={tz} minNow={nowDatetimeLocal(tz)}
    />
  );
}
