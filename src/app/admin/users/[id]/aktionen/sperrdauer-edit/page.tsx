import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { assertKeyholderOrAdmin } from "@/lib/authGuards";
import { getActiveSperrzeit, getUserTimezone } from "@/lib/queries";
import SperrdauerEditForm from "./SperrdauerEditForm";

export default async function AdminSperrdauerEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await assertKeyholderOrAdmin(id);

  const [user, activeSperrzeit, tz] = await Promise.all([
    prisma.user.findUnique({ where: { id }, select: { id: true } }),
    getActiveSperrzeit(id),
    getUserTimezone(id),
  ]);
  if (!user) redirect("/admin");
  if (!activeSperrzeit) redirect(`/admin/users/${id}/aktionen`);

  return (
    <SperrdauerEditForm
      userId={id}
      sperrzeitId={activeSperrzeit.id}
      endetAt={activeSperrzeit.endetAt}
      nachricht={activeSperrzeit.nachricht}
      tz={tz}
    />
  );
}
