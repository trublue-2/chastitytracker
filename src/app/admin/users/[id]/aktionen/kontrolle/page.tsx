import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { assertAdmin } from "@/lib/authGuards";
import { getIsLocked } from "@/lib/queries";
import KontrolleForm from "./KontrolleForm";

export default async function AdminKontrollePage({ params }: { params: Promise<{ id: string }> }) {
  await assertAdmin();

  const { id } = await params;

  const [user, isLocked] = await Promise.all([
    prisma.user.findUnique({ where: { id } }),
    getIsLocked(id),
  ]);
  if (!user) redirect("/admin");
  if (!user.email || !isLocked) redirect(`/admin/users/${id}/aktionen`);

  return <KontrolleForm userId={id} />;
}
