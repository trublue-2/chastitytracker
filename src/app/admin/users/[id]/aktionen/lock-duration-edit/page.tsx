import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { assertKeyholderOrAdmin } from "@/lib/authGuards";
import { getUserTimezone } from "@/lib/queries";
import { subLockPeriodCached } from "@/lib/dashboardData";
import { nowDatetimeLocal } from "@/lib/utils";
import LockDurationEditForm from "./LockDurationEditForm";

export default async function AdminLockDurationEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await assertKeyholderOrAdmin(id);

  const [user, activeLockPeriod, tz] = await Promise.all([
    prisma.user.findUnique({ where: { id }, select: { id: true } }),
    subLockPeriodCached(id),
    getUserTimezone(id),
  ]);
  if (!user) redirect("/admin");
  if (!activeLockPeriod) redirect(`/admin/users/${id}/aktionen`);

  return (
    <LockDurationEditForm
      userId={id}
      lockPeriodId={activeLockPeriod.id}
      endsAt={activeLockPeriod.endsAt}
      message={activeLockPeriod.message}
      tz={tz}
      minNow={nowDatetimeLocal(tz)}
    />
  );
}
