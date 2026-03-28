import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import OeffnenForm from "./OeffnenForm";

export default async function AdminOeffnenPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== "admin") redirect("/login");

  const { id } = await params;

  const latest = await prisma.entry.findFirst({
    where: { userId: id, type: { in: ["VERSCHLUSS", "OEFFNEN"] } },
    orderBy: { startTime: "desc" },
    select: { type: true },
  });

  if (!latest || latest.type !== "VERSCHLUSS") {
    redirect(`/admin/users/${id}/aktionen`);
  }

  return <OeffnenForm userId={id} />;
}
