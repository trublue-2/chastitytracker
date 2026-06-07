import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { assertKeyholderOrAdmin } from "@/lib/authGuards";
import { getIsLocked } from "@/lib/queries";
import KontrolleForm from "./KontrolleForm";

export default async function AdminKontrollePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await assertKeyholderOrAdmin(id);

  const [user, isLocked] = await Promise.all([
    prisma.user.findUnique({ where: { id } }),
    getIsLocked(id),
  ]);
  if (!user) redirect("/admin");
  if (!user.email || !isLocked) redirect(`/admin/users/${id}/aktionen`);

  return <KontrolleForm userId={id} />;
}
