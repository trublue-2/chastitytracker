import { prisma } from "@/lib/prisma";
import { assertAdmin } from "@/lib/authGuards";
import OeffnenForm from "./OeffnenForm";

export default async function AdminOeffnenPage({ params }: { params: Promise<{ id: string }> }) {
  await assertAdmin();

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
