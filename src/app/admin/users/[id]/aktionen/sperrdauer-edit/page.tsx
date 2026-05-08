import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { assertAdmin } from "@/lib/authGuards";
import { getActiveSperrzeit } from "@/lib/queries";
import SperrdauerEditForm from "./SperrdauerEditForm";

export default async function AdminSperrdauerEditPage({ params }: { params: Promise<{ id: string }> }) {
  await assertAdmin();
  const { id } = await params;

  const [user, activeSperrzeit] = await Promise.all([
    prisma.user.findUnique({ where: { id }, select: { id: true } }),
    getActiveSperrzeit(id),
  ]);
  if (!user) redirect("/admin");
  if (!activeSperrzeit) redirect(`/admin/users/${id}/aktionen`);

  return (
    <SperrdauerEditForm
      userId={id}
      sperrzeitId={activeSperrzeit.id}
      endetAt={activeSperrzeit.endetAt}
      nachricht={activeSperrzeit.nachricht}
    />
  );
}
