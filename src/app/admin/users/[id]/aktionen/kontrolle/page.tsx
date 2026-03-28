import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import KontrolleForm from "./KontrolleForm";

export default async function AdminKontrollePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== "admin") redirect("/login");

  const { id } = await params;

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) redirect("/admin");

  const latest = await prisma.entry.findFirst({
    where: { userId: id, type: { in: ["VERSCHLUSS", "OEFFNEN"] } },
    orderBy: { startTime: "desc" },
    select: { type: true },
  });

  const isLocked = latest?.type === "VERSCHLUSS";
  const hasEmail = !!user.email;

  if (!hasEmail || !isLocked) {
    redirect(`/admin/users/${id}/aktionen`);
  }

  return <KontrolleForm userId={id} />;
}
