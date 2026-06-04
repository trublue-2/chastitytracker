import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { assertAdmin } from "@/lib/authGuards";
import OrgasmusAnforderungForm from "./OrgasmusAnforderungForm";

export default async function AdminOrgasmusAnforderungPage({ params }: { params: Promise<{ id: string }> }) {
  await assertAdmin();

  const { id } = await params;

  const user = await prisma.user.findUnique({ where: { id }, select: { id: true } });
  if (!user) redirect("/admin");

  return <OrgasmusAnforderungForm userId={id} />;
}
