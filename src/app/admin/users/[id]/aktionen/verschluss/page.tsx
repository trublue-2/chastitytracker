import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { assertAdmin } from "@/lib/authGuards";
import { getUserDeviceOptions } from "@/lib/queries";
import VerschlussForm from "./VerschlussForm";

export default async function AdminVerschlussPage({ params }: { params: Promise<{ id: string }> }) {
  await assertAdmin();

  const { id } = await params;

  const [latest, devices] = await Promise.all([
    prisma.entry.findFirst({
      where: { userId: id, type: { in: ["VERSCHLUSS", "OEFFNEN"] } },
      orderBy: { startTime: "desc" },
      select: { type: true },
    }),
    getUserDeviceOptions(id),
  ]);

  if (latest?.type === "VERSCHLUSS") {
    redirect(`/admin/users/${id}/aktionen`);
  }

  return <VerschlussForm userId={id} devices={devices} />;
}
